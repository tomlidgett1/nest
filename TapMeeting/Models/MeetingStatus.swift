import Foundation

/// Lifecycle status of a meeting note.
enum MeetingStatus: String, Codable, Sendable {
    /// Meeting is currently in progress; audio is being captured.
    case inProgress
    /// Meeting has ended; transcript is saved but not yet enhanced.
    case ended
    /// Notes have been enhanced by AI.
    case enhanced
    /// Standalone note — no audio pipeline involved.
    case standalone
    
    var displayName: String {
        switch self {
        case .inProgress: return "In Progress"
        case .ended:      return "Ended"
        case .enhanced:   return "Enhanced"
        case .standalone: return "Note"
        }
    }
    
    var iconName: String {
        switch self {
        case .inProgress: return "waveform"
        case .ended:      return "checkmark.circle"
        case .enhanced:   return "sparkles"
        case .standalone: return "doc.text"
        }
    }
}
