import Foundation

/// Distinguishes between meeting notes (with audio/transcript) and standalone notes (text only).
enum NoteType: String, Codable, Sendable {
    case meeting
    case standalone
    
    var displayName: String {
        switch self {
        case .meeting:    return "Meeting"
        case .standalone: return "Note"
        }
    }
    
    var iconName: String {
        switch self {
        case .meeting:    return "calendar.badge.clock"
        case .standalone: return "doc.text"
        }
    }
}
