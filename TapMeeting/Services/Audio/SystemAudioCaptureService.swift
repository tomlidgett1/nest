import Foundation
import ScreenCaptureKit
import AVFoundation

/// Captures system audio using ScreenCaptureKit (SCStream).
/// Excludes the app's own audio to prevent feedback loops.
///
/// Registers both `.audio` and `.screen` output handlers so SCStream
/// doesn't log "stream output NOT found" errors for video frames.
///
/// ScreenCaptureKit delivers audio as **Float32** samples. We convert
/// to **Int16** (linear16) in-line so downstream consumers (Deepgram)
/// receive the correct format.
final class SystemAudioCaptureService: NSObject {
    
    private var stream: SCStream?
    private var isRunning = false
    
    /// Track whether we've logged the audio format for debugging.
    private var hasLoggedFormat = false
    
    // MARK: - Callbacks
    
    var onAudioBuffer: ((Data) -> Void)?
    var onLevelUpdate: ((Float) -> Void)?
    
    // MARK: - Control
    
    func start() async throws {
        guard !isRunning else { return }
        
        // Get available content to capture.
        let availableContent = try await SCShareableContent.excludingDesktopWindows(
            false,
            onScreenWindowsOnly: false
        )
        
        guard let display = availableContent.displays.first else {
            throw AudioCaptureError.noDisplayAvailable
        }
        
        // Build a content filter: capture the whole display but we only want audio.
        let filter = SCContentFilter(display: display, excludingWindows: [])
        
        // Configure stream — audio only, minimal video overhead.
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = Int(Constants.Audio.sampleRate)
        config.channelCount = Int(Constants.Audio.channels)
        
        // Minimise video overhead — we don't want screen content.
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        config.showsCursor = false
        
        let newStream = SCStream(filter: filter, configuration: config, delegate: self)
        
        // Register BOTH output types so SCStream doesn't log errors about missing handlers.
        let audioQueue = DispatchQueue(label: "com.tap.systemAudio", qos: .userInteractive)
        let videoQueue = DispatchQueue(label: "com.tap.systemVideo", qos: .background)
        
        try newStream.addStreamOutput(self, type: .audio, sampleHandlerQueue: audioQueue)
        try newStream.addStreamOutput(self, type: .screen, sampleHandlerQueue: videoQueue)
        
        try await newStream.startCapture()
        
        self.stream = newStream
        self.isRunning = true
        print("[SystemAudioCapture] ✓ Started — sampleRate: \(Constants.Audio.sampleRate), channels: \(Constants.Audio.channels)")
    }
    
    func stop() {
        guard isRunning, let stream else { return }
        
        Task {
            try? await stream.stopCapture()
        }
        
        self.stream = nil
        self.isRunning = false
        hasLoggedFormat = false
    }
    
    // MARK: - Float32 → Int16 Conversion
    
    /// Convert Float32 PCM samples to Int16 PCM (linear16) for Deepgram.
    private func convertFloat32ToInt16(_ data: Data) -> Data {
        let floatCount = data.count / MemoryLayout<Float>.size
        guard floatCount > 0 else { return Data() }
        
        var int16Data = Data(count: floatCount * MemoryLayout<Int16>.size)
        
        data.withUnsafeBytes { rawFloatBuffer in
            guard let floatPointer = rawFloatBuffer.baseAddress?.assumingMemoryBound(to: Float.self) else { return }
            
            int16Data.withUnsafeMutableBytes { rawInt16Buffer in
                guard let int16Pointer = rawInt16Buffer.baseAddress?.assumingMemoryBound(to: Int16.self) else { return }
                
                for i in 0..<floatCount {
                    // Clamp to [-1.0, 1.0] then scale to Int16 range.
                    let clamped = max(-1.0, min(1.0, floatPointer[i]))
                    int16Pointer[i] = Int16(clamped * Float(Int16.max))
                }
            }
        }
        
        return int16Data
    }
}

// MARK: - SCStreamOutput

extension SystemAudioCaptureService: SCStreamOutput {
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        // Silently drop video frames — we only care about audio.
        guard type == .audio else { return }
        
        // Log the audio format once for debugging.
        if !hasLoggedFormat, let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer) {
            let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc)?.pointee
            if let asbd {
                print("[SystemAudioCapture] Format: \(asbd.mFormatID == kAudioFormatLinearPCM ? "LPCM" : "other"), " +
                      "sampleRate: \(asbd.mSampleRate), channels: \(asbd.mChannelsPerFrame), " +
                      "bitsPerChannel: \(asbd.mBitsPerChannel), " +
                      "flags: \(String(format: "0x%X", asbd.mFormatFlags))")
            }
            hasLoggedFormat = true
        }
        
        guard let dataBuffer = sampleBuffer.dataBuffer else { return }
        
        let length = CMBlockBufferGetDataLength(dataBuffer)
        var rawData = Data(count: length)
        rawData.withUnsafeMutableBytes { rawBuffer in
            if let baseAddress = rawBuffer.baseAddress {
                CMBlockBufferCopyDataBytes(dataBuffer, atOffset: 0, dataLength: length, destination: baseAddress)
            }
        }
        
        // ScreenCaptureKit delivers Float32 audio. Convert to Int16 for Deepgram (linear16).
        let int16Data = convertFloat32ToInt16(rawData)
        
        // Calculate level from the original Float32 data (more accurate).
        let level = Self.calculateLevel(from: rawData)
        DispatchQueue.main.async { [weak self] in
            self?.onLevelUpdate?(level)
        }
        
        onAudioBuffer?(int16Data)
    }
    
    /// Calculate audio level from Float32 PCM data.
    private static func calculateLevel(from data: Data) -> Float {
        let floatCount = data.count / MemoryLayout<Float>.size
        guard floatCount > 0 else { return 0 }
        
        return data.withUnsafeBytes { buffer -> Float in
            guard let baseAddress = buffer.baseAddress?.assumingMemoryBound(to: Float.self) else { return 0 }
            var sum: Float = 0
            for i in 0..<floatCount {
                sum += abs(baseAddress[i])
            }
            let average = sum / Float(floatCount)
            return min(average * 5, 1.0)
        }
    }
}

// MARK: - SCStreamDelegate

extension SystemAudioCaptureService: SCStreamDelegate {
    func stream(_ stream: SCStream, didStopWithError error: any Error) {
        print("[SystemAudioCapture] Stream stopped: \(error.localizedDescription)")
        self.isRunning = false
        self.stream = nil
    }
}

// MARK: - Errors

enum AudioCaptureError: LocalizedError {
    case noDisplayAvailable
    case conversionFailed
    
    var errorDescription: String? {
        switch self {
        case .noDisplayAvailable:
            return "No display found for audio capture."
        case .conversionFailed:
            return "Audio format conversion failed."
        }
    }
}
