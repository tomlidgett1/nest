import Foundation

/// Chat-specific wrapper around `SearchQueryPipeline`.
///
/// Handles:
///   - Building the Nest LLM prompt with conversation history
///   - Streaming the LLM response via SSE
///   - Telemetry recording for chat queries
///
/// All retrieval intelligence (query enrichment, sub-queries, LLM rewriting,
/// temporal resolution, dedup, MMR, evidence building, agentic fallback)
/// lives in `SearchQueryPipeline` and is shared with every AI feature.
final class SemanticChatService {
    private let pipeline: SearchQueryPipeline
    private let telemetry: SearchTelemetryService

    init(pipeline: SearchQueryPipeline, telemetry: SearchTelemetryService) {
        self.pipeline = pipeline
        self.telemetry = telemetry
    }

    // MARK: - Streaming Response

    func respondStreaming(
        to query: String,
        conversationHistory: [SemanticChatMessage] = []
    ) async throws -> (citations: [SemanticCitation], stream: AsyncStream<String>) {

        // Run the shared pipeline to get evidence
        let pipelineResult = try await pipeline.execute(
            query: query,
            options: .init(conversationHistory: conversationHistory)
        )

        let evidence = pipelineResult.evidence
        let meta = pipelineResult.metadata

        guard !evidence.isEmpty else {
            let refusal = AsyncStream<String> { cont in
                cont.yield("I couldn't find relevant information in your indexed data. Try asking about a specific meeting, email, or note, or check the Pipeline dashboard to verify your content is indexed.")
                cont.finish()
            }

            recordQueryEvent(
                rawQuery: query, meta: meta, results: pipelineResult.allResults,
                evidence: [], llmModel: "", llmMs: 0, responsePreview: "(refused)",
                didRefuse: true
            )

            return (pipelineResult.citations, refusal)
        }

        // Build the LLM request
        let body = buildStreamingRequestBody(
            query: query,
            enrichedQuery: meta.enrichedQuery,
            intent: meta.intent,
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
            rawQuery: query, meta: meta, results: pipelineResult.allResults,
            evidence: evidence, llmModel: Constants.AI.semanticChatModel, llmMs: llmMs,
            responsePreview: "(streaming)", didRefuse: false
        )

        return (pipelineResult.citations, stream)
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
        2. Do NOT include citation numbers like [1], [2], [3] in your response. Write clean prose without any bracketed references.
        3. Prefer concrete details: names, actions, decisions, dates, numbers.
        4. If evidence is insufficient, say so honestly in one sentence — don't guess.
        5. Weight higher-scored evidence blocks more heavily.
        6. Use Australian English.
        7. Use conversation history to resolve pronouns ("they", "it", "that") and avoid repeating yourself.

        TEMPORAL AWARENESS:
        - Some evidence blocks labelled "Calendar Event (Live)" are injected from the live calendar — these are authoritative for schedule questions.
        - For questions about "today", "tomorrow", "this week", etc. prioritise these live blocks.
        - When listing events, include the **time**, **title**, and **attendees** for each.

        APPROACH:
        Identify the most relevant evidence blocks, then give a crisp, structured answer. Never include citation numbers.
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

        Answer concisely using bullet points. Do not include citation numbers. Be brief.
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

    // MARK: - Telemetry

    private func recordQueryEvent(
        rawQuery: String,
        meta: SearchQueryPipeline.PipelineMetadata,
        results: [SearchDocumentCandidate],
        evidence: [EvidenceBlock],
        llmModel: String,
        llmMs: Int,
        responsePreview: String,
        didRefuse: Bool
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

        var event = QueryEvent(
            timestamp: .now,
            rawQuery: rawQuery,
            enrichedQuery: meta.enrichedQuery != rawQuery ? meta.enrichedQuery : nil,
            subQueries: meta.subQueries,
            embeddingLatencyMs: 0,
            searchLatencyMs: meta.searchLatencyMs,
            resultCount: results.count,
            results: queryResults,
            evidenceBlockCount: evidence.count,
            evidenceBlocks: evidenceEntries,
            llmModel: llmModel,
            llmInputTokenEstimate: evidence.reduce(0) { $0 + $1.text.count / 4 },
            llmLatencyMs: llmMs,
            responsePreview: responsePreview,
            didRefuse: didRefuse,
            fallbackUsed: meta.retrievalRounds > 1,
            retrievalRounds: meta.retrievalRounds
        )
        if let plan = meta.queryPlan {
            event.queryPlanSources = plan.sources
            event.queryPlanIntent = plan.intent
        }
        telemetry.recordQuery(event)
    }
}

// MARK: - Private Models

private struct SSEEvent: Decodable {
    let type: String
    let delta: String?
}
