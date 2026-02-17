import SwiftUI

/// Dismissible insight card surfacing non-obvious connections across meetings,
/// emails, and todos.
struct InsightCardView: View {
    
    let card: InsightCard
    let onAction: () -> Void
    let onDismiss: () -> Void
    
    var body: some View {
        HStack(spacing: 0) {
            // Left accent
            Rectangle()
                .fill(Theme.olive)
                .frame(width: 3)
            
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: iconName)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.olive)
                    
                    VStack(alignment: .leading, spacing: 4) {
                        Text(card.title)
                            .font(Theme.bodyFont(13))
                            .foregroundColor(Theme.textPrimary)
                            .lineLimit(2)
                        
                        Text(card.subtitle)
                            .font(Theme.captionFont(12))
                            .foregroundColor(Theme.textSecondary)
                            .lineLimit(1)
                    }
                    
                    Spacer()
                    
                    Button(action: onDismiss) {
                        Image(systemName: "xmark")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(Theme.textTertiary)
                            .frame(width: 20, height: 20)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                
                Button(action: onAction) {
                    Text(card.actionLabel)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Theme.olive)
                }
                .buttonStyle(.plain)
            }
            .padding(12)
        }
        .background(Theme.background)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Theme.divider.opacity(0.5), lineWidth: 1)
        )
    }
    
    private var iconName: String {
        switch card.type {
        case .emailMeetingConvergence: return "lightbulb.fill"
        case .staleCommitment: return "clock.badge.exclamationmark"
        case .recurringMeetingDelta: return "arrow.triangle.2.circlepath"
        case .crossTeamConvergence: return "person.3.fill"
        }
    }
}
