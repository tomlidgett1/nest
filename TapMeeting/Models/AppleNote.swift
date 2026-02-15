import Foundation

/// A note fetched from the macOS Apple Notes app via JavaScript for Automation (JXA).
/// Read-only — not persisted in SwiftData.
struct AppleNote: Identifiable, Hashable {
    
    /// Apple Notes internal identifier (e.g. "x-coredata://…/ICNote/p123").
    let id: String
    let title: String
    let folder: String
    let snippet: String
    let createdAt: Date
    let modifiedAt: Date
    
    /// Human-readable date string, relative when possible.
    var formattedDate: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(modifiedAt) {
            let formatter = DateFormatter()
            formatter.dateFormat = "h:mm a"
            return formatter.string(from: modifiedAt)
        }
        if calendar.isDateInYesterday(modifiedAt) {
            return "Yesterday"
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMM yyyy"
        return formatter.string(from: modifiedAt)
    }
}
