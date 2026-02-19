import Foundation
import SwiftData

/// CRUD operations for Note and Utterance models.
/// Wraps SwiftData ModelContext for clean data access.
/// After each mutation, fires a sync push to Supabase (if available).
@Observable
final class NoteRepository {

    private let modelContext: ModelContext

    /// Optional sync service — set after Supabase authentication.
    var syncService: SyncService?
    var onNoteChanged: ((Note) -> Void)?
    var onTranscriptSaved: ((Note, [Utterance]) -> Void)?

    /// Incremented after Supabase sync or bulk data changes.
    /// Read methods touch this so SwiftUI views that call them
    /// automatically re-render when fresh data arrives.
    private(set) var dataRevision = 0

    /// Notify views that the underlying data has changed (e.g. after sync).
    func invalidate() {
        dataRevision += 1
    }

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    // MARK: - Create

    /// Create a new note and insert it into the store.
    @discardableResult
    func createNote(title: String, calendarEventId: String? = nil, attendees: [String] = []) -> Note {
        let note = Note(
            title: title,
            calendarEventId: calendarEventId,
            attendees: attendees
        )
        modelContext.insert(note)
        save()
        if syncService == nil { print("[NoteRepository] ⚠ syncService is nil — note '\(title)' won't push to Supabase") }
        syncService?.pushNote(note)
        return note
    }

    // MARK: - Read

    /// Fetch all active (non-archived) notes, sorted by creation date (newest first).
    func fetchAllNotes() -> [Note] {
        _ = dataRevision
        let predicate = #Predicate<Note> { note in
            note.isArchived == false
        }
        let descriptor = FetchDescriptor<Note>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    /// Fetch all archived notes, sorted by archive date (newest first).
    func fetchArchivedNotes() -> [Note] {
        _ = dataRevision
        let predicate = #Predicate<Note> { note in
            note.isArchived == true
        }
        let descriptor = FetchDescriptor<Note>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    /// Fetch archived meeting notes only.
    func fetchArchivedMeetingNotes() -> [Note] {
        let meetingRaw = NoteType.meeting.rawValue
        let predicate = #Predicate<Note> { note in
            note.isArchived == true && note.noteTypeRaw == meetingRaw
        }
        let descriptor = FetchDescriptor<Note>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    /// Fetch archived standalone notes only.
    func fetchArchivedStandaloneNotes() -> [Note] {
        let standaloneRaw = NoteType.standalone.rawValue
        let predicate = #Predicate<Note> { note in
            note.isArchived == true && note.noteTypeRaw == standaloneRaw
        }
        let descriptor = FetchDescriptor<Note>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    /// Search active (non-archived) notes by title, content, or tag names.
    func searchNotes(query: String) -> [Note] {
        _ = dataRevision
        let predicate = #Predicate<Note> { note in
            note.isArchived == false && (
                note.title.localizedStandardContains(query) ||
                note.rawNotes.localizedStandardContains(query)
            )
        }

        let descriptor = FetchDescriptor<Note>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )

        var results = (try? modelContext.fetch(descriptor)) ?? []

        // Also include notes matching tag names (excluding archived)
        let allTags = fetchAllTags()
        let matchingTags = allTags.filter { $0.name.localizedCaseInsensitiveContains(query) }
        for tag in matchingTags {
            for note in tag.notes where !note.isArchived {
                if !results.contains(where: { $0.id == note.id }) {
                    results.append(note)
                }
            }
        }

        return results.sorted { $0.createdAt > $1.createdAt }
    }

    /// Fetch active (non-archived) notes by status.
    func fetchNotes(withStatus status: MeetingStatus) -> [Note] {
        let statusRaw = status.rawValue
        let predicate = #Predicate<Note> { note in
            note.isArchived == false && note.statusRaw == statusRaw
        }

        let descriptor = FetchDescriptor<Note>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )

        return (try? modelContext.fetch(descriptor)) ?? []
    }

    // MARK: - Update

    /// Update the raw notes content.
    func updateRawNotes(_ text: String, for note: Note) {
        note.rawNotes = text
        save()
        if syncService == nil { print("[NoteRepository] ⚠ syncService is nil — raw notes update for '\(note.title)' won't push") }
        syncService?.pushNote(note)
        onNoteChanged?(note)
    }

    /// Set the AI-enhanced notes.
    func setEnhancedNotes(_ text: String, for note: Note) {
        note.enhancedNotes = text
        save()
        if syncService == nil { print("[NoteRepository] ⚠ syncService is nil — enhanced notes for '\(note.title)' won't push") }
        syncService?.pushNote(note)
        onNoteChanged?(note)
    }

    /// Rename a note.
    func renameNote(_ note: Note, to title: String) {
        note.title = title
        save()
        syncService?.pushNote(note)
        onNoteChanged?(note)
    }

    /// Update the meeting status.
    func updateStatus(_ note: Note, to status: MeetingStatus) {
        note.status = status
        save()
        syncService?.pushNote(note)
        onNoteChanged?(note)
    }

    /// Save transcript utterances to a note.
    /// Converts in-memory `LiveUtterance` structs to persisted `@Model Utterance` objects.
    func saveTranscript(_ liveUtterances: [LiveUtterance], to note: Note) {
        var newUtterances: [Utterance] = []
        for live in liveUtterances {
            let utterance = Utterance(
                source: live.source,
                text: live.text,
                startTime: live.startTime,
                endTime: live.endTime,
                confidence: live.confidence
            )
            utterance.note = note
            modelContext.insert(utterance)
            note.transcript.append(utterance)
            newUtterances.append(utterance)
        }
        save()
        if syncService == nil { print("[NoteRepository] ⚠ syncService is nil — \(newUtterances.count) utterances for '\(note.title)' won't push") }
        syncService?.pushUtterances(newUtterances, noteId: note.id)
        onTranscriptSaved?(note, newUtterances)
    }

    /// Mark a note as shared and store the share URL.
    func markShared(_ note: Note, url: String) {
        note.isShared = true
        note.shareURL = url
        save()
        syncService?.pushNote(note)
    }

    /// Move a note to a folder (or remove from folder if nil).
    func moveNote(_ note: Note, to folder: Folder?) {
        note.folder = folder
        save()
        syncService?.pushNote(note)
    }

    // MARK: - Standalone Notes

    /// Create a new standalone note (no meeting/audio pipeline).
    @discardableResult
    func createStandaloneNote(title: String) -> Note {
        let note = Note(
            title: title,
            status: .standalone,
            noteType: .standalone
        )
        modelContext.insert(note)
        save()
        syncService?.pushNote(note)
        return note
    }

    /// Fetch only active (non-archived) standalone notes.
    func fetchStandaloneNotes() -> [Note] {
        _ = dataRevision
        let standaloneRaw = NoteType.standalone.rawValue
        let predicate = #Predicate<Note> { note in
            note.isArchived == false && note.noteTypeRaw == standaloneRaw
        }
        let descriptor = FetchDescriptor<Note>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    /// Fetch only active (non-archived) meeting notes.
    func fetchMeetingNotes() -> [Note] {
        _ = dataRevision
        let meetingRaw = NoteType.meeting.rawValue
        let predicate = #Predicate<Note> { note in
            note.isArchived == false && note.noteTypeRaw == meetingRaw
        }
        let descriptor = FetchDescriptor<Note>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    // MARK: - Pin

    /// Toggle the pinned state of a note.
    func togglePin(_ note: Note) {
        note.isPinned = !note.isPinned
        save()
        syncService?.pushNote(note)
    }

    // MARK: - Tags

    /// Fetch all tags, sorted by name.
    func fetchAllTags() -> [Tag] {
        _ = dataRevision
        let descriptor = FetchDescriptor<Tag>(
            sortBy: [SortDescriptor(\.name, order: .forward)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    /// Find an existing tag by name (case-insensitive), or create a new one.
    @discardableResult
    func findOrCreateTag(name: String, colorHex: String? = nil) -> Tag {
        let lowered = name.lowercased()
        let allTags = fetchAllTags()
        if let existing = allTags.first(where: { $0.name.lowercased() == lowered }) {
            return existing
        }
        let tag = Tag(name: name, colorHex: colorHex)
        modelContext.insert(tag)
        save()
        syncService?.pushTag(tag)
        return tag
    }

    /// Add a tag to a note (no-op if already present).
    func addTag(_ tag: Tag, to note: Note) {
        guard !note.tags.contains(where: { $0.id == tag.id }) else { return }
        note.tags.append(tag)
        save()
        syncService?.pushNote(note)
    }

    /// Remove a tag from a note.
    func removeTag(_ tag: Tag, from note: Note) {
        note.tags.removeAll { $0.id == tag.id }
        save()
        syncService?.pushNote(note)
    }

    /// Delete a tag entirely (removes from all notes via .nullify).
    func deleteTag(_ tag: Tag) {
        let tagId = tag.id
        modelContext.delete(tag)
        save()
        syncService?.deleteRemote(table: "tags", id: tagId)
    }

    /// Fetch active (non-archived) notes that have a specific tag.
    func fetchNotes(withTag tag: Tag) -> [Note] {
        return tag.notes.filter { !$0.isArchived }.sorted { $0.createdAt > $1.createdAt }
    }

    // MARK: - Linking

    /// Link two notes bidirectionally.
    func linkNotes(_ noteA: Note, _ noteB: Note) {
        var aLinks = noteA.linkedNoteIdList
        var bLinks = noteB.linkedNoteIdList

        if !aLinks.contains(noteB.id) {
            aLinks.append(noteB.id)
            noteA.linkedNoteIdList = aLinks
        }
        if !bLinks.contains(noteA.id) {
            bLinks.append(noteA.id)
            noteB.linkedNoteIdList = bLinks
        }
        save()
        syncService?.pushNote(noteA)
        syncService?.pushNote(noteB)
    }

    /// Unlink two notes bidirectionally.
    func unlinkNotes(_ noteA: Note, _ noteB: Note) {
        var aLinks = noteA.linkedNoteIdList
        var bLinks = noteB.linkedNoteIdList

        aLinks.removeAll { $0 == noteB.id }
        bLinks.removeAll { $0 == noteA.id }

        noteA.linkedNoteIdList = aLinks
        noteB.linkedNoteIdList = bLinks
        save()
        syncService?.pushNote(noteA)
        syncService?.pushNote(noteB)
    }

    // MARK: - Archive / Restore / Delete

    /// Soft-delete: archive a note instead of permanently deleting it.
    func archiveNote(_ note: Note) {
        note.isArchived = true
        note.archivedAt = Date.now
        save()
        syncService?.pushNote(note)
    }

    /// Restore an archived note back to the active list.
    func restoreNote(_ note: Note) {
        note.isArchived = false
        note.archivedAt = nil
        save()
        syncService?.pushNote(note)
    }

    /// Permanently delete a note and all associated utterances (irreversible).
    func permanentlyDeleteNote(_ note: Note) {
        let noteId = note.id
        modelContext.delete(note)
        save()
        syncService?.deleteRemote(table: "notes", id: noteId)
    }

    /// Legacy alias — archives the note (soft delete).
    func deleteNote(_ note: Note) {
        archiveNote(note)
    }

    // MARK: - Folders

    /// Fetch all folders, sorted by sort order then creation date.
    func fetchAllFolders() -> [Folder] {
        _ = dataRevision
        let descriptor = FetchDescriptor<Folder>(
            sortBy: [
                SortDescriptor(\.sortOrder, order: .forward),
                SortDescriptor(\.createdAt, order: .forward)
            ]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    /// Create a new folder.
    @discardableResult
    func createFolder(name: String) -> Folder {
        let folders = fetchAllFolders()
        let nextOrder = (folders.map(\.sortOrder).max() ?? -1) + 1
        let folder = Folder(name: name, sortOrder: nextOrder)
        modelContext.insert(folder)
        save()
        syncService?.pushFolder(folder)
        return folder
    }

    /// Rename a folder.
    func renameFolder(_ folder: Folder, to name: String) {
        folder.name = name
        save()
        syncService?.pushFolder(folder)
    }

    /// Delete a folder. Notes in the folder are moved to root (folder set to nil).
    func deleteFolder(_ folder: Folder) {
        let folderId = folder.id
        for note in folder.notes {
            note.folder = nil
        }
        modelContext.delete(folder)
        save()
        syncService?.deleteRemote(table: "folders", id: folderId)
    }

    /// Fetch active (non-archived) notes in a folder, or all uncategorised active notes if folder is nil.
    func fetchNotes(in folder: Folder?) -> [Note] {
        _ = dataRevision
        if let folder {
            return folder.notes.filter { !$0.isArchived }.sorted { $0.createdAt > $1.createdAt }
        }
        return fetchAllNotes().filter { $0.folder == nil }
    }

    // MARK: - Private

    private func save() {
        do {
            try modelContext.save()
        } catch {
            print("[NoteRepository] Save failed: \(error.localizedDescription)")
        }
    }
}
