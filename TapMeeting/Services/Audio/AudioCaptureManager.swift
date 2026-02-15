import Foundation
import AVFoundation
import Combine

/// Orchestrates dual-stream audio capture (microphone + system audio).
/// Provides PCM audio buffers to downstream consumers (e.g. transcription).
///
/// The mic stream has Apple Voice Processing (AEC) enabled when available,
/// which reduces echo from system audio playing through speakers.
///
/// Both mic and system capture are started asynchronously so permission
/// prompts don't block the main thread.
@Observable
final class AudioCaptureManager {
    
    // MARK: - State
    
    var isCapturing = false
    var isMicActive = false
    var isSystemAudioActive = false
    var micLevel: Float = 0
    var systemLevel: Float = 0
    
    // MARK: - Services
    
    private let micCapture = MicrophoneCaptureService()
    private let systemCapture = SystemAudioCaptureService()
    
    // MARK: - Callbacks
    
    /// Called when new PCM audio data arrives from either stream.
    var onAudioBuffer: ((Data, AudioSource) -> Void)?
    
    // MARK: - Capture Control
    
    func startCapture() {
        guard !isCapturing else { return }
        isCapturing = true
        
        print("[AudioCaptureManager] Starting capture…")
        startMicCapture()
        startSystemAudioCapture()
    }
    
    func stopCapture() {
        guard isCapturing else { return }
        
        micCapture.stop()
        systemCapture.stop()
        
        isMicActive = false
        isSystemAudioActive = false
        isCapturing = false
        micLevel = 0
        systemLevel = 0
        print("[AudioCaptureManager] Stopped")
    }
    
    // MARK: - Mic
    
    private func startMicCapture() {
        let captureEnabled = UserDefaults.standard.object(forKey: Constants.Defaults.captureMicAudio) as? Bool ?? true
        guard captureEnabled else {
            print("[AudioCaptureManager] Mic capture disabled in settings")
            return
        }
        
        micCapture.onAudioBuffer = { [weak self] data in
            guard let self else { return }
            self.isMicActive = true
            self.onAudioBuffer?(data, .mic)
        }
        
        micCapture.onLevelUpdate = { [weak self] level in
            self?.micLevel = level
        }
        
        Task {
            do {
                try await micCapture.start()
                await MainActor.run { self.isMicActive = true }
            } catch {
                print("[AudioCaptureManager] ✗ Mic capture failed: \(error.localizedDescription)")
                await MainActor.run { self.isMicActive = false }
            }
        }
    }
    
    // MARK: - System Audio
    
    private func startSystemAudioCapture() {
        let captureEnabled = UserDefaults.standard.object(forKey: Constants.Defaults.captureSystemAudio) as? Bool ?? true
        guard captureEnabled else {
            print("[AudioCaptureManager] System audio capture disabled in settings")
            return
        }
        
        systemCapture.onAudioBuffer = { [weak self] data in
            guard let self else { return }
            self.isSystemAudioActive = true
            self.onAudioBuffer?(data, .system)
        }
        
        systemCapture.onLevelUpdate = { [weak self] level in
            self?.systemLevel = level
        }
        
        Task {
            do {
                try await systemCapture.start()
                await MainActor.run { self.isSystemAudioActive = true }
            } catch {
                print("[AudioCaptureManager] ✗ System audio capture failed: \(error.localizedDescription)")
                await MainActor.run { self.isSystemAudioActive = false }
            }
        }
    }
}
