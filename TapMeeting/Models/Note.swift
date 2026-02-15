import Foundation
import SwiftData

/// A meeting note containing user's raw notes, AI-enhanced output, and transcript.
@Model
final class Note {
    var id: UUID
    var title: String
    var createdAt: Date
    var rawNotes: String
    var enhancedNotes: String?
    
    @Relationship(deleteRule: .cascade, inverse: \Utterance.note)
    var transcript: [Utterance]
    
    var folder: Folder?
    var tags: [Tag] = []
    
    var calendarEventId: String?
    /// Comma-separated list of attendee names from the calendar event.
    var attendeesRaw: String = ""
    var isShared: Bool
    var shareURL: String?
    var statusRaw: String
    var noteTypeRaw: String = NoteType.meeting.rawValue
    var isPinned: Bool = false
    var linkedNoteIds: String?
    
    /// Computed status using the raw string storage.
    var status: MeetingStatus {
        get { MeetingStatus(rawValue: statusRaw) ?? .inProgress }
        set { statusRaw = newValue.rawValue }
    }
    
    /// Computed note type using the raw string storage.
    var noteType: NoteType {
        get { NoteType(rawValue: noteTypeRaw) ?? .meeting }
        set { noteTypeRaw = newValue.rawValue }
    }
    
    /// Parsed linked note IDs from the stored comma-separated string.
    var linkedNoteIdList: [UUID] {
        get {
            guard let raw = linkedNoteIds, !raw.isEmpty else { return [] }
            return raw.components(separatedBy: ",").compactMap { UUID(uuidString: $0) }
        }
        set {
            linkedNoteIds = newValue.isEmpty ? nil : newValue.map(\.uuidString).joined(separator: ",")
        }
    }
    
    /// Parsed attendee names from the stored raw string.
    var attendees: [String] {
        get {
            guard !attendeesRaw.isEmpty else { return [] }
            return attendeesRaw.components(separatedBy: "|||")
        }
        set {
            attendeesRaw = newValue.joined(separator: "|||")
        }
    }
    
    init(
        id: UUID = UUID(),
        title: String,
        createdAt: Date = .now,
        rawNotes: String = "",
        enhancedNotes: String? = nil,
        transcript: [Utterance] = [],
        folder: Folder? = nil,
        tags: [Tag] = [],
        calendarEventId: String? = nil,
        attendees: [String] = [],
        isShared: Bool = false,
        shareURL: String? = nil,
        status: MeetingStatus = .inProgress,
        noteType: NoteType = .meeting,
        isPinned: Bool = false,
        linkedNoteIds: String? = nil
    ) {
        self.id = id
        self.title = title
        self.createdAt = createdAt
        self.rawNotes = rawNotes
        self.enhancedNotes = enhancedNotes
        self.transcript = transcript
        self.folder = folder
        self.tags = tags
        self.calendarEventId = calendarEventId
        self.attendeesRaw = attendees.joined(separator: "|||")
        self.isShared = isShared
        self.shareURL = shareURL
        self.statusRaw = status.rawValue
        self.noteTypeRaw = noteType.rawValue
        self.isPinned = isPinned
        self.linkedNoteIds = linkedNoteIds
    }
}

// MARK: - Convenience

extension Note {
    /// A summary line for display in lists.
    var subtitle: String {
        if let enhanced = enhancedNotes, !enhanced.isEmpty {
            return String(enhanced.prefix(100))
        }
        if !rawNotes.isEmpty {
            return String(rawNotes.prefix(100))
        }
        return "No notes yet"
    }
    
    /// Formatted creation date.
    var formattedDate: String {
        createdAt.formatted(date: .abbreviated, time: .shortened)
    }
    
    /// Duration string based on transcript timestamps.
    var duration: String? {
        guard let first = transcript.first?.startTime,
              let last = transcript.last?.endTime else { return nil }
        
        let interval = last.timeIntervalSince(first)
        let minutes = Int(interval) / 60
        if minutes < 1 { return "< 1 min" }
        return "\(minutes) min"
    }
}
