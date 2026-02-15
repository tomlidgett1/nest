import Foundation

extension Date {
    
    /// Relative description for display in note lists (e.g. "2 hours ago", "Yesterday").
    var relativeDescription: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: self, relativeTo: .now)
    }
    
    /// Short date and time string (e.g. "12 Feb 2026, 3:30 pm").
    var shortDateTime: String {
        formatted(date: .abbreviated, time: .shortened)
    }
    
    /// Time-only string (e.g. "3:30 pm").
    var timeOnly: String {
        formatted(date: .omitted, time: .shortened)
    }
}
