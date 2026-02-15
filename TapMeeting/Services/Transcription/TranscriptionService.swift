import Foundation

/// Protocol defining the transcription service interface.
/// Implementations can be swapped (e.g. Deepgram, local Whisper, mock).
protocol TranscriptionServiceProtocol: AnyObject {
    /// Whether the service is currently connected and receiving audio.
    var isConnected: Bool { get }
    
    /// Start a transcription session for the given audio source.
    func connect(for source: AudioSource) async throws
    
    /// Send raw PCM audio data for transcription.
    func sendAudio(_ data: Data)
    
    /// Disconnect the transcription session.
    func disconnect()
    
    /// Called when a new utterance (final or interim) is received.
    var onUtterance: ((TranscriptionResult) -> Void)? { get set }
    
    /// Called when a VAD (voice activity detection) event fires.
    var onVADEvent: ((VADEvent) -> Void)? { get set }
}

/// A transcription result from the service.
struct TranscriptionResult: Sendable {
    let text: String
    let source: AudioSource
    let startTime: Date
    let endTime: Date
    let confidence: Float
    let isFinal: Bool
    /// Indicates an endpoint/pause boundary for this segment.
    let speechFinal: Bool
}

/// Voice Activity Detection event types.
enum VADEvent: Sendable {
    case speechStarted
    case speechEnded
}
