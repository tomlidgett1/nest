import SwiftUI

/// A floating HUD that appears when a meeting URL or app is detected.
/// Shows the meeting source, a "Start Recording" button, and a dismiss "X" button.
/// Styled as a dark pill/capsule matching the existing meeting HUD.
struct MeetingPromptHUDView: View {
    
    /// The name of the detected meeting source (e.g. "Google Meet").
    let meetingSource: String
    
    /// Called when the user taps "Start Recording".
    var onStartRecording: () -> Void
    
    /// Called when the user taps the dismiss button.
    var onDismiss: () -> Void
    
    @State private var isHovered = false
    
    var body: some View {
        HStack(spacing: 10) {
            // Meeting source label
            HStack(spacing: 6) {
                Circle()
                    .fill(Color.green)
                    .frame(width: 6, height: 6)
                
                Text(meetingSource)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.85))
                    .lineLimit(1)
            }
            
            // Start Recording button
            Button(action: onStartRecording) {
                HStack(spacing: 4) {
                    Image(systemName: "record.circle")
                        .font(.system(size: 10, weight: .semibold))
                    Text("Record")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    Capsule()
                        .fill(Color.green.opacity(0.9))
                )
            }
            .buttonStyle(.plain)
            
            // Dismiss button
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white.opacity(0.6))
                    .frame(width: 28, height: 28)
                    .contentShape(Circle())
                    .background(
                        Circle()
                            .fill(Color.white.opacity(0.12))
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 14)
        .padding(.trailing, 10)
        .padding(.vertical, 8)
        .background(
            Capsule()
                .fill(Color.black.opacity(isHovered ? 0.88 : 0.78))
                .shadow(color: .black.opacity(0.3), radius: 16, y: 4)
        )
        .overlay(
            Capsule()
                .stroke(Color.white.opacity(0.08), lineWidth: 0.5)
        )
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                isHovered = hovering
            }
        }
    }
}
