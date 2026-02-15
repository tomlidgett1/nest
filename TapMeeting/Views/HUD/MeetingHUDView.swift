import SwiftUI

/// A compact floating HUD shown during a live meeting.
/// Pill-shaped with a green waveform icon and elapsed time.
/// Clicking it opens the main app window.
struct MeetingHUDView: View {
    
    @Environment(AppState.self) private var appState
    @State private var elapsed: TimeInterval = 0
    @State private var isHovered = false
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    
    var body: some View {
        HStack(spacing: 8) {
            // Green waveform icon
            Image(systemName: "waveform")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.green)
            
            // Elapsed time
            Text(formattedElapsed)
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundColor(.white.opacity(0.95))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            Capsule()
                .fill(Color.black.opacity(isHovered ? 0.85 : 0.75))
                .shadow(color: .black.opacity(0.25), radius: 12, y: 4)
        )
        .overlay(
            Capsule()
                .stroke(Color.white.opacity(0.08), lineWidth: 0.5)
        )
        .scaleEffect(isHovered ? 1.05 : 1.0)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                isHovered = hovering
            }
        }
        .onReceive(timer) { _ in
            if let start = appState.currentMeeting?.startedAt, !appState.isMeetingPaused {
                elapsed = Date.now.timeIntervalSince(start)
            }
        }
    }
    
    private var formattedElapsed: String {
        let m = Int(elapsed) / 60
        let s = Int(elapsed) % 60
        return String(format: "%d:%02d", m, s)
    }
}
