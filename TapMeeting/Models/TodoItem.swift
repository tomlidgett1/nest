import Foundation
import SwiftData

/// An actionable to-do item, automatically extracted by AI from meeting notes or emails,
/// or manually created by the user.
@Model
final class TodoItem {
    var id: UUID
    var title: String
    var details: String?
    var isCompleted: Bool
    var completedAt: Date?
    var createdAt: Date
    var dueDate: Date?
    var priorityRaw: String
    var sourceTypeRaw: String
    var sourceId: String?
    var sourceTitle: String?
    var sourceSnippet: String?
    /// The sender's email address (for email-sourced to-dos), used for exclusion rules.
    var senderEmail: String?
    var isDeleted: Bool
    
    /// Computed priority from raw string storage.
    var priority: Priority {
        get { Priority(rawValue: priorityRaw) ?? .medium }
        set { priorityRaw = newValue.rawValue }
    }
    
    /// Computed source type from raw string storage.
    var sourceType: SourceType {
        get { SourceType(rawValue: sourceTypeRaw) ?? .manual }
        set { sourceTypeRaw = newValue.rawValue }
    }
    
    init(
        id: UUID = UUID(),
        title: String,
        details: String? = nil,
        isCompleted: Bool = false,
        completedAt: Date? = nil,
        createdAt: Date = .now,
        dueDate: Date? = nil,
        priority: Priority = .medium,
        sourceType: SourceType = .manual,
        sourceId: String? = nil,
        sourceTitle: String? = nil,
        sourceSnippet: String? = nil,
        senderEmail: String? = nil,
        isDeleted: Bool = false
    ) {
        self.id = id
        self.title = title
        self.details = details
        self.isCompleted = isCompleted
        self.completedAt = completedAt
        self.createdAt = createdAt
        self.dueDate = dueDate
        self.priorityRaw = priority.rawValue
        self.sourceTypeRaw = sourceType.rawValue
        self.sourceId = sourceId
        self.sourceTitle = sourceTitle
        self.sourceSnippet = sourceSnippet
        self.senderEmail = senderEmail
        self.isDeleted = isDeleted
    }
}

// MARK: - Enums

extension TodoItem {
    
    enum Priority: String, CaseIterable, Identifiable {
        case high
        case medium
        case low
        
        var id: String { rawValue }
        
        var label: String {
            switch self {
            case .high: return "High"
            case .medium: return "Medium"
            case .low: return "Low"
            }
        }
    }
    
    enum SourceType: String, CaseIterable, Identifiable {
        case meeting
        case email
        case manual
        
        var id: String { rawValue }
        
        var label: String {
            switch self {
            case .meeting: return "Meeting"
            case .email: return "Email"
            case .manual: return "Manual"
            }
        }
        
        var icon: String {
            switch self {
            case .meeting: return "calendar.badge.clock"
            case .email: return "envelope"
            case .manual: return "pencil"
            }
        }
    }
}

// MARK: - Convenience

extension TodoItem {
    
    /// Whether the to-do has a due date that has passed.
    var isOverdue: Bool {
        guard let dueDate, !isCompleted else { return false }
        return dueDate < Date.now
    }
    
    /// Formatted creation date.
    var formattedDate: String {
        createdAt.formatted(date: .abbreviated, time: .shortened)
    }
    
    /// Formatted due date.
    var formattedDueDate: String? {
        dueDate?.formatted(date: .abbreviated, time: .omitted)
    }
}
