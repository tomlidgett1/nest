import Foundation

/// Identifies the origin of an audio stream or transcript utterance.
enum AudioSource: String, Codable, Sendable {
    /// Microphone input — the local user ("You").
    case mic
    /// System audio — remote participants ("Them").
    case system
    
    var displayLabel: String {
        switch self {
        case .mic:    return "You"
        case .system: return "Them"
        }
    }
}
