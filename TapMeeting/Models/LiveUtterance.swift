import Foundation

/// Lightweight in-memory representation of a transcribed utterance.
///
/// Used by `TranscriptStore` during live meetings. Unlike the `@Model Utterance`
/// class (which requires a SwiftData `ModelContext` and is not thread-safe),
/// this struct is safe to create, copy, and read from any thread.
///
/// Converted to a persisted `Utterance` when the meeting ends.
struct LiveUtterance: Identifiable, Sendable {
    let id: UUID
    let source: AudioSource
    let text: String
    let startTime: Date
    let endTime: Date
    let confidence: Float
    
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
    
    /// Create from a `TranscriptionResult`.
    init(from result: TranscriptionResult) {
        self.id = UUID()
        self.source = result.source
        self.text = result.text
        self.startTime = result.startTime
        self.endTime = result.endTime
        self.confidence = result.confidence
    }
}
