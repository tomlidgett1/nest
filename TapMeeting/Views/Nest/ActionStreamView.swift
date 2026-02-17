import SwiftUI

/// Smart, contextually ranked display of the most important action items right now.
/// AI-generated context lines explain WHY each item matters.
struct ActionStreamView: View {
    
    let items: [RankedTodo]
    /// AI-generated context for each todo (keyed by UUID string).
    let aiContexts: [String: String]
    let onComplete: (TodoItem) -> Void
    let onNavigateToNote: ((String) -> Void)?
    
    @State private var justCompletedIds: Set<UUID> = []
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            Text(headerText)
                .font(Theme.headingFont())
                .foregroundColor(Theme.textSecondary)
            
            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, ranked in
                    VStack(alignment: .leading, spacing: 0) {
                        actionRow(ranked: ranked)
                        
                        if index < items.count - 1 {
                            Rectangle()
                                .fill(Theme.divider)
                                .frame(height: 1)
                                .padding(.leading, 40)
                        }
                    }
                }
            }
            .background(Theme.cardBackground)
            .cornerRadius(12)
            .shadow(color: .black.opacity(0.03), radius: 3, y: 1)
        }
    }
    
    private var headerText: String {
        let count = items.count
        if count == 1 { return "1 thing that matters right now" }
        return "\(count) things that matter right now"
    }
    
    private func actionRow(ranked: RankedTodo) -> some View {
        let todo = ranked.todo
        let isCompleted = justCompletedIds.contains(todo.id)
        let aiContext = aiContexts[todo.id.uuidString]
        
        return HStack(alignment: .top, spacing: 12) {
            // Checkbox
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                    justCompletedIds.insert(todo.id)
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                    onComplete(todo)
                }
            } label: {
                ZStack {
                    Circle()
                        .stroke(Theme.olive, lineWidth: 1)
                        .frame(width: 16, height: 16)
                    
                    if isCompleted {
                        Circle()
                            .fill(Theme.olive)
                            .frame(width: 16, height: 16)
                        
                        Image(systemName: "checkmark")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 0)
            
            VStack(alignment: .leading, spacing: 4) {
                // Title
                Text(todo.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(isCompleted ? Theme.textTertiary : Theme.textPrimary)
                    .strikethrough(isCompleted)
                    .lineLimit(2)
                
                // AI context line — the key differentiator
                if let context = aiContext, !isCompleted {
                    HStack(spacing: 4) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 8))
                            .foregroundColor(Theme.olive)
                        Text(context)
                            .font(Theme.captionFont(11))
                            .foregroundColor(Theme.olive)
                            .lineLimit(1)
                    }
                }
                
                // Provenance line
                HStack(spacing: 4) {
                    if let sourceTitle = todo.sourceTitle {
                        Button {
                            if let sourceId = todo.sourceId {
                                onNavigateToNote?(sourceId)
                            }
                        } label: {
                            Text("From: \(sourceTitle)")
                                .font(Theme.captionFont(12))
                                .foregroundColor(Theme.textTertiary)
                        }
                        .buttonStyle(.plain)
                    }
                    
                    if let days = ranked.overdueDays, days > 0 {
                        Text("·")
                            .font(Theme.captionFont(12))
                            .foregroundColor(Theme.textTertiary)
                        Text("\(days) day\(days == 1 ? "" : "s") overdue")
                            .font(Theme.captionFont(12))
                            .foregroundColor(Theme.recording)
                    }
                }
                
                // Social nudge (heuristic fallback if no AI context)
                if aiContext == nil, let nudge = ranked.socialNudge {
                    HStack(spacing: 4) {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 9))
                            .foregroundColor(Theme.olive)
                        Text(nudge)
                            .font(Theme.captionFont(11))
                            .foregroundColor(Theme.olive)
                    }
                }
                
                // New badge
                if !todo.isSeen {
                    Text("New")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(Theme.olive)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Theme.oliveFaint)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }
            
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .opacity(isCompleted ? 0.5 : 1)
    }
}
