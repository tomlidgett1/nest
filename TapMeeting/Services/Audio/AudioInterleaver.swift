import Foundation

/// Synchronises and interleaves two independent mono audio streams (mic + system)
/// into a single stereo (2-channel) interleaved PCM stream suitable for Deepgram's
/// multichannel mode.
///
/// # How it works
///
/// Both `MicrophoneCaptureService` and `SystemAudioCaptureService` produce 16 kHz
/// mono Int16 PCM buffers asynchronously. This class:
///
/// 1. Buffers incoming samples from each source in thread-safe ring buffers.
/// 2. A high-priority timer fires every 20 ms (320 samples at 16 kHz).
/// 3. For each tick, it reads 320 samples from each buffer — padding with silence
///    if a source hasn't produced enough data yet.
/// 4. Interleaves them into stereo frames: [mic₀, sys₀, mic₁, sys₁, …]
/// 5. Delivers the interleaved `Data` via `onInterleavedBuffer`.
///
/// Channel mapping:
///   - Channel 0 (left)  = Microphone  (local user / "You")
///   - Channel 1 (right) = System audio (remote participants / "Them")
///
/// This lets Deepgram see both channels simultaneously, enabling it to:
///   - Transcribe each channel independently
///   - Suppress echo (mic picking up system audio through speakers)
///   - Return results tagged with `channel_index` for source attribution
final class AudioInterleaver {
    
    // MARK: - Configuration
    
    /// Samples per interleave tick (20 ms at 16 kHz).
    private let samplesPerTick: Int = 320
    
    /// Bytes per sample (Int16 = 2 bytes).
    private let bytesPerSample: Int = MemoryLayout<Int16>.size
    
    // MARK: - Buffers
    
    /// Accumulated mic PCM data waiting to be interleaved.
    private var micBuffer = Data()
    
    /// Accumulated system PCM data waiting to be interleaved.
    private var systemBuffer = Data()
    
    /// Protects buffer access from concurrent reads/writes.
    private let lock = NSLock()
    
    /// Maximum buffer size per source (~2 seconds at 16 kHz Int16).
    /// Prevents unbounded memory growth if one source stalls.
    private let maxBufferBytes = 64_000
    
    // MARK: - Timer
    
    private var timer: DispatchSourceTimer?
    private let timerQueue = DispatchQueue(label: "com.tap.audioInterleaver", qos: .userInteractive)
    
    // MARK: - Callbacks
    
    /// Delivers interleaved stereo PCM data (2-channel, 16 kHz, Int16).
    var onInterleavedBuffer: ((Data) -> Void)?
    
    /// Delivers per-source audio levels for UI meters.
    var onMicLevel: ((Float) -> Void)?
    var onSystemLevel: ((Float) -> Void)?
    
    // MARK: - State
    
    private(set) var isRunning = false
    
    /// Debug: count of interleaved ticks produced.
    private var tickCount: Int = 0
    /// Debug: count of mic bytes received.
    private var totalMicBytesReceived: Int = 0
    /// Debug: count of system bytes received.
    private var totalSystemBytesReceived: Int = 0
    
    // MARK: - Control
    
    func start() {
        guard !isRunning else { return }
        isRunning = true
        
        let timer = DispatchSource.makeTimerSource(flags: .strict, queue: timerQueue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(20), leeway: .milliseconds(1))
        timer.setEventHandler { [weak self] in
            self?.produceTick()
        }
        timer.resume()
        self.timer = timer
        
        print("[AudioInterleaver] ✓ Started — 20ms ticks, \(samplesPerTick) samples/tick/channel")
    }
    
    func stop() {
        guard isRunning else { return }
        
        timer?.cancel()
        timer = nil
        
        lock.lock()
        micBuffer = Data()
        systemBuffer = Data()
        lock.unlock()
        
        isRunning = false
        tickCount = 0
        totalMicBytesReceived = 0
        totalSystemBytesReceived = 0
        print("[AudioInterleaver] Stopped")
    }
    
    // MARK: - Input
    
    /// Append mono Int16 PCM data from the microphone.
    func appendMicAudio(_ data: Data) {
        lock.lock()
        totalMicBytesReceived += data.count
        micBuffer.append(data)
        // Trim if buffer grows too large (drop oldest data).
        if micBuffer.count > maxBufferBytes {
            micBuffer = Data(micBuffer.suffix(maxBufferBytes))
        }
        lock.unlock()
    }
    
    /// Append mono Int16 PCM data from system audio.
    func appendSystemAudio(_ data: Data) {
        lock.lock()
        totalSystemBytesReceived += data.count
        systemBuffer.append(data)
        if systemBuffer.count > maxBufferBytes {
            systemBuffer = Data(systemBuffer.suffix(maxBufferBytes))
        }
        lock.unlock()
    }
    
    // MARK: - Interleaving
    
    /// Called every 20 ms. Reads aligned samples from both buffers, interleaves,
    /// and delivers the combined stereo frame.
    private func produceTick() {
        let bytesNeeded = samplesPerTick * bytesPerSample  // 640 bytes per channel
        
        lock.lock()
        
        // Extract mic data (pad with silence if insufficient).
        let micData: Data
        if micBuffer.count >= bytesNeeded {
            micData = micBuffer.prefix(bytesNeeded)
            micBuffer = Data(micBuffer.dropFirst(bytesNeeded))
        } else {
            // Pad with silence (zeros = silence in PCM).
            var padded = micBuffer
            padded.append(Data(count: bytesNeeded - micBuffer.count))
            micData = padded
            micBuffer = Data()
        }
        
        // Extract system data (pad with silence if insufficient).
        let systemData: Data
        if systemBuffer.count >= bytesNeeded {
            systemData = systemBuffer.prefix(bytesNeeded)
            systemBuffer = Data(systemBuffer.dropFirst(bytesNeeded))
        } else {
            var padded = systemBuffer
            padded.append(Data(count: bytesNeeded - systemBuffer.count))
            systemData = padded
            systemBuffer = Data()
        }
        
        lock.unlock()
        
        // Interleave: [mic₀, sys₀, mic₁, sys₁, …]
        // Output is 2-channel interleaved Int16 → bytesNeeded * 2 total bytes.
        let stereoByteCount = bytesNeeded * 2
        var interleaved = Data(count: stereoByteCount)
        
        micData.withUnsafeBytes { micRaw in
            systemData.withUnsafeBytes { sysRaw in
                interleaved.withUnsafeMutableBytes { outRaw in
                    guard let micPtr = micRaw.baseAddress?.assumingMemoryBound(to: Int16.self),
                          let sysPtr = sysRaw.baseAddress?.assumingMemoryBound(to: Int16.self),
                          let outPtr = outRaw.baseAddress?.assumingMemoryBound(to: Int16.self) else {
                        return
                    }
                    
                    for i in 0..<samplesPerTick {
                        outPtr[i * 2]     = micPtr[i]   // Channel 0 = mic
                        outPtr[i * 2 + 1] = sysPtr[i]   // Channel 1 = system
                    }
                }
            }
        }
        
        tickCount += 1
        
        // Log every ~2 seconds (100 ticks at 20ms each) for diagnostics.
        if tickCount % 100 == 1 {
            print("[AudioInterleaver] Tick #\(tickCount) — mic: \(totalMicBytesReceived) bytes, system: \(totalSystemBytesReceived) bytes, output: \(interleaved.count) bytes")
        }
        
        onInterleavedBuffer?(interleaved)
    }
}
