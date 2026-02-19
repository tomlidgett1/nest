import Foundation
import Supabase

@Observable
final class SearchIngestionService {
    private let client: SupabaseClient
    private let embeddingService: EmbeddingService
    private let encryptionService: EmailEncryptionService
    private let telemetry: SearchTelemetryService

    private(set) var backfillStatus: SearchBackfillStatus = .idle
    var isChatbotReady: Bool { backfillStatus.stage == .completed && backfillStatus.progressPercent >= 100 }

    init(
        client: SupabaseClient,
        embeddingService: EmbeddingService,
        encryptionService: EmailEncryptionService,
        telemetry: SearchTelemetryService
    ) {
        self.client = client
        self.embeddingService = embeddingService
        self.encryptionService = encryptionService
        self.telemetry = telemetry
    }

    // MARK: - Backfill

    /// A note bundled with its pre-fetched transcript utterances (must be loaded on the main actor).
    struct NoteWithTranscript {
        let note: Note
        let utterances: [Utterance]
    }

    func runMandatoryBackfill(
        notes: [NoteWithTranscript],
        threads: [GmailThread],
        calendarEvents: [CalendarEvent]
    ) async {
        let lastVersion = UserDefaults.standard.string(forKey: Constants.Defaults.lastBackfillChunkingVersion)
        let versionChanged = lastVersion != Constants.Search.chunkingVersion
        let hasCompleted = UserDefaults.standard.bool(forKey: Constants.Defaults.hasCompletedSemanticBackfill)

        if hasCompleted && !versionChanged {
            backfillStatus = SearchBackfillStatus(stage: .completed, progressPercent: 100, processedCount: 1, totalCount: 1, lastError: nil)
            return
        }

        let total = max(1, notes.count + threads.count + calendarEvents.count)
        backfillStatus = SearchBackfillStatus(stage: .indexing, progressPercent: 0, processedCount: 0, totalCount: total, lastError: nil)
        await writeJobStatus(type: "backfill", status: "running")

        // Ensure the Supabase session is fresh before starting (avoids "not authenticated" on first items)
        _ = try? await client.auth.session

        var failedCount = 0

        for item in notes {
            do {
                try await indexNote(item.note)
                if !item.utterances.isEmpty {
                    try await indexTranscript(for: item.note, utterances: item.utterances)
                }
            } catch {
                failedCount += 1
                telemetry.recordError(
                    component: "backfill",
                    message: error.localizedDescription,
                    context: ["source": "note", "title": item.note.title]
                )
            }
            advanceBackfill()
        }

        for thread in threads {
            do {
                try await indexEmailThread(thread)
            } catch {
                failedCount += 1
                telemetry.recordError(
                    component: "backfill",
                    message: error.localizedDescription,
                    context: ["source": "email", "thread_id": thread.id, "subject": thread.subject]
                )
            }
            advanceBackfill()
        }

        for event in calendarEvents {
            do {
                try await indexCalendarEvent(event)
            } catch {
                failedCount += 1
                telemetry.recordError(
                    component: "backfill",
                    message: error.localizedDescription,
                    context: ["source": "calendar", "event_id": event.id, "title": event.title]
                )
            }
            advanceBackfill()
        }

        // Mark as completed even if some items failed — prevents restart loops.
        // Individual failures are logged to the error log for inspection.
        backfillStatus.stage = .completed
        backfillStatus.progressPercent = 100
        if failedCount > 0 {
            backfillStatus.lastError = "\(failedCount) of \(total) items failed — see error log"
        }
        UserDefaults.standard.set(true, forKey: Constants.Defaults.hasCompletedSemanticBackfill)
        UserDefaults.standard.set(Constants.Search.chunkingVersion, forKey: Constants.Defaults.lastBackfillChunkingVersion)
        await writeJobStatus(type: "backfill", status: failedCount > 0 ? "completed_with_errors" : "completed",
                             errorMessage: failedCount > 0 ? "\(failedCount) items failed" : nil)
        await refreshIndexCounts()
    }

    /// Clears the backfill flag so the next call to `runMandatoryBackfill` re-indexes everything.
    func triggerReindex() {
        UserDefaults.standard.set(false, forKey: Constants.Defaults.hasCompletedSemanticBackfill)
        UserDefaults.standard.removeObject(forKey: Constants.Defaults.lastBackfillChunkingVersion)
        backfillStatus = .idle
    }

    // MARK: - Index Individual Sources

    func indexNote(_ note: Note) async throws {
        let start = Date()
        let summaryText = buildNoteSummary(note)
        let chunks = sentenceAwareChunks(from: [note.rawNotes, note.enhancedNotes ?? ""])
        let contextHeader = "Note: \(note.title) | Type: \(note.noteTypeRaw)"

        let docIds = try await withRetry {
            try await replaceDocuments(
                sourceType: .noteSummary,
                sourceId: note.id.uuidString,
                title: note.title,
                summaryText: summaryText,
                chunks: chunks,
                contextHeader: contextHeader,
                metadata: [
                    "note_id": note.id.uuidString,
                    "note_type": note.noteTypeRaw,
                "status": note.statusRaw
                ],
                chunkSourceType: .noteChunk
            )
        }

        telemetry.recordIngestion(IngestionEvent(
            timestamp: .now,
            sourceType: SearchSourceType.noteSummary.rawValue,
            sourceId: note.id.uuidString,
            title: note.title,
            chunksCreated: chunks.count,
            embeddingsGenerated: docIds.count,
            embeddingsCached: 0,
            latencyMs: Int(Date().timeIntervalSince(start) * 1000),
            chunkPreviews: chunks.map { String($0.prefix(120)) },
            documentIds: docIds,
            error: nil
        ))
    }

    func indexTranscript(for note: Note, utterances: [Utterance]) async throws {
        let start = Date()
        let contextHeader = "Transcript: \(note.title)"

        // Preserve speaker attribution in chunks (mic = "You", system = remote participants)
        let speakerText = utterances.map { utterance in
            return "[\(utterance.source.displayLabel)]: \(utterance.text)"
        }.joined(separator: "\n")

        let chunks = sentenceAwareChunks(from: [speakerText])

        let docIds = try await withRetry {
            try await replaceDocuments(
                sourceType: .utteranceChunk,
                sourceId: note.id.uuidString,
                title: note.title,
                summaryText: "Transcript for \(note.title)",
                chunks: chunks,
                contextHeader: contextHeader,
                metadata: ["note_id": note.id.uuidString],
                chunkSourceType: .utteranceChunk
            )
        }

        telemetry.recordIngestion(IngestionEvent(
            timestamp: .now,
            sourceType: SearchSourceType.utteranceChunk.rawValue,
            sourceId: note.id.uuidString,
            title: note.title,
            chunksCreated: chunks.count,
            embeddingsGenerated: docIds.count,
            embeddingsCached: 0,
            latencyMs: Int(Date().timeIntervalSince(start) * 1000),
            chunkPreviews: chunks.map { String($0.prefix(120)) },
            documentIds: docIds,
            error: nil
        ))
    }

    func indexEmailThread(_ thread: GmailThread) async throws {
        let start = Date()
        let threadSummary = buildThreadSummary(thread)
        let participants = thread.participantsSummary
        let contextHeader = "Email Thread: \(thread.subject) | Participants: \(participants)"

        // Chunk each message separately to preserve structure
        let messageTexts = thread.messages.map { msg in
            "From: \(msg.from)\nSubject: \(msg.subject)\n\(msg.bodyPlain)"
        }
        let chunks = sentenceAwareChunks(from: messageTexts)

        let docIds = try await withRetry {
            try await replaceDocuments(
                sourceType: .emailSummary,
                sourceId: thread.id,
                title: thread.subject,
                summaryText: threadSummary,
                chunks: chunks,
                contextHeader: contextHeader,
                metadata: [
                    "thread_id": thread.id,
                    "participants": participants
                ],
                chunkSourceType: .emailChunk
            )
        }

        try await withRetry { try await persistEncryptedMessages(thread.messages) }

        telemetry.recordIngestion(IngestionEvent(
            timestamp: .now,
            sourceType: SearchSourceType.emailSummary.rawValue,
            sourceId: thread.id,
            title: thread.subject,
            chunksCreated: chunks.count,
            embeddingsGenerated: docIds.count,
            embeddingsCached: 0,
            latencyMs: Int(Date().timeIntervalSince(start) * 1000),
            chunkPreviews: chunks.map { String($0.prefix(120)) },
            documentIds: docIds,
            error: nil
        ))
    }

    func indexCalendarEvent(_ event: CalendarEvent) async throws {
        let start = Date()
        let attendees = event.attendeeNames.joined(separator: ", ")
        let summary = "\(event.title) — \(event.formattedTime). Attendees: \(attendees)"
        let contextHeader = "Calendar Event: \(event.title) | \(event.formattedTime)"

        let docIds = try await withRetry {
            try await replaceDocuments(
                sourceType: .calendarSummary,
                sourceId: event.id,
                title: event.title,
                summaryText: summary,
                chunks: [],
                contextHeader: contextHeader,
                metadata: [
                    "event_id": event.id,
                    "start": ISO8601DateFormatter().string(from: event.startDate),
                    "end": ISO8601DateFormatter().string(from: event.endDate),
                    "attendees": attendees
                ],
                chunkSourceType: .calendarSummary
            )
        }

        telemetry.recordIngestion(IngestionEvent(
            timestamp: .now,
            sourceType: SearchSourceType.calendarSummary.rawValue,
            sourceId: event.id,
            title: event.title,
            chunksCreated: 0,
            embeddingsGenerated: docIds.count,
            embeddingsCached: 0,
            latencyMs: Int(Date().timeIntervalSince(start) * 1000),
            chunkPreviews: [],
            documentIds: docIds,
            error: nil
        ))
    }

    // MARK: - Index Counts

    func refreshIndexCounts() async {
        do {
            struct DocRow: Decodable { let source_type: String }

            let docs: [DocRow] = try await client
                .from("search_documents")
                .select("source_type")
                .eq("is_deleted", value: false)
                .execute()
                .value

            var byType: [String: Int] = [:]
            for doc in docs {
                byType[doc.source_type, default: 0] += 1
            }

            let counts = IndexCounts(
                totalDocuments: docs.count,
                totalEmbeddings: docs.count,
                bySourceType: byType,
                lastUpdated: .now
            )
            telemetry.updateIndexCounts(counts)
        } catch {
            // Non-critical — dashboard will show stale data
            telemetry.recordError(component: "index_counts", message: error.localizedDescription)
        }
    }

    // MARK: - Document Storage

    private func replaceDocuments(
        sourceType: SearchSourceType,
        sourceId: String,
        title: String,
        summaryText: String,
        chunks: [String],
        contextHeader: String,
        metadata: [String: String],
        chunkSourceType: SearchSourceType
    ) async throws -> [UUID] {
        let userId = try await currentUserId()

        // Soft-delete existing documents for this source
        try await client
            .from("search_documents")
            .update(SearchDocumentDeletePatch(is_deleted: true))
            .eq("source_type", value: sourceType.rawValue)
            .eq("source_id", value: sourceId)
            .execute()

        // Also soft-delete existing chunks
        if chunkSourceType != sourceType {
            try await client
                .from("search_documents")
                .update(SearchDocumentDeletePatch(is_deleted: true))
                .eq("source_type", value: chunkSourceType.rawValue)
                .eq("source_id", value: sourceId)
                .execute()
        }

        var docs: [SearchDocumentWrite] = []
        let summaryDocId = UUID()

        docs.append(
            SearchDocumentWrite(
                id: summaryDocId,
                user_id: userId,
                source_type: sourceType.rawValue,
                source_id: sourceId,
                parent_id: nil,
                title: title,
                summary_text: String(summaryText.prefix(Constants.Search.maxSummaryCharacters)),
                chunk_text: nil,
                metadata: metadata,
                token_count: estimateTokens(summaryText),
                content_hash: "\(Constants.Search.chunkingVersion):\(sourceType.rawValue):\(sourceId):summary",
                retention_policy: "retain_forever",
                is_deleted: false
            )
        )

        for (index, chunk) in chunks.enumerated() {
            docs.append(
                SearchDocumentWrite(
                    id: UUID(),
                    user_id: userId,
                    source_type: chunkSourceType.rawValue,
                    source_id: sourceId,
                    parent_id: summaryDocId,
                    title: title,
                    summary_text: nil,
                    chunk_text: chunk,
                    metadata: metadata.merging(["chunk_index": "\(index)"], uniquingKeysWith: { old, _ in old }),
                    token_count: estimateTokens(chunk),
                    content_hash: "\(Constants.Search.chunkingVersion):\(sourceType.rawValue):\(sourceId):chunk:\(index)",
                    retention_policy: "retain_forever",
                    is_deleted: false
                )
            )
        }

        try await client.from("search_documents").insert(docs).execute()

        // Batch embed all documents at once
        let textsToEmbed = docs.map { doc -> String in
            let sourceText = doc.summary_text ?? doc.chunk_text ?? ""
            guard !sourceText.isEmpty else { return "" }
            // Prepend contextual header for richer embeddings
            return "\(contextHeader)\n---\n\(sourceText)"
        }

        let vectors = try await embeddingService.embedBatch(texts: textsToEmbed)

        var docIds: [UUID] = []
        for (index, doc) in docs.enumerated() {
            let vector = vectors[index]
            guard !vector.isEmpty else { continue }

            let payload = SearchEmbeddingWrite(
                user_id: userId,
                document_id: doc.id,
                embedding: vectorString(vector),
                embedding_model: Constants.AI.embeddingModel,
                model_version: "2024-01"
            )
            try await client.from("search_embeddings").insert(payload).execute()
            docIds.append(doc.id)
        }

        return docIds
    }

    // MARK: - Sentence-Aware Chunking

    /// Splits text into chunks that respect sentence boundaries with configurable overlap.
    func sentenceAwareChunks(from inputs: [String]) -> [String] {
        let text = inputs
            .joined(separator: "\n\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return [] }

        let maxChars = Constants.Search.maxChunkCharacters
        let overlap = Constants.Search.chunkOverlapCharacters
        let maxChunks = Constants.Search.maxChunksPerSource

        // Split into sentences (respecting common abbreviations)
        let sentences = splitIntoSentences(text)
        guard !sentences.isEmpty else { return [String(text.prefix(maxChars))] }

        var chunks: [String] = []
        var currentChunk = ""
        var overlapBuffer: [String] = [] // Sentences to carry over for overlap

        for sentence in sentences {
            let trimmed = sentence.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }

            let candidate = currentChunk.isEmpty ? trimmed : "\(currentChunk) \(trimmed)"

            if candidate.count <= maxChars {
                currentChunk = candidate
                overlapBuffer.append(trimmed)
            } else {
                // Current chunk is full — save it
                if !currentChunk.isEmpty {
                    chunks.append(currentChunk)
                    if chunks.count >= maxChunks { break }
                }

                // Build overlap from the tail of the previous chunk
                var overlapText = ""
                for sentence in overlapBuffer.reversed() {
                    let candidate = overlapText.isEmpty ? sentence : "\(sentence) \(overlapText)"
                    if candidate.count <= overlap {
                        overlapText = candidate
                    } else {
                        break
                    }
                }

                currentChunk = overlapText.isEmpty ? trimmed : "\(overlapText) \(trimmed)"
                overlapBuffer = [trimmed]

                // If single sentence exceeds maxChars, hard-split at word boundary
                if currentChunk.count > maxChars {
                    let hardChunks = hardSplitAtWordBoundary(currentChunk, maxChars: maxChars)
                    for hc in hardChunks {
                        chunks.append(hc)
                        if chunks.count >= maxChunks { break }
                    }
                    currentChunk = ""
                    overlapBuffer = []
                }
            }
        }

        // Don't forget the last chunk
        if !currentChunk.isEmpty && chunks.count < maxChunks {
            chunks.append(currentChunk)
        }

        return chunks
    }

    private func splitIntoSentences(_ text: String) -> [String] {
        // Use NSLinguisticTagger-style sentence detection via enumerateSubstrings
        var sentences: [String] = []
        text.enumerateSubstrings(in: text.startIndex..., options: [.bySentences, .localized]) { substring, _, _, _ in
            if let s = substring {
                sentences.append(s)
            }
        }
        // Fallback: if linguistic splitting found nothing, split by newlines
        if sentences.isEmpty {
            sentences = text.components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
        }
        return sentences
    }

    private func hardSplitAtWordBoundary(_ text: String, maxChars: Int) -> [String] {
        var result: [String] = []
        let words = text.split(separator: " ")
        var current = ""
        for word in words {
            let candidate = current.isEmpty ? String(word) : "\(current) \(word)"
            if candidate.count <= maxChars {
                current = candidate
            } else {
                if !current.isEmpty { result.append(current) }
                current = String(word)
            }
        }
        if !current.isEmpty { result.append(current) }
        return result
    }

    // MARK: - Summaries

    private func buildNoteSummary(_ note: Note) -> String {
        let base = note.enhancedNotes?.isEmpty == false ? note.enhancedNotes! : note.rawNotes
        // Take a meaningful excerpt: prefer the first meaningful section
        let lines = base.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        let joined = lines.prefix(30).joined(separator: "\n")
        return String(joined.prefix(Constants.Search.maxSummaryCharacters))
    }

    private func buildThreadSummary(_ thread: GmailThread) -> String {
        // Include all messages with sender attribution for better context
        let messages = thread.messages.suffix(6)
        let body = messages.map { "\($0.from): \($0.snippet)" }.joined(separator: "\n")
        return String(body.prefix(Constants.Search.maxSummaryCharacters))
    }

    // MARK: - Encrypted Email Storage

    private func persistEncryptedMessages(_ messages: [GmailMessage]) async throws {
        let userId = try await currentUserId()
        var payloads: [EmailMessageWrite] = []

        for message in messages {
            let encrypted = try encryptionService.encrypt(message.bodyPlain)
            payloads.append(
                EmailMessageWrite(
                    user_id: userId,
                    gmail_message_id: message.id,
                    thread_id: message.threadId,
                    history_id: nil,
                    subject: message.subject,
                    from_email: message.fromEmail,
                    to_emails: message.to,
                    cc_emails: message.cc,
                    label_ids: message.labelIds,
                    sent_at: message.date,
                    body_ciphertext: encrypted.ciphertext,
                    body_iv: encrypted.iv,
                    body_tag: encrypted.tag,
                    body_preview: String(message.snippet.prefix(160)),
                    last_synced_at: .now
                )
            )
        }

        guard !payloads.isEmpty else { return }
        try await client.from("email_messages").upsert(payloads, onConflict: "user_id,gmail_message_id").execute()
    }

    // MARK: - Retry

    /// Retries an async operation on transient server errors (502, 503, 504, timeouts).
    /// Uses exponential back-off: 0.5s → 1s → 2s.
    private func withRetry<T>(
        maxAttempts: Int = 3,
        _ operation: () async throws -> T
    ) async throws -> T {
        var lastError: Error?
        for attempt in 0..<maxAttempts {
            do {
                return try await operation()
            } catch {
                lastError = error
                guard attempt < maxAttempts - 1, isTransient(error) else { break }
                let delay = 0.5 * pow(2.0, Double(attempt))
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
        }
        throw lastError!
    }

    private func isTransient(_ error: Error) -> Bool {
        let message = error.localizedDescription.lowercased()
        let transientCodes = ["502", "503", "504", "500"]
        if transientCodes.contains(where: { message.contains("status code: \($0)") || message.contains($0) }) {
            return true
        }
        if message.contains("timed out") || message.contains("timeout") || message.contains("network connection was lost") {
            return true
        }
        return false
    }

    // MARK: - Helpers

    private func estimateTokens(_ text: String) -> Int {
        // ~4 characters per token for English text (conservative)
        max(1, text.count / 4)
    }

    private func vectorString(_ values: [Double]) -> String {
        let joined = values.map { String(format: "%.8f", $0) }.joined(separator: ",")
        return "[\(joined)]"
    }

    private func currentUserId() async throws -> UUID {
        let session = try await client.auth.session
        return session.user.id
    }

    private func advanceBackfill() {
        backfillStatus.processedCount += 1
        let ratio = Double(backfillStatus.processedCount) / Double(max(1, backfillStatus.totalCount))
        backfillStatus.progressPercent = min(100, ratio * 100)
        UserDefaults.standard.set(backfillStatus.progressPercent, forKey: Constants.Defaults.semanticBackfillProgress)
    }

    private func writeJobStatus(type: String, status: String, errorMessage: String? = nil) async {
        do {
            let userId = try await currentUserId()
            let row = SearchJobWrite(
                user_id: userId,
                job_type: type,
                status: status,
                source_type: nil,
                source_id: nil,
                progress_percent: backfillStatus.progressPercent,
                processed_count: backfillStatus.processedCount,
                total_count: backfillStatus.totalCount,
                error_message: errorMessage,
                started_at: status == "running" ? .now : nil,
                completed_at: (status == "completed" || status == "failed") ? .now : nil
            )
            try await client.from("search_jobs").insert(row).execute()
        } catch {
            telemetry.recordError(component: "job_status", message: error.localizedDescription)
        }
    }
}

// MARK: - Write Models

private struct SearchDocumentWrite: Codable {
    let id: UUID
    let user_id: UUID
    let source_type: String
    let source_id: String
    let parent_id: UUID?
    let title: String
    let summary_text: String?
    let chunk_text: String?
    let metadata: [String: String]
    let token_count: Int
    let content_hash: String
    let retention_policy: String
    let is_deleted: Bool
}

private struct SearchEmbeddingWrite: Codable {
    let user_id: UUID
    let document_id: UUID
    let embedding: String
    let embedding_model: String
    let model_version: String
}

private struct EmailMessageWrite: Codable {
    let user_id: UUID
    let gmail_message_id: String
    let thread_id: String
    let history_id: String?
    let subject: String
    let from_email: String
    let to_emails: [String]
    let cc_emails: [String]
    let label_ids: [String]
    let sent_at: Date
    let body_ciphertext: String
    let body_iv: String
    let body_tag: String
    let body_preview: String
    let last_synced_at: Date
}

private struct SearchJobWrite: Codable {
    let user_id: UUID
    let job_type: String
    let status: String
    let source_type: String?
    let source_id: String?
    let progress_percent: Double
    let processed_count: Int
    let total_count: Int
    let error_message: String?
    let started_at: Date?
    let completed_at: Date?
}

private struct SearchDocumentDeletePatch: Codable {
    let is_deleted: Bool
}
