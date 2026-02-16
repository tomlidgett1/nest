import Foundation

final class SemanticChatService {
    private let searchService: SemanticSearchService
    private let telemetry: SearchTelemetryService

    init(searchService: SemanticSearchService, telemetry: SearchTelemetryService) {
        self.searchService = searchService
        self.telemetry = telemetry
    }

    // MARK: - Streaming Response

    /// Performs retrieval then returns citations + an async stream of text deltas.
    /// The caller should append an empty assistant message, then feed deltas into it.
    func respondStreaming(
        to query: String,
        conversationHistory: [SemanticChatMessage] = []
    ) async throws -> (citations: [SemanticCitation], stream: AsyncStream<String>) {
        let intent = detectIntent(query)
        let retrieval = try await searchService.search(query: query)
        let personHint = targetPersonName(from: query.lowercased())
        var evidence = buildEvidenceBlocks(from: retrieval.results, for: query)
        var citations = retrieval.citations
        var fallbackUsed = false

        if let personHint, evidence.isEmpty {
            fallbackUsed = true
            for fallback in [personHint, "highlights from \(personHint)", "emails from \(personHint)", "mentions of \(personHint)"] {
                let retry = try await searchService.search(query: fallback)
                let retryEvidence = buildEvidenceBlocks(from: retry.results, for: query)
                if !retryEvidence.isEmpty {
                    evidence = retryEvidence
                    if !retry.citations.isEmpty { citations = retry.citations }
                    break
                }
            }
        }

        if evidence.isEmpty {
            evidence = buildEvidenceBlocksWithoutPersonConstraint(from: retrieval.results)
        }

        guard !evidence.isEmpty else {
            let refusal = AsyncStream<String> { cont in
                cont.yield("I couldn't find grounded highlights in your indexed data yet. Try re-running backfill or asking for a specific source and time window.")
                cont.finish()
            }
            return (citations, refusal)
        }

        let body = buildStreamingRequestBody(
            query: query,
            intent: intent,
            evidence: evidence,
            personHint: personHint,
            fallbackUsed: fallbackUsed,
            conversationHistory: conversationHistory
        )

        telemetry.track(event: "semantic_chat_response", fields: [
            "intent": intent.rawValue,
            "citations": "\(citations.count)",
            "evidence_blocks": "\(evidence.count)",
            "fallback_used": "\(fallbackUsed)"
        ])

        let (bytes, _) = try await AIProxyClient.shared.stream(
            provider: .openai,
            endpoint: "/v1/responses",
            body: body
        )
        
        let stream = makeSSEStream(from: bytes)
        return (citations, stream)
    }

    // MARK: - Non-streaming (kept as fallback)

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

    // MARK: - Request Building

    private func buildStreamingRequestBody(
        query: String,
        intent: SemanticIntent,
        evidence: [EvidenceBlock],
        personHint: String?,
        fallbackUsed: Bool,
        conversationHistory: [SemanticChatMessage]
    ) -> [String: Any] {
        let context = evidence.enumerated().map { index, block in
            """
            [\(index + 1)] \(block.title)
            Source: \(block.sourceType)
            Details: \(block.text)
            """
        }.joined(separator: "\n\n")

        let instructions = """
        You are Nest's grounded semantic assistant.
        Use only the provided evidence blocks.
        Every factual claim must map to at least one citation index.
        Never give generic advice or template text when the user asks for concrete highlights.
        If person-specific evidence is weak or missing, give the closest grounded highlights and clearly state that exact person attribution is uncertain.
        Prefer concrete details: names, actions, decisions, dates, numbers.
        Use Australian English.
        You have access to the conversation history below. Use it to understand follow-up questions, pronouns like "they/he/she/it/that", and to avoid repeating yourself.
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
        Person hint: \(personHint ?? "none")
        Fallback retrieval used: \(fallbackUsed)

        Cited context (from semantic search):
        \(context)

        Return direct, concrete details with inline references like [1], [2].
        Do not return vague summaries.
        If the user is asking a follow-up, use conversation history to resolve references.
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
        if lower.contains("draft email") || lower.contains("reply") || lower.contains("send") {
            return .draftEmail
        }
        if lower.contains("follow up") || lower.contains("todo") || lower.contains("action item") {
            return .createFollowUp
        }
        return .answerQuestion
    }

    // MARK: - Evidence Building

    private func buildEvidenceBlocks(from results: [SearchDocumentCandidate], for query: String) -> [EvidenceBlock] {
        let cleanedQuery = query.lowercased()
        let personHint = targetPersonName(from: cleanedQuery)

        let mapped = results.prefix(12).compactMap { result -> EvidenceBlock? in
            let body = (result.chunkText ?? result.summaryText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !body.isEmpty else { return nil }
            return EvidenceBlock(
                sourceType: result.sourceType.displayName,
                title: result.title ?? result.sourceType.displayName,
                text: String(body.prefix(900))
            )
        }

        guard let personHint else { return mapped }

        let filtered = mapped.filter { block in
            let content = normaliseForNameMatch("\(block.title) \(block.text)")
            let target = normaliseForNameMatch(personHint)
            return content.contains(target) || content.contains(String(target.prefix(3)))
        }
        return filtered.isEmpty ? [] : filtered
    }

    private func buildEvidenceBlocksWithoutPersonConstraint(from results: [SearchDocumentCandidate]) -> [EvidenceBlock] {
        results.prefix(8).compactMap { result in
            let body = (result.chunkText ?? result.summaryText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !body.isEmpty else { return nil }
            return EvidenceBlock(
                sourceType: result.sourceType.displayName,
                title: result.title ?? result.sourceType.displayName,
                text: String(body.prefix(900))
            )
        }
    }

    // MARK: - Helpers

    private func targetPersonName(from lowercasedQuery: String) -> String? {
        if let range = lowercasedQuery.range(of: "from ") {
            let tail = lowercasedQuery[range.upperBound...]
            let token = tail.split(separator: " ").first.map(String.init)
            if let token, token.count >= 3 { return token }
        }
        if let range = lowercasedQuery.range(of: "about ") {
            let tail = lowercasedQuery[range.upperBound...]
            let token = tail.split(separator: " ").first.map(String.init)
            if let token, token.count >= 3 { return token }
        }
        return nil
    }

    private func normaliseForNameMatch(_ value: String) -> String {
        value
            .folding(options: .diacriticInsensitive, locale: .current)
            .lowercased()
            .replacingOccurrences(of: "[^a-z0-9\\s]", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

// MARK: - Private Models

private struct SSEEvent: Decodable {
    let type: String
    let delta: String?
}

private struct EvidenceBlock {
    let sourceType: String
    let title: String
    let text: String
}
