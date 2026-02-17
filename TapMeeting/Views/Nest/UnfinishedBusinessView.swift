import SwiftUI

/// Surfaces follow-up cards after meetings end, showing commitment progress
/// and nudging the user to close loops. Todos are interactive — tap to complete.
struct UnfinishedBusinessView: View {
    
    let items: [UnfinishedBusinessItem]
    let onNavigateToNote: (UUID) -> Void
    let onCompleteTodo: ((UUID) -> Void)?
    
    @State private var justCompletedIds: Set<UUID> = []
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Unfinished business")
                .font(Theme.headingFont())
                .foregroundColor(Theme.textSecondary)
            
            ForEach(items) { item in
                unfinishedCard(item: item)
            }
        }
    }
    
    private func unfinishedCard(item: UnfinishedBusinessItem) -> some View {
        HStack(spacing: 0) {
            // Left border accent for urgency
            if item.urgency != .normal {
                Rectangle()
                    .fill(item.urgency == .overdue ? Theme.recording : Color.orange)
                    .frame(width: 2)
            }
            
            VStack(alignment: .leading, spacing: 12) {
                // Header
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Theme.textPrimary)
                        .lineLimit(1)
                    
                    HStack(spacing: 4) {
                        Text(item.timeLabel)
                            .font(Theme.captionFont(11))
                            .foregroundColor(Theme.textTertiary)
                        
                        if !item.attendees.isEmpty {
                            Text("·")
                                .font(Theme.captionFont(11))
                                .foregroundColor(Theme.textQuaternary)
                            Text(item.attendees.prefix(3).joined(separator: ", "))
                                .font(Theme.captionFont(11))
                                .foregroundColor(Theme.textTertiary)
                                .lineLimit(1)
                        }
                    }
                }
                
                // Progress bar
                if item.totalTodos > 0 {
                    VStack(alignment: .leading, spacing: 4) {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Theme.divider)
                                    .frame(height: 4)
                                
                                let completedCount = item.completedTodos + justCompletedIds.intersection(Set(item.todoItems.map(\.id))).count
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Theme.olive)
                                    .frame(
                                        width: geo.size.width * CGFloat(min(completedCount, item.totalTodos)) / CGFloat(item.totalTodos),
                                        height: 4
                                    )
                                    .animation(.easeInOut(duration: 0.3), value: completedCount)
                            }
                        }
                        .frame(height: 4)
                        
                        let completedCount = item.completedTodos + justCompletedIds.intersection(Set(item.todoItems.map(\.id))).count
                        Text("\(min(completedCount, item.totalTodos)) of \(item.totalTodos) action items done")
                            .font(Theme.captionFont(11))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                
                // Todo items — interactive checkboxes
                ForEach(item.todoItems) { todoItem in
                    let isLocallyCompleted = justCompletedIds.contains(todoItem.id)
                    let isCompleted = todoItem.isCompleted || isLocallyCompleted
                    
                    Button {
                        guard !todoItem.isCompleted, !isLocallyCompleted else { return }
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                            justCompletedIds.insert(todoItem.id)
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                            onCompleteTodo?(todoItem.id)
                        }
                    } label: {
                        HStack(spacing: 8) {
                            // Checkbox
                            ZStack {
                                if isCompleted {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.system(size: 13))
                                        .foregroundColor(Theme.olive)
                                } else if todoItem.isOverdue {
                                    Circle()
                                        .stroke(Theme.recording, lineWidth: 1)
                                        .frame(width: 13, height: 13)
                                } else {
                                    Circle()
                                        .stroke(Theme.olive, lineWidth: 1)
                                        .frame(width: 13, height: 13)
                                }
                            }
                            .frame(width: 24, height: 24)
                            .contentShape(Rectangle())
                            
                            Text(todoItem.title)
                                .font(Theme.captionFont(12))
                                .foregroundColor(isCompleted ? Theme.textTertiary : Theme.textPrimary)
                                .strikethrough(isCompleted)
                                .lineLimit(1)
                            
                            if todoItem.isOverdue && !isCompleted {
                                Text("(overdue)")
                                    .font(Theme.captionFont(10))
                                    .foregroundColor(Theme.recording)
                            }
                            
                            Spacer(minLength: 0)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .opacity(isCompleted && !todoItem.isCompleted ? 0.5 : 1)
                }
                
                // Actions
                HStack(spacing: 12) {
                    Button {
                        onNavigateToNote(item.noteId)
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "doc.text")
                                .font(.system(size: 10))
                            Text("View Notes")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(Theme.olive)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Theme.olive.opacity(0.1))
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                    
                    Spacer()
                    
                    // Urgency nudge text
                    if item.urgency == .nudge {
                        Text("Follow up?")
                            .font(Theme.captionFont(11))
                            .foregroundColor(.orange)
                    } else if item.urgency == .overdue {
                        Text("\(item.pendingTodos) item\(item.pendingTodos == 1 ? "" : "s") still pending")
                            .font(Theme.captionFont(11))
                            .foregroundColor(Theme.recording)
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.cardBackground)
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.03), radius: 3, y: 1)
    }
}
