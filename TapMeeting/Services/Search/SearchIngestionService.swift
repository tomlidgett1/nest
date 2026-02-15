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

    func runMandatoryBackfill(
        notes: [Note],
        threads: [GmailThread],
        calendarEvents: [CalendarEvent]
    ) async {
        if UserDefaults.standard.bool(forKey: Constants.Defaults.hasCompletedSemanticBackfill) {
            backfillStatus = SearchBackfillStatus(stage: .completed, progressPercent: 100, processedCount: 1, totalCount: 1, lastError: nil)
            return
        }

        let emailCutoff = Date.now.addingTimeInterval(-Double(Constants.Search.emailBackfillWindowHours) * 3600)
        let recentThreads = threads.filter { thread in
            guard let latest = thread.latestMessage?.date else { return false }
            return latest >= emailCutoff
        }

        let total = max(1, notes.count + recentThreads.count + calendarEvents.count)
        backfillStatus = SearchBackfillStatus(stage: .indexing, progressPercent: 0, processedCount: 0, totalCount: total, lastError: nil)
        await writeJobStatus(type: "backfill", status: "running")

        do {
            for note in notes {
                try await indexNote(note)
                advanceBackfill()
            }

            for thread in recentThreads {
                try await indexEmailThread(thread)
                advanceBackfill()
            }

            for event in calendarEvents {
                try await indexCalendarEvent(event)
                advanceBackfill()
            }

            backfillStatus.stage = .completed
            backfillStatus.progressPercent = 100
            UserDefaults.standard.set(true, forKey: Constants.Defaults.hasCompletedSemanticBackfill)
            await writeJobStatus(type: "backfill", status: "completed")
        } catch {
            backfillStatus.stage = .failed
            backfillStatus.lastError = error.localizedDescription
            await writeJobStatus(type: "backfill", status: "failed", errorMessage: error.localizedDescription)
            telemetry.track(event: "search_backfill_failed", fields: ["error": error.localizedDescription])
        }
    }

    func indexNote(_ note: Note) async throws {
        let summaryText = summariseNote(note)
        let chunks = selectiveChunks(from: [note.rawNotes, note.enhancedNotes ?? ""])
        try await replaceDocuments(
            sourceType: .noteSummary,
            sourceId: note.id.uuidString,
            title: note.title,
            summaryText: summaryText,
            chunks: chunks,
            metadata: [
                "note_id": note.id.uuidString,
                "note_type": note.noteTypeRaw,
                "status": note.statusRaw
            ],
            chunkSourceType: .noteChunk
        )
    }

    func indexTranscript(for note: Note, utterances: [Utterance]) async throws {
        let joined = utterances.map(\.text).joined(separator: " ")
        let chunks = selectiveChunks(from: [joined])
        try await replaceDocuments(
            sourceType: .utteranceChunk,
            sourceId: note.id.uuidString,
            title: note.title,
            summaryText: "Transcript for \(note.title)",
            chunks: chunks,
            metadata: ["note_id": note.id.uuidString],
            chunkSourceType: .utteranceChunk
        )
    }

    func indexEmailThread(_ thread: GmailThread) async throws {
        let threadSummary = summariseThread(thread)
        let chunks = selectiveChunks(from: thread.messages.map { "\($0.subject)\n\($0.bodyPlain)" })

        try await replaceDocuments(
            sourceType: .emailSummary,
            sourceId: thread.id,
            title: thread.subject,
            summaryText: threadSummary,
            chunks: chunks,
            metadata: [
                "thread_id": thread.id,
                "participants": thread.participantsSummary
            ],
            chunkSourceType: .emailChunk
        )

        try await persistEncryptedMessages(thread.messages)
    }

    func indexCalendarEvent(_ event: CalendarEvent) async throws {
        let summary = "\(event.title) from \(event.formattedTime). Attendees: \(event.attendeeNames.joined(separator: ", "))"
        try await replaceDocuments(
            sourceType: .calendarSummary,
            sourceId: event.id,
            title: event.title,
            summaryText: summary,
            chunks: [],
            metadata: [
                "event_id": event.id,
                "start": ISO8601DateFormatter().string(from: event.startDate),
                "end": ISO8601DateFormatter().string(from: event.endDate)
            ],
            chunkSourceType: .calendarSummary
        )
    }

    private func replaceDocuments(
        sourceType: SearchSourceType,
        sourceId: String,
        title: String,
        summaryText: String,
        chunks: [String],
        metadata: [String: String],
        chunkSourceType: SearchSourceType
    ) async throws {
        let userId = try await currentUserId()

        try await client
            .from("search_documents")
            .update(SearchDocumentDeletePatch(is_deleted: true))
            .eq("source_type", value: sourceType.rawValue)
            .eq("source_id", value: sourceId)
            .execute()

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
                token_count: summaryText.count / 4,
                content_hash: "\(sourceType.rawValue):\(sourceId):summary",
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
                    metadata: metadata.merging(["chunk_index": "\(index)"], uniquingKeysWith: { lhs, _ in lhs }),
                    token_count: chunk.count / 4,
                    content_hash: "\(sourceType.rawValue):\(sourceId):chunk:\(index)",
                    retention_policy: "retain_forever",
                    is_deleted: false
                )
            )
        }

        try await client.from("search_documents").insert(docs).execute()

        for doc in docs {
            let sourceText = doc.summary_text ?? doc.chunk_text ?? ""
            guard !sourceText.isEmpty else { continue }
            let vector = try await embeddingService.embed(text: sourceText)
            guard !vector.isEmpty else { continue }

            let payload = SearchEmbeddingWrite(
                user_id: userId,
                document_id: doc.id,
                embedding: vectorString(vector),
                embedding_model: Constants.AI.embeddingModel,
                model_version: "2024-01"
            )

            try await client.from("search_embeddings").insert(payload).execute()
        }
    }

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
                    last_synced_at: Date.now
                )
            )
        }

        guard !payloads.isEmpty else { return }
        try await client.from("email_messages").upsert(payloads).execute()
    }

    private func summariseNote(_ note: Note) -> String {
        let base = note.enhancedNotes?.isEmpty == false ? note.enhancedNotes! : note.rawNotes
        return String(base.prefix(Constants.Search.maxSummaryCharacters))
    }

    private func summariseThread(_ thread: GmailThread) -> String {
        let lastMessages = thread.messages.suffix(4)
        let body = lastMessages.map { "\($0.from): \($0.snippet)" }.joined(separator: "\n")
        return String(body.prefix(Constants.Search.maxSummaryCharacters))
    }

    private func selectiveChunks(from inputs: [String]) -> [String] {
        let text = inputs.joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return [] }

        let paragraphs = text
            .components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        var chunks: [String] = []
        for paragraph in paragraphs {
            if paragraph.count <= Constants.Search.maxChunkCharacters {
                chunks.append(paragraph)
            } else {
                var cursor = paragraph.startIndex
                while cursor < paragraph.endIndex {
                    let next = paragraph.index(cursor, offsetBy: Constants.Search.maxChunkCharacters, limitedBy: paragraph.endIndex) ?? paragraph.endIndex
                    chunks.append(String(paragraph[cursor..<next]))
                    cursor = next
                }
            }
        }
        return Array(chunks.prefix(8))
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
                started_at: status == "running" ? Date.now : nil,
                completed_at: (status == "completed" || status == "failed") ? Date.now : nil
            )
            try await client.from("search_jobs").insert(row).execute()
        } catch {
            telemetry.track(event: "search_job_write_failed", fields: ["error": error.localizedDescription])
        }
    }
}

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
