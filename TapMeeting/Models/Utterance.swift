import Foundation
import SwiftData

/// A single transcribed utterance from either the microphone or system audio stream.
@Model
final class Utterance {
    var id: UUID
    var source: AudioSource
    var text: String
    var startTime: Date
    var endTime: Date
    var confidence: Float
    
    /// Inverse relationship — the parent note.
    var note: Note?
    
    init(
        id: UUID = UUID(),
        source: AudioSource,
        text: String,
        startTime: Date,
        endTime: Date,
        confidence: Float = 1.0
    ) {
        self.id = id
        self.source = source
        self.text = text
        self.startTime = startTime
        self.endTime = endTime
        self.confidence = confidence
    }
}

// MARK: - Convenience

extension Utterance {
    /// Formatted timestamp relative to a meeting start time.
    func relativeTimestamp(from meetingStart: Date) -> String {
        let elapsed = startTime.timeIntervalSince(meetingStart)
        let minutes = Int(elapsed) / 60
        let seconds = Int(elapsed) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}
