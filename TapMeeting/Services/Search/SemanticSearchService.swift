import Foundation
import Supabase

final class SemanticSearchService {
    private let client: SupabaseClient
    private let embeddingService: EmbeddingService
    private let telemetry: SearchTelemetryService
    private let session = URLSession(configuration: .default)

    init(client: SupabaseClient, embeddingService: EmbeddingService, telemetry: SearchTelemetryService) {
        self.client = client
        self.embeddingService = embeddingService
        self.telemetry = telemetry
    }

    func search(
        query: String,
        sourceFilters: [SearchSourceType] = SearchSourceType.allCases
    ) async throws -> SemanticSearchResponse {
        let vector = try await embeddingService.embed(text: query)
        let rows = try await callHybridRPC(
            query: query,
            embedding: vector,
            sourceFilters: sourceFilters
        )

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
            "results": "\(deduped.count)"
        ])

        return SemanticSearchResponse(
            query: query,
            results: deduped,
            citations: citations
        )
    }

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
            let key = "\(item.sourceType.rawValue)::\(item.sourceId)"
            if seen.contains(key) { continue }
            seen.insert(key)
            output.append(item)
        }
        return output
    }

    private func callHybridRPC(
        query: String,
        embedding: [Double],
        sourceFilters: [SearchSourceType]
    ) async throws -> [HybridSearchRow] {
        let url = URL(string: "\(Constants.Supabase.url)/rest/v1/rpc/hybrid_search_documents")!
        let authSession = try await client.auth.session
        let token = authSession.accessToken

        let payload: [String: Any] = [
            "query_text": query,
            "query_embedding": vectorString(embedding),
            "match_count": Constants.Search.maxSearchResults,
            "source_filters": sourceFilters.map(\.rawValue),
            "min_semantic_score": 0.45
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Constants.Supabase.anonKey, forHTTPHeaderField: "apikey")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AIProxyError.apiError("Invalid semantic RPC response")
        }
        guard (200...299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw AIProxyError.apiError("Hybrid search failed (\(http.statusCode)): \(body)")
        }

        let decoder = JSONDecoder()
        return try decoder.decode([HybridSearchRow].self, from: data)
    }

    private func vectorString(_ values: [Double]) -> String {
        let joined = values.map { String(format: "%.8f", $0) }.joined(separator: ",")
        return "[\(joined)]"
    }
}

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
