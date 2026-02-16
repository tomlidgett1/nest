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
    /// Whether the user has viewed this to-do on the To-Dos page.
    /// AI-extracted to-dos start as unseen; manually created ones start as seen.
    var isSeen: Bool = false
    
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
        isDeleted: Bool = false,
        isSeen: Bool = false
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
        self.isSeen = isSeen
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

// MARK: - Email Category (for exclusion rules)

/// Categories of email that can be excluded from automatic to-do extraction.
/// Each category has heuristic detection based on sender, subject, labels, and attachments.
enum EmailCategory: String, CaseIterable, Identifiable {
    case meetingInvites = "meeting_invites"
    case newsletters = "newsletters"
    case promotions = "promotions"
    case notifications = "notifications"
    case receipts = "receipts"
    
    var id: String { rawValue }
    
    var label: String {
        switch self {
        case .meetingInvites: return "Meeting Invites"
        case .newsletters: return "Newsletters & Digests"
        case .promotions: return "Marketing & Promotions"
        case .notifications: return "Automated Notifications"
        case .receipts: return "Receipts & Orders"
        }
    }
    
    var icon: String {
        switch self {
        case .meetingInvites: return "calendar.badge.plus"
        case .newsletters: return "newspaper"
        case .promotions: return "tag"
        case .notifications: return "bell"
        case .receipts: return "receipt"
        }
    }
    
    var explanation: String {
        switch self {
        case .meetingInvites: return "Google Calendar, Zoom, Teams invites"
        case .newsletters: return "Recurring newsletters and digest emails"
        case .promotions: return "Sales, deals, and marketing emails"
        case .notifications: return "System alerts, password resets, etc."
        case .receipts: return "Order confirmations, invoices, shipping"
        }
    }
    
    // MARK: - Email Classification
    
    /// Classify a Gmail message into zero or more email categories
    /// using subject, sender, labels, and attachment heuristics.
    static func classify(
        subject: String,
        fromEmail: String,
        labelIds: [String] = [],
        attachmentFilenames: [String] = [],
        attachmentMimeTypes: [String] = []
    ) -> Set<EmailCategory> {
        var categories: Set<EmailCategory> = []
        let subjectLower = subject.lowercased()
        let fromLower = fromEmail.lowercased()
        
        // ── Meeting Invites ──────────────────────────────────
        let calendarSenders = [
            "calendar-notification@google.com",
            "calendar@google.com",
            "noreply@zoom.us",
            "no-reply@zoom.us",
            "noreply@teams.microsoft.com",
            "no-reply@teams.microsoft.com",
            "noreply@webex.com"
        ]
        let invitePrefixes = [
            "invitation:", "accepted:", "declined:", "tentative:",
            "updated invitation:", "canceled event:", "cancelled event:",
            "rsvp:"
        ]
        let hasCalendarAttachment = attachmentFilenames.contains(where: { $0.lowercased().hasSuffix(".ics") })
            || attachmentMimeTypes.contains("text/calendar")
            || attachmentMimeTypes.contains("application/ics")
        
        if calendarSenders.contains(fromLower)
            || invitePrefixes.contains(where: { subjectLower.hasPrefix($0) })
            || subjectLower.contains("has invited you to")
            || subjectLower.contains("calendar invitation")
            || subjectLower.contains("event invitation")
            || hasCalendarAttachment {
            categories.insert(.meetingInvites)
        }
        
        // ── Newsletters & Digests ────────────────────────────
        let newsletterKeywords = [
            "newsletter", "weekly digest", "monthly digest",
            "daily digest", "weekly roundup", "weekly update",
            "monthly roundup", "daily briefing", "weekly briefing"
        ]
        if newsletterKeywords.contains(where: { subjectLower.contains($0) }) {
            categories.insert(.newsletters)
        }
        
        // ── Marketing & Promotions ───────────────────────────
        if labelIds.contains("CATEGORY_PROMOTIONS") {
            categories.insert(.promotions)
        }
        let promoKeywords = [
            "% off", "sale ends", "limited time offer",
            "exclusive offer", "special offer", "flash sale",
            "don't miss out", "act now", "last chance",
            "promo code", "coupon code", "free shipping"
        ]
        if promoKeywords.contains(where: { subjectLower.contains($0) }) {
            categories.insert(.promotions)
        }
        
        // ── Automated Notifications ──────────────────────────
        let notifSenderPatterns = [
            "noreply@", "no-reply@", "notifications@",
            "notification@", "alerts@", "alert@",
            "mailer-daemon@", "postmaster@", "donotreply@"
        ]
        let isNotifSender = notifSenderPatterns.contains(where: { fromLower.hasPrefix($0) })
        // Only classify as notification if NOT already a meeting invite
        // (calendar senders are also noreply but shouldn't double-match)
        if isNotifSender && !categories.contains(.meetingInvites) {
            categories.insert(.notifications)
        }
        
        // ── Receipts & Orders ────────────────────────────────
        let receiptKeywords = [
            "your receipt", "order confirmation", "payment confirmation",
            "payment received", "invoice #", "invoice for",
            "shipping confirmation", "delivery confirmation",
            "your order", "purchase confirmation"
        ]
        if receiptKeywords.contains(where: { subjectLower.contains($0) }) {
            categories.insert(.receipts)
        }
        
        return categories
    }
    
    /// Lightweight classification using only to-do metadata (sender + subject).
    /// Used for retroactive removal when a category exclusion is enabled.
    static func classifyFromTodoMetadata(senderEmail: String?, sourceTitle: String?) -> Set<EmailCategory> {
        classify(
            subject: sourceTitle ?? "",
            fromEmail: senderEmail ?? ""
        )
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
