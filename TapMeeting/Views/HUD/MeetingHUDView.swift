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
            // Match the main window toolbar brand symbol.
            Image(systemName: "bird.fill")
                .font(.system(size: 12))
                .symbolRenderingMode(.hierarchical)
                .foregroundColor(Theme.textPrimary)
            
            // Elapsed time (fixed minimum width avoids clipping at longer values, e.g. 50:34)
            Text(formattedElapsed)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .monospacedDigit()
                .foregroundColor(Theme.textPrimary)
                .frame(minWidth: 56, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            Capsule()
                .fill(Color(red: 0.94, green: 0.90, blue: 0.82).opacity(isHovered ? 0.98 : 0.94))
                .shadow(color: .black.opacity(0.14), radius: 12, y: 4)
        )
        .overlay(
            Capsule()
                .stroke(Theme.divider.opacity(0.9), lineWidth: 0.8)
        )
        .scaleEffect(isHovered ? 1.03 : 1.0)
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
