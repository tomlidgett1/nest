import SwiftUI

/// A floating reminder HUD that appears 1 minute before a calendar event.
/// Styled with the warm cream/beige theme to match the rest of the app.
struct MeetingReminderHUDView: View {
    
    let eventTitle: String
    let eventTime: String
    let meetingURL: URL?
    let onJoin: () -> Void
    let onStartRecording: () -> Void
    let onDismiss: () -> Void
    
    @State private var isHovered = false
    @State private var appear = false
    
    var body: some View {
        HStack(spacing: 12) {
            // Calendar icon badge
            VStack(spacing: 0) {
                Image(systemName: "calendar")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Theme.olive)
            }
            .frame(width: 36, height: 36)
            .background(Theme.olive.opacity(0.12))
            .cornerRadius(8)
            
            // Event info
            VStack(alignment: .leading, spacing: 2) {
                Text(eventTitle)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.textPrimary)
                    .lineLimit(1)
                
                Text("Starting in 1 min · \(eventTime)")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textTertiary)
            }
            
            Spacer(minLength: 4)
            
            // Join button — only shown when a meeting link exists
            if meetingURL != nil {
                Button(action: onJoin) {
                    HStack(spacing: 4) {
                        Image(systemName: "video.fill")
                            .font(.system(size: 10, weight: .semibold))
                        Text("Join")
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundColor(Theme.olive)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Theme.olive.opacity(0.12))
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
            }
            
            // Record button
            Button(action: onStartRecording) {
                HStack(spacing: 4) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 10, weight: .semibold))
                    Text("Record")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Theme.olive)
                .cornerRadius(6)
            }
            .buttonStyle(.plain)
            
            // Dismiss button
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(Theme.textTertiary)
                    .frame(width: 24, height: 24)
                    .contentShape(Circle())
                    .background(
                        Circle()
                            .fill(Theme.divider)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 14)
        .padding(.trailing, 10)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Theme.cardBackground)
                .shadow(color: .black.opacity(isHovered ? 0.14 : 0.10), radius: isHovered ? 20 : 12, y: 4)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Theme.divider, lineWidth: 1)
        )
        .scaleEffect(appear ? 1.0 : 0.95)
        .opacity(appear ? 1.0 : 0)
        .onAppear {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                appear = true
            }
        }
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                isHovered = hovering
            }
        }
    }
}
