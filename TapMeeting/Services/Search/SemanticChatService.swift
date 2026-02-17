import Foundation

final class SemanticChatService {
    private let searchService: SemanticSearchService
    private let telemetry: SearchTelemetryService

    init(searchService: SemanticSearchService, telemetry: SearchTelemetryService) {
        self.searchService = searchService
        self.telemetry = telemetry
    }

    // MARK: - Streaming Response

    func respondStreaming(
        to query: String,
        conversationHistory: [SemanticChatMessage] = []
    ) async throws -> (citations: [SemanticCitation], stream: AsyncStream<String>) {
        let intent = detectIntent(query)

        // Step 1: Enrich query using conversation history (coreference resolution)
        let enrichedQuery = enrichQuery(query, history: conversationHistory)

        // Step 2: Generate sub-queries for multi-query retrieval
        let subQueries = generateSubQueries(enrichedQuery, intent: intent)

        // Step 3: Execute all searches in parallel and merge results
        let searchStart = Date()
        var allResults: [SearchDocumentCandidate] = []
        var allCitations: [SemanticCitation] = []

        for searchQuery in subQueries {
            let retrieval = try await searchService.search(query: searchQuery)
            allResults.append(contentsOf: retrieval.results)
            allCitations.append(contentsOf: retrieval.citations)
        }
        let searchMs = Int(Date().timeIntervalSince(searchStart) * 1000)

        // Step 4: Deduplicate results across all sub-queries
        let dedupedResults = deduplicateResults(allResults)
        let dedupedCitations = deduplicateCitations(allCitations)

        // Step 5: Apply MMR for diversity (avoid duplicate evidence from same source)
        let diverseResults = applyMMR(dedupedResults, maxResults: Constants.Search.maxEvidenceBlocks * 2)

        // Step 6: Build evidence blocks
        var evidence = buildEvidenceBlocks(from: diverseResults)

        // Step 7: Agentic RAG — if evidence is too thin, try one more retrieval round
        var retrievalRounds = 1
        if evidence.count < 3 && !enrichedQuery.isEmpty {
            let fallbackQuery = "key highlights and details related to: \(enrichedQuery)"
            let fallbackRetrieval = try await searchService.search(query: fallbackQuery)
            let fallbackEvidence = buildEvidenceBlocks(from: fallbackRetrieval.results)
            if fallbackEvidence.count > evidence.count {
                evidence = fallbackEvidence
                allCitations.append(contentsOf: fallbackRetrieval.citations)
            }
            retrievalRounds = 2
        }

        guard !evidence.isEmpty else {
            let refusal = AsyncStream<String> { cont in
                cont.yield("I couldn't find relevant information in your indexed data. Try asking about a specific meeting, email, or note, or check the Pipeline dashboard to verify your content is indexed.")
                cont.finish()
            }

            recordQueryEvent(
                rawQuery: query, enrichedQuery: enrichedQuery, subQueries: subQueries,
                embeddingMs: 0, searchMs: searchMs, results: dedupedResults,
                evidence: [], llmModel: "", llmMs: 0, responsePreview: "(refused)",
                didRefuse: true, fallbackUsed: false, retrievalRounds: retrievalRounds
            )

            return (dedupedCitations, refusal)
        }

        // Step 8: Build the LLM request with temporal context
        let body = buildStreamingRequestBody(
            query: query,
            enrichedQuery: enrichedQuery,
            intent: intent,
            evidence: evidence,
            conversationHistory: conversationHistory
        )

        let llmStart = Date()
        let (bytes, _) = try await AIProxyClient.shared.stream(
            provider: .openai,
            endpoint: "/v1/responses",
            body: body
        )
        let llmMs = Int(Date().timeIntervalSince(llmStart) * 1000)

        let stream = makeSSEStream(from: bytes)

        recordQueryEvent(
            rawQuery: query, enrichedQuery: enrichedQuery, subQueries: subQueries,
            embeddingMs: 0, searchMs: searchMs, results: dedupedResults,
            evidence: evidence, llmModel: Constants.AI.semanticChatModel, llmMs: llmMs,
            responsePreview: "(streaming)", didRefuse: false, fallbackUsed: retrievalRounds > 1,
            retrievalRounds: retrievalRounds
        )

        return (dedupedCitations, stream)
    }

    // MARK: - Non-streaming Fallback

    func respond(
        to query: String,
        conversationHistory: [SemanticChatMessage] = []
    ) async throws -> SemanticChatResponse {
        let (citations, stream) = try await respondStreaming(to: query, conversationHistory: conversationHistory)
        var fullText = ""
        for await delta in stream { fullText += delta }
        let answer = fullText.isEmpty ? "I could not generate a grounded response." : fullText
        return SemanticChatResponse(answer: answer, citations: citations, didRefuse: false)
    }

    // MARK: - Query Enrichment

    /// Uses conversation history to resolve pronouns and coreferences.
    /// Example: User asks "What about their revenue?" after discussing Acme Corp
    /// → enriched to "What about Acme Corp's revenue?"
    private func enrichQuery(_ query: String, history: [SemanticChatMessage]) -> String {
        let recentHistory = history.suffix(6)
        guard !recentHistory.isEmpty else { return query }

        // Extract key topics from recent conversation
        var topics: [String] = []
        for message in recentHistory {
            if message.role == .assistant && !message.content.isEmpty {
                // Extract likely topic words from assistant's last answer
                let words = message.content.components(separatedBy: .whitespacesAndNewlines)
                    .filter { $0.count > 4 }
                    .prefix(10)
                topics.append(contentsOf: words.map { String($0) })
            }
        }

        // Check if the query contains pronouns/references that need resolution
        let pronounPatterns = ["they", "their", "them", "he", "she", "his", "her", "it", "its", "that", "this", "those", "these"]
        let queryLower = query.lowercased()
        let hasPronouns = pronounPatterns.contains { queryLower.contains($0) }

        if hasPronouns && !topics.isEmpty {
            // Prepend context from conversation
            let lastAssistantContent = recentHistory
                .last(where: { $0.role == .assistant })?
                .content ?? ""
            let contextHint = String(lastAssistantContent.prefix(200))
            return "Context: \(contextHint)\nQuery: \(query)"
        }

        return query
    }

    // MARK: - Multi-Query Generation

    /// Generates multiple search queries for better recall.
    /// For simple queries, returns just the original. For complex ones, adds reformulations.
    private func generateSubQueries(_ query: String, intent: SemanticIntent) -> [String] {
        var queries = [query]

        // For complex queries, add a reformulated version
        let words = query.split(separator: " ")
        if words.count > 5 {
            // Add a keyword-focused version (strip filler words)
            let stopWords: Set<String> = ["what", "when", "where", "who", "how", "did", "does", "the", "a", "an", "is", "was", "were", "are", "about", "from", "with", "for", "can", "you", "me", "my", "tell", "show", "give", "find", "get"]
            let keywords = words.filter { !stopWords.contains($0.lowercased()) }
            if keywords.count >= 2 {
                queries.append(keywords.joined(separator: " "))
            }
        }

        return queries
    }

    // MARK: - Deduplication

    private func deduplicateResults(_ results: [SearchDocumentCandidate]) -> [SearchDocumentCandidate] {
        var seen = Set<UUID>()
        return results.filter { candidate in
            guard !seen.contains(candidate.id) else { return false }
            seen.insert(candidate.id)
            return true
        }.sorted { $0.fusedScore > $1.fusedScore }
    }

    private func deduplicateCitations(_ citations: [SemanticCitation]) -> [SemanticCitation] {
        var seen = Set<String>()
        return citations.filter { citation in
            let key = "\(citation.sourceType.rawValue)::\(citation.sourceId)"
            guard !seen.contains(key) else { return false }
            seen.insert(key)
            return true
        }
    }

    // MARK: - MMR (Maximal Marginal Relevance)

    /// Ensures diversity in results by penalising documents from the same source.
    private func applyMMR(_ results: [SearchDocumentCandidate], maxResults: Int) -> [SearchDocumentCandidate] {
        guard results.count > maxResults else { return results }

        var selected: [SearchDocumentCandidate] = []
        var sourceCount: [String: Int] = [:]
        let diversityPenalty = 0.3

        let sorted = results.sorted { $0.fusedScore > $1.fusedScore }

        for candidate in sorted {
            guard selected.count < maxResults else { break }

            let sourceKey = "\(candidate.sourceType.rawValue)::\(candidate.sourceId)"
            let count = sourceCount[sourceKey, default: 0]

            // Allow up to 3 chunks from the same source, but with diminishing priority
            if count < 3 {
                let penalty = Double(count) * diversityPenalty
                let adjustedScore = candidate.fusedScore * (1.0 - penalty)
                // Still include it if the adjusted score is reasonable
                if adjustedScore > 0 || selected.count < 4 {
                    selected.append(candidate)
                    sourceCount[sourceKey] = count + 1
                }
            }
        }

        return selected
    }

    // MARK: - Evidence Building

    private func buildEvidenceBlocks(from results: [SearchDocumentCandidate]) -> [EvidenceBlock] {
        results.prefix(Constants.Search.maxEvidenceBlocks).compactMap { result in
            let body = (result.chunkText ?? result.summaryText ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !body.isEmpty else { return nil }
            return EvidenceBlock(
                sourceType: result.sourceType.displayName,
                title: result.title ?? result.sourceType.displayName,
                text: String(body.prefix(Constants.Search.maxEvidenceBlockCharacters)),
                semanticScore: result.semanticScore,
                sourceId: result.sourceId,
                documentId: result.id
            )
        }
    }

    // MARK: - Request Building

    private func buildStreamingRequestBody(
        query: String,
        enrichedQuery: String,
        intent: SemanticIntent,
        evidence: [EvidenceBlock],
        conversationHistory: [SemanticChatMessage]
    ) -> [String: Any] {
        let context = evidence.enumerated().map { index, block in
            """
            [\(index + 1)] \(block.title) — Relevance: \(String(format: "%.0f%%", block.semanticScore * 100))
            Source: \(block.sourceType) | ID: \(block.sourceId)
            Details: \(block.text)
            """
        }.joined(separator: "\n\n")

        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "EEEE, d MMMM yyyy 'at' HH:mm"
        dateFormatter.locale = Locale(identifier: "en_AU")
        let currentDate = dateFormatter.string(from: .now)

        let instructions = """
        You are Nest — a sharp, conversational assistant that helps the user recall their notes, meetings, emails, and calendar.
        Current date and time: \(currentDate).

        TONE & FORMAT:
        - Be conversational, warm, and concise — like a knowledgeable colleague.
        - Default to **bullet points** (using "- ") for any list, summary, or multi-part answer.
        - Use **bold** for names, dates, decisions, and key terms.
        - Keep answers short: aim for 2–5 bullet points. Only expand when the user asks for detail.
        - One short sentence of context before bullets is fine, but never ramble.
        - Use markdown headings (### ) only when grouping clearly distinct topics.
        - Never output walls of text. If the answer is one fact, just say it in one line.

        GROUNDING RULES:
        1. Use ONLY the provided evidence blocks. Never fabricate information.
        2. Cite evidence with inline references like [1], [2] at the end of the relevant bullet.
        3. Prefer concrete details: names, actions, decisions, dates, numbers.
        4. If evidence is insufficient, say so honestly in one sentence — don't guess.
        5. Weight higher-scored evidence blocks more heavily.
        6. Use Australian English.
        7. Use conversation history to resolve pronouns ("they", "it", "that") and avoid repeating yourself.

        APPROACH:
        Identify the most relevant evidence blocks, then give a crisp, structured answer.
        """

        let recentHistory = conversationHistory.suffix(10)
        let historyBlock: String
        if recentHistory.isEmpty {
            historyBlock = "(No prior conversation)"
        } else {
            historyBlock = recentHistory.map { msg in
                let role = msg.role == .user ? "User" : "Assistant"
                return "[\(role)] \(msg.content)"
            }.joined(separator: "\n")
        }

        let prompt = """
        Conversation so far:
        \(historyBlock)

        ---

        Current turn:
        Intent: \(intent.rawValue)
        User query: \(query)

        Cited context (from semantic search, ordered by relevance):
        \(context)

        Answer concisely using bullet points and inline references like [1], [2]. Be brief.
        """

        return [
            "model": Constants.AI.semanticChatModel,
            "instructions": instructions,
            "input": prompt,
            "max_output_tokens": Constants.AI.maxSemanticAnswerTokens,
            "store": false,
            "stream": true
        ]
    }

    // MARK: - SSE Stream

    private func makeSSEStream(from bytes: URLSession.AsyncBytes) -> AsyncStream<String> {
        AsyncStream { continuation in
            let task = Task {
                do {
                    for try await line in bytes.lines {
                        guard !Task.isCancelled else { break }
                        guard line.hasPrefix("data: ") else { continue }
                        let payload = String(line.dropFirst(6))
                        guard payload != "[DONE]" else { break }

                        guard let data = payload.data(using: .utf8),
                              let parsed = try? JSONDecoder().decode(SSEEvent.self, from: data),
                              parsed.type == "response.output_text.delta",
                              let delta = parsed.delta, !delta.isEmpty else {
                            continue
                        }
                        continuation.yield(delta)
                    }
                } catch {
                    // Stream interrupted — finish gracefully
                }
                continuation.finish()
            }

            continuation.onTermination = { _ in task.cancel() }
        }
    }

    // MARK: - Intent Detection

    private func detectIntent(_ query: String) -> SemanticIntent {
        let lower = query.lowercased()
        if lower.contains("draft email") || lower.contains("reply") || lower.contains("compose") {
            return .draftEmail
        }
        if lower.contains("follow up") || lower.contains("todo") || lower.contains("action item") || lower.contains("to-do") {
            return .createFollowUp
        }
        return .answerQuestion
    }

    // MARK: - Telemetry

    private func recordQueryEvent(
        rawQuery: String,
        enrichedQuery: String,
        subQueries: [String],
        embeddingMs: Int,
        searchMs: Int,
        results: [SearchDocumentCandidate],
        evidence: [EvidenceBlock],
        llmModel: String,
        llmMs: Int,
        responsePreview: String,
        didRefuse: Bool,
        fallbackUsed: Bool,
        retrievalRounds: Int
    ) {
        let queryResults = results.prefix(20).map { r in
            QueryResultEntry(
                documentId: r.id,
                sourceType: r.sourceType.rawValue,
                sourceId: r.sourceId,
                title: r.title,
                semanticScore: r.semanticScore,
                lexicalScore: r.lexicalScore,
                fusedScore: r.fusedScore,
                chunkPreview: String((r.chunkText ?? r.summaryText ?? "").prefix(150)),
                wasSelectedAsEvidence: evidence.contains { $0.documentId == r.id }
            )
        }

        let evidenceEntries = evidence.enumerated().map { i, block in
            EvidenceBlockEntry(
                index: i + 1,
                sourceType: block.sourceType,
                title: block.title,
                text: block.text,
                characterCount: block.text.count
            )
        }

        let event = QueryEvent(
            timestamp: .now,
            rawQuery: rawQuery,
            enrichedQuery: enrichedQuery != rawQuery ? enrichedQuery : nil,
            subQueries: subQueries,
            embeddingLatencyMs: embeddingMs,
            searchLatencyMs: searchMs,
            resultCount: results.count,
            results: queryResults,
            evidenceBlockCount: evidence.count,
            evidenceBlocks: evidenceEntries,
            llmModel: llmModel,
            llmInputTokenEstimate: evidence.reduce(0) { $0 + $1.text.count / 4 },
            llmLatencyMs: llmMs,
            responsePreview: responsePreview,
            didRefuse: didRefuse,
            fallbackUsed: fallbackUsed,
            retrievalRounds: retrievalRounds
        )
        telemetry.recordQuery(event)
    }
}

// MARK: - Private Models

private struct SSEEvent: Decodable {
    let type: String
    let delta: String?
}

struct EvidenceBlock {
    let sourceType: String
    let title: String
    let text: String
    let semanticScore: Double
    let sourceId: String
    let documentId: UUID
}
