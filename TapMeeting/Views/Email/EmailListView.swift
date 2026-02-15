import SwiftUI

/// Scrollable list of email threads — Outlook-style with date groupings and thread expansion.
struct EmailListView: View {
    
    @Environment(AppState.self) private var appState
    @State private var hoveredThreadId: String?
    @State private var expandedThreadIds: Set<String> = []
    
    private var gmail: GmailService { appState.gmailService }
    
    private var currentThreads: [GmailThread] {
        gmail.threadsForMailbox(gmail.currentMailbox)
    }
    
    var body: some View {
        VStack(spacing: 0) {
            if gmail.isFetching && currentThreads.isEmpty {
                loadingState
            } else if currentThreads.isEmpty {
                emptyState
            } else {
                threadList
            }
        }
        .frame(maxHeight: .infinity)
        .background(Theme.background)
    }
    
    // MARK: - Thread List with Date Grouping
    
    private var threadList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(Array(groupedThreads.enumerated()), id: \.element.label) { groupIndex, group in
                    // Date group header
                    HStack {
                        Text(group.label)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, groupIndex == 0 ? 8 : 14)
                    .padding(.bottom, 4)
                    
                    ForEach(group.threads) { thread in
                        VStack(spacing: 0) {
                            threadRow(thread)
                            
                            // Expanded child messages (newest at top)
                            if expandedThreadIds.contains(thread.id) && thread.messageCount > 1 {
                                ForEach(Array(thread.messages.reversed())) { message in
                                    childMessageRow(message, thread: thread)
                                }
                            }
                        }
                        
                        Rectangle()
                            .fill(Theme.divider)
                            .frame(height: 1)
                    }
                }
            }
        }
    }
    
    // MARK: - Date Grouping
    
    private struct ThreadGroup: Identifiable {
        let label: String
        let threads: [GmailThread]
        var id: String { label }
    }
    
    private var groupedThreads: [ThreadGroup] {
        let calendar = Calendar.current
        let now = Date.now
        
        var todayThreads: [GmailThread] = []
        var yesterdayThreads: [GmailThread] = []
        var olderGroups: [String: [GmailThread]] = [:]
        var olderOrder: [String] = []
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "d MMMM yyyy"
        
        for thread in currentThreads {
            if calendar.isDateInToday(thread.date) {
                todayThreads.append(thread)
            } else if calendar.isDateInYesterday(thread.date) {
                yesterdayThreads.append(thread)
            } else {
                // Check if within past 7 days
                let daysAgo = calendar.dateComponents([.day], from: thread.date, to: now).day ?? 99
                let label: String
                if daysAgo < 7 {
                    let weekdayFormatter = DateFormatter()
                    weekdayFormatter.dateFormat = "EEEE"
                    label = weekdayFormatter.string(from: thread.date)
                } else {
                    label = dateFormatter.string(from: thread.date)
                }
                if olderGroups[label] == nil {
                    olderOrder.append(label)
                }
                olderGroups[label, default: []].append(thread)
            }
        }
        
        var result: [ThreadGroup] = []
        if !todayThreads.isEmpty { result.append(ThreadGroup(label: "Today", threads: todayThreads)) }
        if !yesterdayThreads.isEmpty { result.append(ThreadGroup(label: "Yesterday", threads: yesterdayThreads)) }
        for label in olderOrder {
            if let threads = olderGroups[label] {
                result.append(ThreadGroup(label: label, threads: threads))
            }
        }
        
        // If no grouping makes sense, just show all
        if result.isEmpty && !currentThreads.isEmpty {
            result.append(ThreadGroup(label: "All", threads: currentThreads))
        }
        
        return result
    }
    
    // MARK: - Thread Row
    
    private func threadRow(_ thread: GmailThread) -> some View {
        let isSelected = gmail.selectedThread?.id == thread.id
        let isHovered = hoveredThreadId == thread.id
        let latestMessage = thread.latestMessage
        let isExpanded = expandedThreadIds.contains(thread.id)
        
        return Button {
            gmail.selectedThread = thread
            gmail.selectedMessageId = nil
            if thread.isUnread {
                Task { await gmail.markThreadAsRead(threadId: thread.id) }
            }
            if thread.messageCount > 1 {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if expandedThreadIds.contains(thread.id) {
                        expandedThreadIds.remove(thread.id)
                    } else {
                        expandedThreadIds.insert(thread.id)
                    }
                }
            }
        } label: {
            HStack(alignment: .top, spacing: 0) {
                // Unread dot + chevron column
                VStack(spacing: 0) {
                    if thread.isUnread {
                        Circle()
                            .fill(Theme.olive)
                            .frame(width: 8, height: 8)
                    } else {
                        Color.clear.frame(width: 8, height: 8)
                    }
                }
                .frame(width: 12)
                .padding(.top, 14)
                
                // Thread expand chevron
                if thread.messageCount > 1 {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(Theme.textTertiary)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                        .animation(.easeInOut(duration: 0.2), value: isExpanded)
                        .frame(width: 10)
                        .padding(.top, 12)
                } else {
                    Color.clear.frame(width: 10)
                }
                
                // Avatar
                SenderAvatarView(
                    email: latestMessage?.fromEmail ?? "",
                    name: latestMessage?.from ?? "?",
                    size: 40
                )
                .padding(.trailing, 10)
                
                // Text content
                VStack(alignment: .leading, spacing: 2) {
                    // Sender + count + date row
                    HStack(alignment: .firstTextBaseline) {
                        Text(thread.participantsSummary)
                            .font(.system(size: 13, weight: thread.isUnread ? .bold : .medium))
                            .foregroundColor(Theme.textPrimary)
                            .lineLimit(1)
                        
                        if thread.messageCount > 1 {
                            Text("\(thread.messageCount)")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(Theme.olive)
                        }
                        
                        Spacer(minLength: 4)
                        
                        // Attachment icon
                        if thread.hasAttachments {
                            Image(systemName: "paperclip")
                                .font(.system(size: 10))
                                .foregroundColor(Theme.textTertiary)
                        }
                        
                        Text(relativeDate(thread.date))
                            .font(.system(size: 11))
                            .foregroundColor(thread.isUnread ? Theme.olive : Theme.textTertiary)
                    }
                    
                    // Subject
                    Text(thread.subject)
                        .font(.system(size: 12, weight: thread.isUnread ? .semibold : .regular))
                        .foregroundColor(Theme.textPrimary)
                        .lineLimit(1)
                    
                    // Snippet
                    if !isExpanded {
                        Text(thread.snippet)
                            .font(.system(size: 12))
                            .foregroundColor(Theme.textTertiary)
                            .lineLimit(1)
                    }
                }
                .padding(.trailing, 12)
            }
            .padding(.vertical, 8)
            .padding(.leading, 0)
            .background(
                isSelected ? Theme.sidebarSelection :
                isHovered ? Theme.sidebarSelection.opacity(0.4) :
                Color.clear
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            hoveredThreadId = hovering ? thread.id : nil
        }
    }
    
    // MARK: - Child Message Row
    
    private func childMessageRow(_ message: GmailMessage, thread: GmailThread) -> some View {
        let isSelected = gmail.selectedThread?.id == thread.id && gmail.selectedMessageId == message.id
        
        return Button {
            gmail.selectedThread = thread
            gmail.selectedMessageId = message.id
        } label: {
            HStack(alignment: .center, spacing: 8) {
                SenderAvatarView(
                    email: message.fromEmail,
                    name: message.from,
                    size: 26
                )
                
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 4) {
                        Text(message.from)
                            .font(.system(size: 11, weight: message.isUnread ? .semibold : .regular))
                            .foregroundColor(Theme.textPrimary)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        Text(relativeDate(message.date))
                            .font(.system(size: 10))
                            .foregroundColor(Theme.textTertiary)
                    }
                    Text(message.snippet)
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textTertiary)
                        .lineLimit(1)
                }
            }
            .padding(.leading, 50)
            .padding(.trailing, 12)
            .padding(.vertical, 5)
            .background(
                isSelected ? Theme.sidebarSelection : Theme.sidebarBackground.opacity(0.4)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
    
    // MARK: - States
    
    private var loadingState: some View {
        VStack(spacing: 8) {
            Spacer()
            ProgressView()
                .controlSize(.small)
            Text("Loading \(gmail.currentMailbox.displayName.lowercased())…")
                .font(Theme.captionFont(11))
                .foregroundColor(Theme.textTertiary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    private var emptyState: some View {
        VStack(spacing: 8) {
            Spacer()
            Image(systemName: gmail.currentMailbox.icon)
                .font(.system(size: 24))
                .foregroundColor(Theme.textQuaternary)
            Text("No emails in \(gmail.currentMailbox.displayName)")
                .font(Theme.captionFont(12))
                .foregroundColor(Theme.textTertiary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    // MARK: - Helpers
    
    private func relativeDate(_ date: Date) -> String {
        let calendar = Calendar.current
        
        if calendar.isDateInToday(date) {
            let formatter = DateFormatter()
            formatter.dateFormat = "h:mm a"
            return formatter.string(from: date)
        }
        
        if calendar.isDateInYesterday(date) {
            return "Yesterday"
        }
        
        let now = Date.now
        let daysAgo = calendar.dateComponents([.day], from: date, to: now).day ?? 99
        if daysAgo < 7 {
            let formatter = DateFormatter()
            formatter.dateFormat = "EEEE"
            return formatter.string(from: date)
        }
        
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMM"
        return formatter.string(from: date)
    }
}
