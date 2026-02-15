import SwiftUI

/// Compact meeting status indicator.
struct MeetingStatusView: View {
    
    @Environment(AppState.self) private var appState
    
    var body: some View {
        if appState.isMeetingActive {
            HStack(spacing: 6) {
                Circle()
                    .fill(Theme.recording)
                    .frame(width: 6, height: 6)
                
                Text("Recording")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Theme.textSecondary)
            }
        }
    }
}
