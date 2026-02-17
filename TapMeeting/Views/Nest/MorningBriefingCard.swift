import SwiftUI

/// Warm, conversational AI-generated morning briefing card.
/// Text streams in token-by-token when first generated.
struct MorningBriefingCard: View {
    
    let text: String
    let isStreaming: Bool
    let onDismiss: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.olive)
                    Text("Your Morning Briefing")
                        .font(Theme.captionFont(12))
                        .foregroundColor(Theme.textSecondary)
                }
                
                Spacer()
                
                if !isStreaming {
                    Button(action: onDismiss) {
                        Image(systemName: "xmark")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(Theme.textTertiary)
                            .frame(width: 20, height: 20)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            
            // Body — streaming text
            Text(text)
                .font(Theme.bodyFont(14))
                .foregroundColor(Theme.textPrimary)
                .lineSpacing(4)
                .textSelection(.enabled)
            
            // Streaming indicator
            if isStreaming {
                HStack(spacing: 4) {
                    ProgressView()
                        .controlSize(.mini)
                    Text("Preparing your briefing…")
                        .font(Theme.captionFont(11))
                        .foregroundColor(Theme.textTertiary)
                }
            }
        }
        .padding(16)
        .background(Theme.cardBackground)
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.03), radius: 3, y: 1)
    }
}
