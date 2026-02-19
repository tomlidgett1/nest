import Foundation
import Supabase

final class SemanticSearchService {
    private let client: SupabaseClient
    private let embeddingService: EmbeddingService
    private let telemetry: SearchTelemetryService

    /// URLSession with a 15-second timeout to avoid hanging on slow DB queries.
    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 20
        return URLSession(configuration: config)
    }()

    init(client: SupabaseClient, embeddingService: EmbeddingService, telemetry: SearchTelemetryService) {
        self.client = client
        self.embeddingService = embeddingService
        self.telemetry = telemetry
    }

    // MARK: - Search

    func search(
        query: String,
        sourceFilters: [SearchSourceType] = SearchSourceType.allCases
    ) async throws -> SemanticSearchResponse {
        let embeddingStart = Date()
        let vector = try await embeddingService.embed(text: query)
        let embeddingMs = Int(Date().timeIntervalSince(embeddingStart) * 1000)

        let searchStart = Date()
        var usedFallback = false

        // Try hybrid search first, fall back to pure semantic if it times out
        let rows: [HybridSearchRow]
        do {
            rows = try await callHybridRPC(
                query: query,
                embedding: vector,
                sourceFilters: sourceFilters
            )
        } catch {
            let message = error.localizedDescription.lowercased()
            let isTimeout = message.contains("timeout") || message.contains("57014") || message.contains("timed out")
            let isServerError = message.contains("500") || message.contains("502") || message.contains("503")

            if isTimeout || isServerError {
                telemetry.recordError(
                    component: "search_rpc",
                    message: "Hybrid search failed, falling back to semantic-only: \(error.localizedDescription)",
                    context: ["query": query]
                )
                rows = try await callSemanticFallbackRPC(embedding: vector, sourceFilters: sourceFilters)
                usedFallback = true
            } else {
                throw error
            }
        }

        let searchMs = Int(Date().timeIntervalSince(searchStart) * 1000)

        let mapped = rows.map {
            SearchDocumentCandidate(
                id: $0.document_id,
                sourceType: SearchSourceType(rawValue: $0.source_type) ?? .noteSummary,
                sourceId: $0.source_id,
                title: $0.title,
                summaryText: $0.summary_text,
                chunkText: $0.chunk_text,
                metadata: $0.metadata ?? [:],
                semanticScore: $0.semantic_score,
                lexicalScore: $0.lexical_score,
                fusedScore: $0.fused_score
            )
        }

        let deduped = dedupeAndRerank(mapped)
        let citations = deduped.prefix(Constants.Search.maxSearchResults).map { candidate in
            SemanticCitation(
                sourceType: candidate.sourceType,
                sourceId: candidate.sourceId,
                title: candidate.title ?? candidate.sourceType.displayName,
                snippet: (candidate.chunkText ?? candidate.summaryText ?? "").prefix(220).description
            )
        }

        telemetry.track(event: "semantic_search", fields: [
            "query_length": "\(query.count)",
            "results": "\(deduped.count)",
            "embedding_ms": "\(embeddingMs)",
            "search_ms": "\(searchMs)",
            "fallback": usedFallback ? "true" : "false"
        ])

        return SemanticSearchResponse(
            query: query,
            results: deduped,
            citations: citations,
            embeddingLatencyMs: embeddingMs,
            searchLatencyMs: searchMs
        )
    }

    // MARK: - Dedup + Rerank

    private func dedupeAndRerank(_ candidates: [SearchDocumentCandidate]) -> [SearchDocumentCandidate] {
        var seen = Set<String>()
        let sorted = candidates.sorted { lhs, rhs in
            if lhs.fusedScore == rhs.fusedScore {
                return lhs.semanticScore > rhs.semanticScore
            }
            return lhs.fusedScore > rhs.fusedScore
        }

        var output: [SearchDocumentCandidate] = []
        for item in sorted {
            if seen.contains(item.id.uuidString) { continue }
            seen.insert(item.id.uuidString)
            output.append(item)
        }
        return output
    }

    // MARK: - Supabase RPC

    /// Primary search: hybrid (semantic + lexical with RRF).
    private func callHybridRPC(
        query: String,
        embedding: [Double],
        sourceFilters: [SearchSourceType]
    ) async throws -> [HybridSearchRow] {
        let payload: [String: Any] = [
            "query_text": query,
            "query_embedding": vectorString(embedding),
            "match_count": 20,
            "source_filters": sourceFilters.map(\.rawValue),
            "min_semantic_score": 0.28
        ]
        return try await callRPC(function: "hybrid_search_documents", payload: payload)
    }

    /// Fallback search: pure semantic (faster, no lexical CTE or FULL OUTER JOIN).
    private func callSemanticFallbackRPC(
        embedding: [Double],
        sourceFilters: [SearchSourceType]
    ) async throws -> [HybridSearchRow] {
        let payload: [String: Any] = [
            "query_embedding": vectorString(embedding),
            "match_count": 20,
            "source_filters": sourceFilters.map(\.rawValue),
            "min_score": 0.28
        ]

        struct SemanticOnlyRow: Decodable {
            let document_id: UUID
            let source_type: String
            let source_id: String
            let title: String?
            let summary_text: String?
            let chunk_text: String?
            let metadata: [String: String]?
            let semantic_score: Double
        }

        let semanticRows: [SemanticOnlyRow] = try await callRPC(function: "match_search_documents", payload: payload)

        return semanticRows.map {
            HybridSearchRow(
                document_id: $0.document_id,
                source_type: $0.source_type,
                source_id: $0.source_id,
                title: $0.title,
                summary_text: $0.summary_text,
                chunk_text: $0.chunk_text,
                metadata: $0.metadata,
                semantic_score: $0.semantic_score,
                lexical_score: 0,
                fused_score: $0.semantic_score
            )
        }
    }

    /// Generic RPC caller with auth, timeout, and error handling.
    private func callRPC<T: Decodable>(function: String, payload: [String: Any]) async throws -> [T] {
        let url = URL(string: "\(Constants.Supabase.url)/rest/v1/rpc/\(function)")!
        let authSession = try await client.auth.session
        let token = authSession.accessToken

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Constants.Supabase.anonKey, forHTTPHeaderField: "apikey")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AIProxyError.apiError("Invalid RPC response from \(function)")
        }
        guard (200...299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            telemetry.recordError(component: "search_rpc", message: "HTTP \(http.statusCode): \(body)", context: ["function": function])
            throw AIProxyError.apiError("\(function) failed (\(http.statusCode)): \(body)")
        }

        return try JSONDecoder().decode([T].self, from: data)
    }

    private func vectorString(_ values: [Double]) -> String {
        let joined = values.map { String(format: "%.8f", $0) }.joined(separator: ",")
        return "[\(joined)]"
    }
}

// MARK: - RPC Response

private struct HybridSearchRow: Decodable {
    let document_id: UUID
    let source_type: String
    let source_id: String
    let title: String?
    let summary_text: String?
    let chunk_text: String?
    let metadata: [String: String]?
    let semantic_score: Double
    let lexical_score: Double
    let fused_score: Double
}
