import Foundation
import SwiftData
import Supabase

/// Bidirectional sync between local SwiftData cache and Supabase (source of truth).
///
/// Strategy:
/// - **Pull**: On app launch / login, fetch all user data from Supabase → upsert into SwiftData
/// - **Push**: After each local write, fire-and-forget push to Supabase
/// - **Conflict resolution**: Server wins (based on `updated_at` timestamps)
/// - **Migration**: One-time upload of existing local data for pre-Supabase users
@Observable
final class SyncService {

    private let client: SupabaseClient
    private let modelContext: ModelContext

    /// Whether a full sync is currently in progress.
    private(set) var isSyncing = false

    init(client: SupabaseClient, modelContext: ModelContext) {
        self.client = client
        self.modelContext = modelContext
    }

    // MARK: - Full Sync (Pull)

    /// Pull all user data from Supabase and upsert into local SwiftData.
    /// Called on login and app launch.
    @MainActor
    func fullSync() async {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }

        print("[SyncService] Starting full sync...")

        await syncFolders()
        await syncTags()
        await syncNotes()
        await syncUtterances()
        await syncNoteTagLinks()
        await syncStyleProfiles()
        await syncContactRules()
        await syncTodos()

        print("[SyncService] Full sync complete")
    }

    // MARK: - Pull Individual Tables

    @MainActor
    private func syncFolders() async {
        do {
            let remote: [RemoteFolder] = try await client
                .from("folders")
                .select()
                .execute()
                .value

            let localFolders = fetchAll(Folder.self)
            let localById = Dictionary(uniqueKeysWithValues: localFolders.map { ($0.id, $0) })

            for r in remote {
                if let local = localById[r.id] {
                    local.name = r.name
                    local.sortOrder = r.sort_order
                    local.createdAt = r.created_at
                } else {
                    let folder = Folder(id: r.id, name: r.name, createdAt: r.created_at, sortOrder: r.sort_order)
                    modelContext.insert(folder)
                }
            }

            // Delete local folders not on server
            let remoteIds = Set(remote.map(\.id))
            for local in localFolders where !remoteIds.contains(local.id) {
                modelContext.delete(local)
            }

            try modelContext.save()
        } catch {
            print("[SyncService] Folder sync failed: \(error.localizedDescription)")
        }
    }

    @MainActor
    private func syncTags() async {
        do {
            let remote: [RemoteTag] = try await client
                .from("tags")
                .select()
                .execute()
                .value

            let localTags = fetchAll(Tag.self)
            let localById = Dictionary(uniqueKeysWithValues: localTags.map { ($0.id, $0) })

            for r in remote {
                if let local = localById[r.id] {
                    local.name = r.name
                    local.colorHex = r.color_hex
                    local.createdAt = r.created_at
                } else {
                    let tag = Tag(id: r.id, name: r.name, colorHex: r.color_hex, createdAt: r.created_at)
                    modelContext.insert(tag)
                }
            }

            let remoteIds = Set(remote.map(\.id))
            for local in localTags where !remoteIds.contains(local.id) {
                modelContext.delete(local)
            }

            try modelContext.save()
        } catch {
            print("[SyncService] Tag sync failed: \(error.localizedDescription)")
        }
    }

    @MainActor
    private func syncNotes() async {
        do {
            let remote: [RemoteNote] = try await client
                .from("notes")
                .select()
                .execute()
                .value

            let localNotes = fetchAll(Note.self)
            let localById = Dictionary(uniqueKeysWithValues: localNotes.map { ($0.id, $0) })
            let localFolders = fetchAll(Folder.self)
            let folderById = Dictionary(uniqueKeysWithValues: localFolders.map { ($0.id, $0) })

            for r in remote {
                if let local = localById[r.id] {
                    local.title = r.title
                    local.rawNotes = r.raw_notes
                    local.enhancedNotes = r.enhanced_notes
                    local.calendarEventId = r.calendar_event_id
                    local.attendeesRaw = r.attendees.joined(separator: "|||")
                    local.isShared = r.is_shared
                    local.shareURL = r.share_url
                    local.statusRaw = r.status
                    local.noteTypeRaw = r.note_type
                    local.isPinned = r.is_pinned
                    local.linkedNoteIds = r.linked_note_ids.isEmpty ? nil : r.linked_note_ids.map(\.uuidString).joined(separator: ",")
                    local.createdAt = r.created_at
                    local.folder = r.folder_id.flatMap { folderById[$0] }
                } else {
                    let note = Note(
                        id: r.id,
                        title: r.title,
                        createdAt: r.created_at,
                        rawNotes: r.raw_notes,
                        enhancedNotes: r.enhanced_notes,
                        calendarEventId: r.calendar_event_id,
                        attendees: r.attendees,
                        isShared: r.is_shared,
                        shareURL: r.share_url,
                        status: MeetingStatus(rawValue: r.status) ?? .inProgress,
                        noteType: NoteType(rawValue: r.note_type) ?? .meeting,
                        isPinned: r.is_pinned,
                        linkedNoteIds: r.linked_note_ids.isEmpty ? nil : r.linked_note_ids.map(\.uuidString).joined(separator: ",")
                    )
                    note.folder = r.folder_id.flatMap { folderById[$0] }
                    modelContext.insert(note)
                }
            }

            let remoteIds = Set(remote.map(\.id))
            for local in localNotes where !remoteIds.contains(local.id) {
                modelContext.delete(local)
            }

            try modelContext.save()
        } catch {
            print("[SyncService] Note sync failed: \(error.localizedDescription)")
        }
    }

    @MainActor
    private func syncUtterances() async {
        do {
            let remote: [RemoteUtterance] = try await client
                .from("utterances")
                .select()
                .execute()
                .value

            let localUtterances = fetchAll(Utterance.self)
            let localById = Dictionary(uniqueKeysWithValues: localUtterances.map { ($0.id, $0) })
            let localNotes = fetchAll(Note.self)
            let noteById = Dictionary(uniqueKeysWithValues: localNotes.map { ($0.id, $0) })

            for r in remote {
                if localById[r.id] == nil {
                    let source = AudioSource(rawValue: r.source) ?? .mic
                    let utterance = Utterance(
                        id: r.id,
                        source: source,
                        text: r.text,
                        startTime: r.start_time,
                        endTime: r.end_time,
                        confidence: r.confidence
                    )
                    utterance.note = noteById[r.note_id]
                    modelContext.insert(utterance)
                }
            }

            let remoteIds = Set(remote.map(\.id))
            for local in localUtterances where !remoteIds.contains(local.id) {
                modelContext.delete(local)
            }

            try modelContext.save()
        } catch {
            print("[SyncService] Utterance sync failed: \(error.localizedDescription)")
        }
    }

    @MainActor
    private func syncNoteTagLinks() async {
        do {
            let remote: [RemoteNoteTag] = try await client
                .from("note_tags")
                .select()
                .execute()
                .value

            let localNotes = fetchAll(Note.self)
            let noteById = Dictionary(uniqueKeysWithValues: localNotes.map { ($0.id, $0) })
            let localTags = fetchAll(Tag.self)
            let tagById = Dictionary(uniqueKeysWithValues: localTags.map { ($0.id, $0) })

            // Build expected links per note
            var linksByNote: [UUID: Set<UUID>] = [:]
            for r in remote {
                linksByNote[r.note_id, default: []].insert(r.tag_id)
            }

            // Apply links
            for note in localNotes {
                let expectedTagIds = linksByNote[note.id] ?? []
                let expectedTags = expectedTagIds.compactMap { tagById[$0] }
                note.tags = expectedTags
            }

            try modelContext.save()
        } catch {
            print("[SyncService] Note-tag link sync failed: \(error.localizedDescription)")
        }
    }

    @MainActor
    private func syncStyleProfiles() async {
        do {
            let remote: [RemoteStyleProfile] = try await client
                .from("style_profiles")
                .select()
                .execute()
                .value

            let localProfiles = fetchAll(StyleProfile.self)
            let localById = Dictionary(uniqueKeysWithValues: localProfiles.map { ($0.id, $0) })

            for r in remote {
                if let local = localById[r.id] {
                    local.accountEmail = r.account_email
                    local.greetings = r.greetings
                    local.signOffs = r.sign_offs
                    local.signatureName = r.signature_name
                    local.averageSentenceLength = r.average_sentence_length
                    local.formalityScore = r.formality_score
                    local.usesContractions = r.uses_contractions
                    local.usesEmoji = r.uses_emoji
                    local.prefersBulletPoints = r.prefers_bullet_points
                    local.commonPhrases = r.common_phrases
                    local.avoidedPhrases = r.avoided_phrases
                    local.locale = r.locale
                    local.styleSummary = r.style_summary
                    local.sampleExcerpts = r.sample_excerpts
                    local.emailsAnalysed = r.emails_analysed
                    local.createdAt = r.created_at
                    local.updatedAt = r.updated_at
                } else {
                    let profile = StyleProfile(
                        id: r.id,
                        accountEmail: r.account_email,
                        createdAt: r.created_at,
                        updatedAt: r.updated_at,
                        greetings: r.greetings,
                        signOffs: r.sign_offs,
                        signatureName: r.signature_name,
                        averageSentenceLength: r.average_sentence_length,
                        formalityScore: r.formality_score,
                        usesContractions: r.uses_contractions,
                        usesEmoji: r.uses_emoji,
                        prefersBulletPoints: r.prefers_bullet_points,
                        commonPhrases: r.common_phrases,
                        avoidedPhrases: r.avoided_phrases,
                        locale: r.locale,
                        styleSummary: r.style_summary,
                        sampleExcerpts: r.sample_excerpts,
                        emailsAnalysed: r.emails_analysed
                    )
                    modelContext.insert(profile)
                }
            }

            let remoteIds = Set(remote.map(\.id))
            for local in localProfiles where !remoteIds.contains(local.id) {
                modelContext.delete(local)
            }

            try modelContext.save()
        } catch {
            print("[SyncService] Style profile sync failed: \(error.localizedDescription)")
        }
    }

    @MainActor
    private func syncContactRules() async {
        do {
            let remote: [RemoteContactRule] = try await client
                .from("contact_rules")
                .select()
                .execute()
                .value

            let localRules = fetchAll(ContactRule.self)
            let localById = Dictionary(uniqueKeysWithValues: localRules.map { ($0.id, $0) })

            for r in remote {
                if let local = localById[r.id] {
                    local.matchTypeRaw = r.match_type
                    local.matchValue = r.match_value
                    local.displayName = r.display_name
                    local.instructions = r.instructions
                    local.createdAt = r.created_at
                } else {
                    let rule = ContactRule(
                        id: r.id,
                        matchType: ContactRule.MatchType(rawValue: r.match_type) ?? .email,
                        matchValue: r.match_value,
                        displayName: r.display_name,
                        instructions: r.instructions,
                        createdAt: r.created_at
                    )
                    modelContext.insert(rule)
                }
            }

            let remoteIds = Set(remote.map(\.id))
            for local in localRules where !remoteIds.contains(local.id) {
                modelContext.delete(local)
            }

            try modelContext.save()
        } catch {
            print("[SyncService] Contact rule sync failed: \(error.localizedDescription)")
        }
    }

    @MainActor
    private func syncTodos() async {
        do {
            let remote: [RemoteTodo] = try await client
                .from("todos")
                .select()
                .execute()
                .value

            let localTodos = fetchAll(TodoItem.self)
            let localById = Dictionary(uniqueKeysWithValues: localTodos.map { ($0.id, $0) })

            for r in remote {
                if let local = localById[r.id] {
                    local.title = r.title
                    local.details = r.details
                    local.isCompleted = r.is_completed
                    local.completedAt = r.completed_at
                    local.dueDate = r.due_date
                    local.priorityRaw = r.priority
                    local.sourceTypeRaw = r.source_type
                    local.sourceId = r.source_id
                    local.sourceTitle = r.source_title
                    local.sourceSnippet = r.source_snippet
                    local.senderEmail = r.sender_email
                    local.isDeleted = r.is_deleted
                    local.createdAt = r.created_at
                } else {
                    let todo = TodoItem(
                        id: r.id,
                        title: r.title,
                        details: r.details,
                        isCompleted: r.is_completed,
                        completedAt: r.completed_at,
                        createdAt: r.created_at,
                        dueDate: r.due_date,
                        priority: TodoItem.Priority(rawValue: r.priority) ?? .medium,
                        sourceType: TodoItem.SourceType(rawValue: r.source_type) ?? .manual,
                        sourceId: r.source_id,
                        sourceTitle: r.source_title,
                        sourceSnippet: r.source_snippet,
                        senderEmail: r.sender_email,
                        isDeleted: r.is_deleted
                    )
                    modelContext.insert(todo)
                }
            }

            let remoteIds = Set(remote.map(\.id))
            for local in localTodos where !remoteIds.contains(local.id) {
                modelContext.delete(local)
            }

            try modelContext.save()
        } catch {
            print("[SyncService] Todo sync failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Push Operations

    /// Push a note to Supabase (upsert).
    func pushNote(_ note: Note) {
        Task {
            do {
                let userId = try await getUserId()
                let remote = RemoteNote(
                    id: note.id,
                    user_id: userId,
                    folder_id: note.folder?.id,
                    title: note.title,
                    raw_notes: note.rawNotes,
                    enhanced_notes: note.enhancedNotes,
                    calendar_event_id: note.calendarEventId,
                    attendees: note.attendees,
                    is_shared: note.isShared,
                    share_url: note.shareURL,
                    status: note.statusRaw,
                    note_type: note.noteTypeRaw,
                    is_pinned: note.isPinned,
                    linked_note_ids: note.linkedNoteIdList,
                    created_at: note.createdAt,
                    updated_at: Date.now
                )

                try await client
                    .from("notes")
                    .upsert(remote)
                    .execute()

                // Sync tags
                await pushNoteTagLinks(noteId: note.id, tagIds: note.tags.map(\.id))
            } catch {
                print("[SyncService] Push note failed: \(error.localizedDescription)")
            }
        }
    }

    /// Push utterances for a note to Supabase (batch insert).
    func pushUtterances(_ utterances: [Utterance], noteId: UUID) {
        Task {
            do {
                let userId = try await getUserId()

                // Batch in chunks of 100
                let chunks = stride(from: 0, to: utterances.count, by: 100).map {
                    Array(utterances[$0..<min($0 + 100, utterances.count)])
                }

                for chunk in chunks {
                    let remotes = chunk.map { u in
                        RemoteUtterance(
                            id: u.id,
                            user_id: userId,
                            note_id: noteId,
                            source: u.source == .mic ? "mic" : "system",
                            text: u.text,
                            start_time: u.startTime,
                            end_time: u.endTime,
                            confidence: u.confidence,
                            created_at: u.startTime
                        )
                    }

                    try await client
                        .from("utterances")
                        .upsert(remotes)
                        .execute()
                }
            } catch {
                print("[SyncService] Push utterances failed: \(error.localizedDescription)")
            }
        }
    }

    /// Push a folder to Supabase.
    func pushFolder(_ folder: Folder) {
        Task {
            do {
                let userId = try await getUserId()
                let remote = RemoteFolder(
                    id: folder.id,
                    user_id: userId,
                    name: folder.name,
                    sort_order: folder.sortOrder,
                    created_at: folder.createdAt,
                    updated_at: Date.now
                )

                try await client
                    .from("folders")
                    .upsert(remote)
                    .execute()
            } catch {
                print("[SyncService] Push folder failed: \(error.localizedDescription)")
            }
        }
    }

    /// Push a tag to Supabase.
    func pushTag(_ tag: Tag) {
        Task {
            do {
                let userId = try await getUserId()
                let remote = RemoteTag(
                    id: tag.id,
                    user_id: userId,
                    name: tag.name,
                    color_hex: tag.colorHex,
                    created_at: tag.createdAt,
                    updated_at: Date.now
                )

                try await client
                    .from("tags")
                    .upsert(remote)
                    .execute()
            } catch {
                print("[SyncService] Push tag failed: \(error.localizedDescription)")
            }
        }
    }

    /// Push note-tag links to Supabase.
    func pushNoteTagLinks(noteId: UUID, tagIds: [UUID]) async {
        do {
            // Delete existing links for this note
            try await client
                .from("note_tags")
                .delete()
                .eq("note_id", value: noteId.uuidString)
                .execute()

            // Insert current links
            if !tagIds.isEmpty {
                let links = tagIds.map { RemoteNoteTag(note_id: noteId, tag_id: $0) }
                try await client
                    .from("note_tags")
                    .insert(links)
                    .execute()
            }
        } catch {
            print("[SyncService] Push note-tag links failed: \(error.localizedDescription)")
        }
    }

    /// Push a style profile to Supabase.
    func pushStyleProfile(_ profile: StyleProfile) {
        Task {
            do {
                let userId = try await getUserId()
                let remote = RemoteStyleProfile(
                    id: profile.id,
                    user_id: userId,
                    account_email: profile.accountEmail,
                    greetings: profile.greetings,
                    sign_offs: profile.signOffs,
                    signature_name: profile.signatureName,
                    average_sentence_length: profile.averageSentenceLength,
                    formality_score: profile.formalityScore,
                    uses_contractions: profile.usesContractions,
                    uses_emoji: profile.usesEmoji,
                    prefers_bullet_points: profile.prefersBulletPoints,
                    common_phrases: profile.commonPhrases,
                    avoided_phrases: profile.avoidedPhrases,
                    locale: profile.locale,
                    style_summary: profile.styleSummary,
                    sample_excerpts: profile.sampleExcerpts,
                    emails_analysed: profile.emailsAnalysed,
                    created_at: profile.createdAt,
                    updated_at: Date.now
                )

                try await client
                    .from("style_profiles")
                    .upsert(remote)
                    .execute()
            } catch {
                print("[SyncService] Push style profile failed: \(error.localizedDescription)")
            }
        }
    }

    /// Push a contact rule to Supabase.
    func pushContactRule(_ rule: ContactRule) {
        Task {
            do {
                let userId = try await getUserId()
                let remote = RemoteContactRule(
                    id: rule.id,
                    user_id: userId,
                    match_type: rule.matchTypeRaw,
                    match_value: rule.matchValue,
                    display_name: rule.displayName,
                    instructions: rule.instructions,
                    created_at: rule.createdAt,
                    updated_at: Date.now
                )

                try await client
                    .from("contact_rules")
                    .upsert(remote)
                    .execute()
            } catch {
                print("[SyncService] Push contact rule failed: \(error.localizedDescription)")
            }
        }
    }

    /// Push a to-do item to Supabase.
    func pushTodo(_ todo: TodoItem) {
        Task {
            do {
                let userId = try await getUserId()
                let remote = RemoteTodo(
                    id: todo.id,
                    user_id: userId,
                    title: todo.title,
                    details: todo.details,
                    is_completed: todo.isCompleted,
                    completed_at: todo.completedAt,
                    created_at: todo.createdAt,
                    updated_at: Date.now,
                    due_date: todo.dueDate,
                    priority: todo.priorityRaw,
                    source_type: todo.sourceTypeRaw,
                    source_id: todo.sourceId,
                    source_title: todo.sourceTitle,
                    source_snippet: todo.sourceSnippet,
                    sender_email: todo.senderEmail,
                    is_deleted: todo.isDeleted
                )

                try await client
                    .from("todos")
                    .upsert(remote)
                    .execute()
            } catch {
                print("[SyncService] Push todo failed: \(error.localizedDescription)")
            }
        }
    }

    /// Delete a row from a Supabase table by ID.
    func deleteRemote(table: String, id: UUID) {
        Task {
            do {
                try await client
                    .from(table)
                    .delete()
                    .eq("id", value: id.uuidString)
                    .execute()
            } catch {
                print("[SyncService] Delete from \(table) failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Migration

    /// One-time upload of existing local SwiftData to Supabase for pre-Supabase users.
    @MainActor
    func migrateLocalData() async {
        guard !UserDefaults.standard.bool(forKey: Constants.Defaults.hasCompletedSupabaseMigration) else {
            return
        }

        let notes = fetchAll(Note.self)
        let folders = fetchAll(Folder.self)
        let tags = fetchAll(Tag.self)
        let profiles = fetchAll(StyleProfile.self)
        let rules = fetchAll(ContactRule.self)

        let hasData = !notes.isEmpty || !folders.isEmpty || !tags.isEmpty

        guard hasData else {
            UserDefaults.standard.set(true, forKey: Constants.Defaults.hasCompletedSupabaseMigration)
            return
        }

        print("[SyncService] Migrating \(notes.count) notes, \(folders.count) folders, \(tags.count) tags...")

        // Push folders first (notes reference them)
        for folder in folders { pushFolder(folder) }

        // Push tags
        for tag in tags { pushTag(tag) }

        // Small delay to let folders/tags propagate
        try? await Task.sleep(for: .seconds(1))

        // Push notes
        for note in notes { pushNote(note) }

        // Push utterances
        for note in notes where !note.transcript.isEmpty {
            pushUtterances(note.transcript, noteId: note.id)
        }

        // Push style profiles
        for profile in profiles { pushStyleProfile(profile) }

        // Push contact rules
        for rule in rules { pushContactRule(rule) }

        // Push todos
        let todos = fetchAll(TodoItem.self)
        for todo in todos { pushTodo(todo) }

        UserDefaults.standard.set(true, forKey: Constants.Defaults.hasCompletedSupabaseMigration)
        print("[SyncService] Migration complete")
    }

    // MARK: - Helpers

    private func getUserId() async throws -> UUID {
        let session = try await client.auth.session
        return session.user.id
    }

    private func fetchAll<T: PersistentModel>(_ type: T.Type) -> [T] {
        let descriptor = FetchDescriptor<T>()
        return (try? modelContext.fetch(descriptor)) ?? []
    }
}

// MARK: - Remote Models (Codable DTOs for Supabase PostgREST)

struct RemoteFolder: Codable {
    let id: UUID
    let user_id: UUID
    let name: String
    let sort_order: Int
    let created_at: Date
    let updated_at: Date
}

struct RemoteTag: Codable {
    let id: UUID
    let user_id: UUID
    let name: String
    let color_hex: String?
    let created_at: Date
    let updated_at: Date
}

struct RemoteNote: Codable {
    let id: UUID
    let user_id: UUID
    let folder_id: UUID?
    let title: String
    let raw_notes: String
    let enhanced_notes: String?
    let calendar_event_id: String?
    let attendees: [String]
    let is_shared: Bool
    let share_url: String?
    let status: String
    let note_type: String
    let is_pinned: Bool
    let linked_note_ids: [UUID]
    let created_at: Date
    let updated_at: Date
}

struct RemoteUtterance: Codable {
    let id: UUID
    let user_id: UUID
    let note_id: UUID
    let source: String
    let text: String
    let start_time: Date
    let end_time: Date
    let confidence: Float
    let created_at: Date
}

struct RemoteNoteTag: Codable {
    let note_id: UUID
    let tag_id: UUID
}

struct RemoteStyleProfile: Codable {
    let id: UUID
    let user_id: UUID
    let account_email: String
    let greetings: [String]
    let sign_offs: [String]
    let signature_name: String
    let average_sentence_length: Int
    let formality_score: Float
    let uses_contractions: Bool
    let uses_emoji: Bool
    let prefers_bullet_points: Bool
    let common_phrases: [String]
    let avoided_phrases: [String]
    let locale: String
    let style_summary: String
    let sample_excerpts: [String]
    let emails_analysed: Int
    let created_at: Date
    let updated_at: Date
}

struct RemoteContactRule: Codable {
    let id: UUID
    let user_id: UUID
    let match_type: String
    let match_value: String
    let display_name: String?
    let instructions: String
    let created_at: Date
    let updated_at: Date
}

struct RemoteTodo: Codable {
    let id: UUID
    let user_id: UUID
    let title: String
    let details: String?
    let is_completed: Bool
    let completed_at: Date?
    let created_at: Date
    let updated_at: Date
    let due_date: Date?
    let priority: String
    let source_type: String
    let source_id: String?
    let source_title: String?
    let source_snippet: String?
    let sender_email: String?
    let is_deleted: Bool
}
