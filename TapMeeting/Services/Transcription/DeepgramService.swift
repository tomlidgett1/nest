import Foundation

/// Deepgram WebSocket streaming transcription service.
/// Uses native URLSessionWebSocketTask — no external dependencies required.
///
/// Supports two modes:
///   - **Single-channel** (`multichannel = false`): One connection per audio source.
///     Sends mono 16-bit PCM at 16 kHz.
///   - **Multichannel** (`multichannel = true`): Single connection receiving interleaved
///     stereo PCM (channel 0 = mic, channel 1 = system). Deepgram transcribes each
///     channel independently and returns `channel_index` in results.
///
/// Audio sent before the WebSocket is connected is queued (up to `maxQueueBytes`)
/// and flushed once the connection opens. This avoids losing the first few hundred
/// milliseconds while the TCP + TLS + upgrade handshake completes.
final class DeepgramService: TranscriptionServiceProtocol {
    
    // MARK: - Protocol Properties
    
    private(set) var isConnected = false
    var onUtterance: ((TranscriptionResult) -> Void)?
    var onVADEvent: ((VADEvent) -> Void)?
    
    // MARK: - Configuration
    
    private let source: AudioSource
    
    /// Whether this service uses multichannel mode (2-channel interleaved audio).
    private let multichannel: Bool
    
    /// Maps Deepgram channel indices to AudioSource.
    /// Channel 0 = mic (local user), Channel 1 = system (remote participants).
    private let channelSourceMap: [Int: AudioSource] = [
        0: .mic,
        1: .system
    ]
    
    /// Timestamp when the WebSocket connection was established.
    /// Used to convert Deepgram's relative audio-stream seconds into absolute Dates.
    private var connectionStartDate: Date?
    
    // MARK: - WebSocket
    
    private var webSocketTask: URLSessionWebSocketTask?
    private let urlSession: URLSession
    private var keepAliveTimer: Timer?
    
    /// Retry state for automatic reconnection.
    private var reconnectAttempt = 0
    private let maxReconnectAttempts = 5
    private var isIntentionalDisconnect = false
    
    // MARK: - Pre-connect Audio Queue
    
    /// Queue audio buffers sent before the WebSocket is ready.
    private var pendingAudioQueue: [Data] = []
    /// Cap the queue at ~2 seconds of audio.
    /// Mono (16kHz Int16): ~64 KB/s. Stereo multichannel: ~128 KB/s.
    private let maxQueueBytes = 128_000
    private var currentQueueBytes = 0
    
    /// Debug counter for received messages.
    private var receivedMessageCount = 0
    /// Debug counter for sent audio buffers.
    private var sentBufferCount = 0
    
    // MARK: - Init
    
    /// - Parameters:
    ///   - source: The audio source label for single-channel mode. For multichannel
    ///     mode this is used as the default/fallback source label.
    ///   - multichannel: When `true`, configures for 2-channel interleaved stereo input.
    ///     Deepgram will transcribe each channel independently and return `channel_index`.
    init(source: AudioSource, multichannel: Bool = false) {
        self.source = source
        self.multichannel = multichannel
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        self.urlSession = URLSession(configuration: config)
    }
    
    deinit {
        isIntentionalDisconnect = true
        keepAliveTimer?.invalidate()
        webSocketTask?.cancel(with: .goingAway, reason: nil)
    }
    
    // MARK: - TranscriptionServiceProtocol
    
    func connect(for source: AudioSource) async throws {
        guard !isConnected else { return }
        isIntentionalDisconnect = false
        
        guard let apiKey = KeychainHelper.get(key: Constants.Keychain.deepgramAPIKey), !apiKey.isEmpty else {
            throw DeepgramError.missingAPIKey
        }
        
        let url = buildWebSocketURL()
        var request = URLRequest(url: url)
        request.setValue("Token \(apiKey)", forHTTPHeaderField: "Authorization")
        
        let task = urlSession.webSocketTask(with: request)
        self.webSocketTask = task
        task.resume()
        
        connectionStartDate = Date.now
        isConnected = true
        reconnectAttempt = 0
        receivedMessageCount = 0
        sentBufferCount = 0
        
        print("[DeepgramService] Connected for \(source.rawValue) (multichannel=\(multichannel)) → \(url.absoluteString)")
        
        // Flush any audio that arrived before the connection was ready.
        flushPendingAudio()
        
        // Start listening for messages from Deepgram.
        startReceiving()
        
        // Start sending KeepAlive every 8 seconds to avoid the 10-second timeout.
        startKeepAliveTimer()
    }
    
    func sendAudio(_ data: Data) {
        // If not yet connected, queue the audio so it isn't lost.
        guard isConnected, let task = webSocketTask else {
            if currentQueueBytes < maxQueueBytes {
                pendingAudioQueue.append(data)
                currentQueueBytes += data.count
            }
            return
        }
        
        sentBufferCount += 1
        
        // Log periodically (~every 2 seconds at 50 buffers/sec for multichannel).
        if sentBufferCount % 100 == 1 {
            print("[DeepgramService] Sent buffer #\(sentBufferCount) (\(data.count) bytes, multichannel=\(multichannel), connected=\(isConnected))")
        }
        
        // Audio is sent as a binary WebSocket frame.
        let message = URLSessionWebSocketTask.Message.data(data)
        task.send(message) { error in
            if let error = error {
                print("[DeepgramService] Send error (\(self.source.rawValue)): \(error.localizedDescription)")
            }
        }
    }
    
    func disconnect() {
        isIntentionalDisconnect = true
        sendCloseStream()
        tearDown()
        print("[DeepgramService] Disconnected for \(source.rawValue) — received \(receivedMessageCount) messages")
    }
    
    // MARK: - WebSocket URL
    
    private func buildWebSocketURL() -> URL {
        var components = URLComponents(string: "wss://api.deepgram.com/v1/listen")!
        
        let channelCount = multichannel
            ? String(Constants.Audio.multichannelCount)
            : String(Constants.Audio.channels)
        
        var queryItems = [
            URLQueryItem(name: "model", value: Constants.Transcription.model),
            URLQueryItem(name: "language", value: Constants.Transcription.language),
            URLQueryItem(name: "encoding", value: "linear16"),
            URLQueryItem(name: "sample_rate", value: String(Int(Constants.Audio.sampleRate))),
            URLQueryItem(name: "channels", value: channelCount),
            URLQueryItem(name: "smart_format", value: "true"),
            URLQueryItem(name: "interim_results", value: "true"),
            URLQueryItem(name: "vad_events", value: "true"),
            URLQueryItem(name: "utterance_end_ms", value: "1500"),
            URLQueryItem(name: "endpointing", value: String(Constants.Transcription.endpointingMs)),
        ]
        
        // Enable multichannel so Deepgram transcribes each channel independently.
        if multichannel {
            queryItems.append(URLQueryItem(name: "multichannel", value: "true"))
        }
        
        components.queryItems = queryItems
        return components.url!
    }
    
    // MARK: - Pre-connect Queue
    
    /// Send all queued audio that was buffered before the WebSocket connected.
    private func flushPendingAudio() {
        guard !pendingAudioQueue.isEmpty, let task = webSocketTask else { return }
        
        let count = pendingAudioQueue.count
        let bytes = currentQueueBytes
        print("[DeepgramService] Flushing \(count) queued buffers (\(bytes) bytes) for \(source.rawValue)")
        
        for chunk in pendingAudioQueue {
            let message = URLSessionWebSocketTask.Message.data(chunk)
            task.send(message) { _ in }
        }
        
        pendingAudioQueue.removeAll()
        currentQueueBytes = 0
    }
    
    // MARK: - Receive Loop
    
    /// Continuously listens for incoming WebSocket messages from Deepgram.
    private func startReceiving() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success(let message):
                self.receivedMessageCount += 1
                self.handleMessage(message)
                // Keep listening for the next message.
                self.startReceiving()
                
            case .failure(let error):
                print("[DeepgramService] Receive error (\(self.source.rawValue)): \(error.localizedDescription)")
                self.handleDisconnection()
            }
        }
    }
    
    // MARK: - Message Handling
    
    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        let data: Data
        switch message {
        case .string(let text):
            guard let d = text.data(using: .utf8) else { return }
            data = d
        case .data(let d):
            data = d
        @unknown default:
            return
        }
        
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            return
        }
        
        switch type {
        case "Results":
            handleResults(json)
        case "SpeechStarted":
            print("[DeepgramService] VAD: SpeechStarted (\(source.rawValue))")
            DispatchQueue.main.async {
                self.onVADEvent?(.speechStarted)
            }
        case "UtteranceEnd":
            print("[DeepgramService] VAD: UtteranceEnd (\(source.rawValue))")
            DispatchQueue.main.async {
                self.onVADEvent?(.speechEnded)
            }
        case "Metadata":
            // Initial connection metadata — log for diagnostics.
            if let requestId = json["request_id"] as? String {
                print("[DeepgramService] Session \(source.rawValue) request_id: \(requestId)")
            }
        default:
            print("[DeepgramService] Unknown message type: \(type) (\(source.rawValue))")
        }
    }
    
    /// Parse a `Results` message and emit a `TranscriptionResult`.
    ///
    /// In multichannel mode, each result includes a `channel_index` array:
    ///   `[channelNumber, totalChannels]` — e.g. `[0, 2]` for mic, `[1, 2]` for system.
    /// We map the channel number to an `AudioSource` for proper attribution.
    private func handleResults(_ json: [String: Any]) {
        guard let channel = json["channel"] as? [String: Any],
              let alternatives = channel["alternatives"] as? [[String: Any]],
              let firstAlt = alternatives.first,
              let transcript = firstAlt["transcript"] as? String else {
            return
        }
        
        let isFinal = json["is_final"] as? Bool ?? false
        let speechFinal = json["speech_final"] as? Bool ?? false
        
        guard !transcript.isEmpty else {
            // Empty transcript — Deepgram sends these between speech segments. Normal.
            return
        }
        
        let confidence = (firstAlt["confidence"] as? Double).map { Float($0) } ?? 0
        let start = json["start"] as? Double ?? 0
        let duration = json["duration"] as? Double ?? 0
        
        let baseDate = connectionStartDate ?? Date.now
        let startTime = baseDate.addingTimeInterval(start)
        let endTime = baseDate.addingTimeInterval(start + duration)
        
        // Determine audio source: in multichannel mode, use channel_index.
        // channel_index is [channelNumber, totalChannels] — e.g. [0, 2] or [1, 2].
        let resolvedSource: AudioSource
        if multichannel,
           let channelIndex = json["channel_index"] as? [Int],
           let channelNumber = channelIndex.first,
           let mapped = channelSourceMap[channelNumber] {
            resolvedSource = mapped
        } else {
            resolvedSource = source
        }
        
        print("[DeepgramService] \(isFinal ? "FINAL" : "interim") (\(resolvedSource.rawValue)): \"\(transcript.prefix(60))\" conf=\(String(format: "%.2f", confidence))\(multichannel ? " ch=\(json["channel_index"] ?? "?")" : "")")
        
        let result = TranscriptionResult(
            text: transcript,
            source: resolvedSource,
            startTime: startTime,
            endTime: endTime,
            confidence: confidence,
            isFinal: isFinal,
            speechFinal: speechFinal
        )
        
        DispatchQueue.main.async {
            self.onUtterance?(result)
        }
    }
    
    // MARK: - KeepAlive
    
    private func startKeepAliveTimer() {
        keepAliveTimer?.invalidate()
        // Timer must be scheduled on the main run loop.
        DispatchQueue.main.async {
            self.keepAliveTimer = Timer.scheduledTimer(
                withTimeInterval: 8,
                repeats: true
            ) { [weak self] _ in
                self?.sendKeepAlive()
            }
        }
    }
    
    private func sendKeepAlive() {
        guard isConnected, let task = webSocketTask else { return }
        let message = URLSessionWebSocketTask.Message.string("{\"type\":\"KeepAlive\"}")
        task.send(message) { error in
            if let error = error {
                print("[DeepgramService] KeepAlive error (\(self.source.rawValue)): \(error.localizedDescription)")
            }
        }
    }
    
    // MARK: - CloseStream
    
    /// Sends a graceful `CloseStream` text message before tearing down the socket.
    private func sendCloseStream() {
        guard let task = webSocketTask else { return }
        let message = URLSessionWebSocketTask.Message.string("{\"type\":\"CloseStream\"}")
        task.send(message) { _ in }
    }
    
    // MARK: - Reconnection
    
    private func handleDisconnection() {
        tearDown()
        
        guard !isIntentionalDisconnect,
              reconnectAttempt < maxReconnectAttempts else {
            return
        }
        
        reconnectAttempt += 1
        let delay = min(pow(2.0, Double(reconnectAttempt)), 16.0) // Exponential back-off, max 16s.
        print("[DeepgramService] Reconnecting \(source.rawValue) in \(delay)s (attempt \(reconnectAttempt)/\(maxReconnectAttempts))")
        
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self = self, !self.isIntentionalDisconnect else { return }
            Task {
                try? await self.connect(for: self.source)
            }
        }
    }
    
    // MARK: - Teardown
    
    private func tearDown() {
        keepAliveTimer?.invalidate()
        keepAliveTimer = nil
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        isConnected = false
        pendingAudioQueue.removeAll()
        currentQueueBytes = 0
    }
}

// MARK: - Errors

enum DeepgramError: LocalizedError {
    case missingAPIKey
    case connectionFailed(String)
    
    var errorDescription: String? {
        switch self {
        case .missingAPIKey:
            return "Deepgram API key not found. Please add it in Preferences → Account."
        case .connectionFailed(let reason):
            return "Deepgram connection failed: \(reason)"
        }
    }
}
