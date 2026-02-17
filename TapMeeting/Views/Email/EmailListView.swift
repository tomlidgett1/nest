import SwiftUI

/// Scrollable list of email threads — Outlook-style with date groupings and thread expansion.
struct EmailListView: View {
    
    @Environment(AppState.self) private var appState
    @State private var expandedThreadIds: Set<String> = []
    
    private var gmail: GmailService { appState.gmailService }
    
    /// Whether multiple accounts are connected (show account indicators when true).
    private var hasMultipleAccounts: Bool { gmail.accounts.count > 1 }
    
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
        .background(Color.clear)
    }
    
    // MARK: - Thread List with Date Grouping
    
    /// Whether there are more threads to load (mailbox or search).
    private var showLoadMore: Bool {
        if !gmail.searchQuery.isEmpty {
            return gmail.canLoadMoreSearch
        }
        return gmail.canLoadMore
    }
    
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
                            EmailThreadRow(
                                thread: thread,
                                isSelected: gmail.selectedThread?.id == thread.id,
                                isExpanded: expandedThreadIds.contains(thread.id),
                                hasMultipleAccounts: hasMultipleAccounts,
                                onSelect: {
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
                                                expandedThreadIds = [thread.id]
                                            }
                                        }
                                    }
                                }
                            )
                            
                            // Expanded child messages (newest at top)
                            if expandedThreadIds.contains(thread.id) && thread.messageCount > 1 {
                                ForEach(Array(thread.messages.reversed())) { message in
                                    EmailChildMessageRow(
                                        message: message,
                                        isSelected: gmail.selectedThread?.id == thread.id && gmail.selectedMessageId == message.id,
                                        onSelect: {
                                            gmail.selectedThread = thread
                                            gmail.selectedMessageId = message.id
                                        }
                                    )
                                }
                            }
                            
                            Rectangle()
                                .fill(Theme.divider.opacity(0.5))
                                .frame(height: 1)
                                .padding(.horizontal, 12)
                        }
                    }
                }
                
                // Load More button
                if showLoadMore {
                    Button {
                        Task {
                            if !gmail.searchQuery.isEmpty {
                                await gmail.loadMoreSearchResults()
                            } else {
                                await gmail.loadMoreThreads(gmail.currentMailbox)
                            }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            if gmail.isLoadingMore {
                                ProgressView()
                                    .controlSize(.mini)
                            } else {
                                Image(systemName: "arrow.down.circle")
                                    .font(.system(size: 11))
                            }
                            Text(gmail.isLoadingMore ? "Loading…" : "Load More")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(Theme.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    }
                    .buttonStyle(.plain)
                    .disabled(gmail.isLoadingMore)
                }
            }
        }
        .scrollIndicators(.hidden)
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
    
    // MARK: - Thread Row and Child Message Row are extracted as separate structs below for scroll performance.
    
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
    
}

// MARK: - Email Thread Row (isolated hover state for smooth scrolling)

/// Each row owns its own hover state so mouse movement only re-renders the hovered row,
/// not the entire LazyVStack. This is the key optimisation for smooth list scrolling.
private struct EmailThreadRow: View {
    let thread: GmailThread
    let isSelected: Bool
    let isExpanded: Bool
    let hasMultipleAccounts: Bool
    let onSelect: () -> Void
    
    @State private var isHovered = false
    
    var body: some View {
        let latestMessage = thread.latestMessage
        
        Button(action: onSelect) {
            HStack(alignment: .top, spacing: 0) {
                // Chevron + Unread dot column
                VStack(spacing: 4) {
                    if thread.messageCount > 1 {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                            .rotationEffect(.degrees(isExpanded ? 90 : 0))
                            .animation(.easeInOut(duration: 0.2), value: isExpanded)
                    } else {
                        Color.clear.frame(width: 9, height: 9)
                    }
                    
                    if thread.isUnread {
                        Circle()
                            .fill(Theme.olive)
                            .frame(width: 7, height: 7)
                    } else {
                        Color.clear.frame(width: 7, height: 7)
                    }
                }
                .frame(width: 16)
                .padding(.top, 6)
                
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
                        
                        // Account indicator (only when multiple accounts)
                        if hasMultipleAccounts, !thread.accountEmail.isEmpty {
                            Text(Self.shortAccountLabel(thread.accountEmail))
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(Theme.textQuaternary)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Theme.sidebarSelection)
                                .cornerRadius(4)
                        }
                        
                        // Attachment icon
                        if thread.hasAttachments {
                            Image(systemName: "paperclip")
                                .font(.system(size: 10))
                                .foregroundColor(Theme.textTertiary)
                        }
                        
                        Text(Self.relativeDate(thread.date))
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
            isHovered = hovering
        }
    }
    
    // MARK: Helpers
    
    static func relativeDate(_ date: Date) -> String {
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
    
    private static func shortAccountLabel(_ email: String) -> String {
        let parts = email.split(separator: "@")
        guard parts.count == 2 else { return email }
        let user = parts[0]
        let domain = parts[1]
        let shortDomain = domain.prefix(3)
        return "\(user)@\(shortDomain)…"
    }
}

// MARK: - Email Child Message Row (isolated for scroll performance)

private struct EmailChildMessageRow: View {
    let message: GmailMessage
    let isSelected: Bool
    let onSelect: () -> Void
    
    var body: some View {
        Button(action: onSelect) {
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
                        Text(EmailThreadRow.relativeDate(message.date))
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
                isSelected ? Theme.sidebarSelection : Theme.sidebarBackground.opacity(0.3)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
