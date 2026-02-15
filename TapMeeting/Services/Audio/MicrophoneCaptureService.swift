import Foundation
import AVFoundation

/// Captures microphone audio using AVAudioEngine.
/// Outputs 16-bit PCM at 16kHz mono — ready for transcription.
///
/// Echo from system audio is handled at the transcript level
/// (deduplication in TranscriptStore) rather than hardware AEC,
/// which is unreliable on macOS AVAudioEngine.
///
/// Requests microphone permission automatically on first start.
/// If permission is denied the start is skipped with a console warning.
final class MicrophoneCaptureService {
    
    private let engine = AVAudioEngine()
    private var isRunning = false
    
    /// Reusable converter — created once per start(), not per buffer.
    private var converter: AVAudioConverter?
    private var capturedInputFormat: AVAudioFormat?
    
    /// Gain multiplier applied to mic samples before sending to transcription.
    /// Boosts quiet speech so Deepgram receives a stronger signal.
    /// 2.5× is a safe boost — Int16 samples are clamped to avoid clipping.
    private let micGain: Float = 2.5
    
    /// Target format for transcription: 16kHz, mono, 16-bit PCM.
    private let targetFormat: AVAudioFormat = {
        AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: Constants.Audio.sampleRate,
            channels: AVAudioChannelCount(Constants.Audio.channels),
            interleaved: true
        )!
    }()
    
    // MARK: - Callbacks
    
    /// Delivers raw PCM data for each audio buffer.
    var onAudioBuffer: ((Data) -> Void)?
    
    /// Delivers normalised audio level (0.0–1.0) for UI meters.
    var onLevelUpdate: ((Float) -> Void)?
    
    // MARK: - Control
    
    /// Start capturing. Requests microphone permission if needed (async).
    func start() async throws {
        guard !isRunning else { return }
        
        // 1. Check / request microphone permission.
        let authStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        print("[MicCapture] Permission status: \(authStatus.rawValue) (0=notDetermined, 1=restricted, 2=denied, 3=authorized)")
        
        if authStatus == .denied || authStatus == .restricted {
            print("[MicCapture] ✗ Microphone permission denied — open System Settings → Privacy & Security → Microphone")
            return
        }
        
        if authStatus == .notDetermined {
            print("[MicCapture] Requesting microphone permission…")
            let granted = await AVCaptureDevice.requestAccess(for: .audio)
            if !granted {
                print("[MicCapture] ✗ Microphone permission denied by user")
                return
            }
            print("[MicCapture] ✓ Microphone permission granted")
        }
        
        // 2. Get the input node and validate its format.
        let inputNode = engine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        
        print("[MicCapture] Input format: sampleRate=\(inputFormat.sampleRate), channels=\(inputFormat.channelCount), bits=\(inputFormat.streamDescription.pointee.mBitsPerChannel)")
        
        guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
            print("[MicCapture] ✗ Invalid input format — no microphone available?")
            return
        }
        
        // 3. Create the format converter once (reused for every buffer).
        guard let conv = AVAudioConverter(from: inputFormat, to: targetFormat) else {
            print("[MicCapture] ✗ Cannot create converter from \(inputFormat) → \(targetFormat)")
            return
        }
        self.converter = conv
        self.capturedInputFormat = inputFormat
        
        // 4. Install a tap on the input node to capture mic audio.
        inputNode.installTap(
            onBus: 0,
            bufferSize: 1024,
            format: inputFormat
        ) { [weak self] buffer, _ in
            self?.processBuffer(buffer)
        }
        
        // 5. Start the engine.
        engine.prepare()
        try engine.start()
        isRunning = true
        print("[MicCapture] ✓ Engine started — delivering \(inputFormat.sampleRate)Hz → 16000Hz Int16")
    }
    
    func stop() {
        guard isRunning else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        isRunning = false
        converter = nil
        capturedInputFormat = nil
        print("[MicCapture] Stopped")
    }
    
    // MARK: - Processing
    
    /// Amplify Int16 PCM samples in-place by `micGain`, clamping to avoid clipping.
    private func applyGain(to data: inout Data) {
        let sampleCount = data.count / MemoryLayout<Int16>.size
        guard sampleCount > 0 else { return }
        
        data.withUnsafeMutableBytes { raw in
            guard let ptr = raw.baseAddress?.assumingMemoryBound(to: Int16.self) else { return }
            for i in 0..<sampleCount {
                let amplified = Float(ptr[i]) * micGain
                // Clamp to Int16 range to prevent clipping distortion.
                ptr[i] = Int16(clamping: Int32(amplified))
            }
        }
    }
    
    private func processBuffer(_ buffer: AVAudioPCMBuffer) {
        // Calculate audio level for the VU meter.
        if let channelData = buffer.floatChannelData?[0] {
            let frames = Int(buffer.frameLength)
            var sum: Float = 0
            for i in 0..<frames {
                sum += abs(channelData[i])
            }
            let average = sum / Float(max(frames, 1))
            let boostedLevel = average * micGain
            DispatchQueue.main.async { [weak self] in
                self?.onLevelUpdate?(min(boostedLevel * 5, 1.0))
            }
        }
        
        // Convert to target format (16kHz, mono, 16-bit) using the pre-built converter.
        guard let converter, let inputFormat = capturedInputFormat else { return }
        
        let ratio = targetFormat.sampleRate / inputFormat.sampleRate
        let outputFrameCount = AVAudioFrameCount(Double(buffer.frameLength) * ratio)
        
        guard outputFrameCount > 0,
              let outputBuffer = AVAudioPCMBuffer(
                pcmFormat: targetFormat,
                frameCapacity: outputFrameCount
              ) else { return }
        
        var error: NSError?
        var hasData = false
        
        converter.convert(to: outputBuffer, error: &error) { _, outStatus in
            if hasData {
                outStatus.pointee = .noDataNow
                return nil
            }
            hasData = true
            outStatus.pointee = .haveData
            return buffer
        }
        
        if let error {
            print("[MicCapture] Conversion error: \(error.localizedDescription)")
            return
        }
        
        guard outputBuffer.frameLength > 0 else { return }
        
        // Apply mic gain boost to improve transcription of quiet speech.
        var data = outputBuffer.toData()
        applyGain(to: &data)
        onAudioBuffer?(data)
    }
}
