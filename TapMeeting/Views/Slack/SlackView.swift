import SwiftUI

/// Main Slack view — split-pane layout with conversation list and message history.
///
/// Layout:
/// ┌──────────────────────────────────────────────────────┐
/// │ [Workspace name]                        [Refresh]     │
/// ├─────────────────────┬────────────────────────────────┤
/// │  Conversations list │       Message history           │
/// │  (DMs + Channels)   │       (selected conversation)  │
/// └─────────────────────┴────────────────────────────────┘
struct SlackView: View {
    
    @Binding var isSidebarCollapsed: Bool
    @Environment(AppState.self) private var appState
    
    private var slack: SlackService { appState.slackService }
    
    var body: some View {
        VStack(spacing: 0) {
            // Meeting controls if active
            if appState.isMeetingActive {
                HStack(spacing: 10) {
                    Spacer()
                    MeetingControlButtons()
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 6)
            }
            
            if slack.isConnected {
                connectedContent
            } else {
                connectPrompt
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
        .onAppear {
            if slack.isConnected && slack.conversations.isEmpty {
                Task { await slack.fetchConversations() }
            }
        }
    }
    
    // MARK: - Connected Content
    
    private var connectedContent: some View {
        VStack(spacing: 0) {
            // Toolbar
            slackToolbar
            
            Rectangle()
                .fill(Theme.divider)
                .frame(height: 1)
            
            // Split pane
            GeometryReader { geo in
                HStack(spacing: 0) {
                    // Left: conversation list
                    conversationList
                        .frame(width: min(260, geo.size.width * 0.32))
                        .frame(maxHeight: .infinity)
                    
                    // Divider
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(width: 1)
                    
                    // Right: message history
                    messagePanel
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    // MARK: - Toolbar
    
    private var slackToolbar: some View {
        HStack(spacing: 12) {
            // Workspace name
            HStack(spacing: 6) {
                Image(systemName: "number")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Theme.textSecondary)
                
                Text(slack.account?.teamName ?? "Slack")
                    .font(Theme.headingFont(14))
                    .foregroundColor(Theme.textPrimary)
                
                Text(slack.account?.userName ?? "")
                    .font(Theme.captionFont(12))
                    .foregroundColor(Theme.textTertiary)
            }
            
            Spacer()
            
            // Refresh
            Button {
                Task { await slack.fetchConversations() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Theme.textSecondary)
                    .frame(width: 28, height: 28)
                    .rotationEffect(.degrees(slack.isFetchingConversations ? 360 : 0))
                    .animation(
                        slack.isFetchingConversations
                            ? .linear(duration: 1).repeatForever(autoreverses: false)
                            : .default,
                        value: slack.isFetchingConversations
                    )
            }
            .buttonStyle(.plain)
            .disabled(slack.isFetchingConversations)
            .help("Refresh conversations")
            
            // Disconnect
            Button {
                slack.disconnect()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 11, weight: .medium))
                    Text("Disconnect")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(Theme.textTertiary)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Theme.sidebarSelection)
                .cornerRadius(6)
            }
            .buttonStyle(.plain)
            .help("Disconnect Slack")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
    
    // MARK: - Conversation List
    
    private var conversationList: some View {
        VStack(alignment: .leading, spacing: 0) {
            if slack.isFetchingConversations && slack.conversations.isEmpty {
                VStack(spacing: 10) {
                    Spacer()
                    ProgressView()
                        .controlSize(.small)
                    Text("Loading conversations…")
                        .font(Theme.captionFont())
                        .foregroundColor(Theme.textTertiary)
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        // Direct Messages section
                        let dms = slack.directMessages
                        if !dms.isEmpty {
                            sectionHeader("Direct Messages")
                            
                            ForEach(dms) { conv in
                                conversationRow(conv)
                            }
                        }
                        
                        // Channels section
                        let channels = slack.channels
                        if !channels.isEmpty {
                            sectionHeader("Channels")
                            
                            ForEach(channels) { conv in
                                conversationRow(conv)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                .scrollIndicators(.never)
            }
        }
        .background(Theme.background)
    }
    
    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 10, weight: .medium))
            .foregroundColor(Theme.textQuaternary)
            .textCase(.uppercase)
            .tracking(0.5)
            .padding(.horizontal, 12)
            .padding(.top, 12)
            .padding(.bottom, 4)
    }
    
    private func conversationRow(_ conversation: SlackConversation) -> some View {
        let isSelected = slack.selectedConversationId == conversation.id
        
        return Button {
            slack.selectedConversationId = conversation.id
        } label: {
            HStack(spacing: 8) {
                // Icon
                Image(systemName: conversationIcon(conversation))
                    .font(.system(size: 12))
                    .foregroundColor(isSelected ? Theme.textPrimary : Theme.textTertiary)
                    .frame(width: 16)
                
                // Name
                Text(conversation.displayName)
                    .font(.system(size: 13))
                    .foregroundColor(isSelected ? Theme.textPrimary : Theme.textSecondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(isSelected ? Theme.sidebarSelection : Color.clear)
            .cornerRadius(6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 4)
    }
    
    private func conversationIcon(_ conv: SlackConversation) -> String {
        if conv.isIM { return "person" }
        if conv.isMPIM { return "person.2" }
        if conv.isPrivate { return "lock" }
        return "number"
    }
    
    // MARK: - Message Panel
    
    private var messagePanel: some View {
        VStack(spacing: 0) {
            if let convName = slack.selectedConversationName {
                // Channel header
                HStack(spacing: 8) {
                    if let conv = slack.conversations.first(where: { $0.id == slack.selectedConversationId }) {
                        Image(systemName: conversationIcon(conv))
                            .font(.system(size: 13))
                            .foregroundColor(Theme.textSecondary)
                    }
                    
                    Text(convName)
                        .font(Theme.headingFont(15))
                        .foregroundColor(Theme.textPrimary)
                    
                    Spacer()
                    
                    if slack.isFetchingMessages {
                        ProgressView()
                            .controlSize(.small)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                
                Rectangle()
                    .fill(Theme.divider)
                    .frame(height: 1)
                
                // Messages
                if slack.messages.isEmpty && !slack.isFetchingMessages {
                    VStack(spacing: 8) {
                        Spacer()
                        Text("No messages")
                            .font(Theme.captionFont())
                            .foregroundColor(Theme.textTertiary)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 2) {
                                ForEach(slack.messages) { message in
                                    messageRow(message)
                                        .id(message.id)
                                }
                            }
                            .padding(.vertical, 8)
                        }
                        .scrollIndicators(.automatic)
                        .onChange(of: slack.messages.count) { _, _ in
                            // Scroll to bottom when new messages load
                            if let lastId = slack.messages.last?.id {
                                withAnimation(.easeOut(duration: 0.2)) {
                                    proxy.scrollTo(lastId, anchor: .bottom)
                                }
                            }
                        }
                    }
                }
            } else {
                // No conversation selected
                VStack(spacing: 10) {
                    Spacer()
                    
                    Image(systemName: "bubble.left.and.bubble.right")
                        .font(.system(size: 32))
                        .foregroundColor(Theme.textQuaternary)
                    
                    Text("Select a conversation")
                        .font(Theme.captionFont(13))
                        .foregroundColor(Theme.textTertiary)
                    
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
    
    private func messageRow(_ message: SlackMessage) -> some View {
        // Skip join/leave subtypes etc.
        let isSystem = message.subtype != nil && message.subtype != "me_message"
        
        return HStack(alignment: .top, spacing: 10) {
            if isSystem {
                // System message — rendered inline with muted style
                HStack(spacing: 6) {
                    Image(systemName: "info.circle")
                        .font(.system(size: 10))
                        .foregroundColor(Theme.textQuaternary)
                    Text(message.text)
                        .font(Theme.captionFont(12))
                        .foregroundColor(Theme.textTertiary)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 2)
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    // Author + timestamp
                    HStack(spacing: 6) {
                        Text(message.userName ?? message.userId ?? "Unknown")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(Theme.textPrimary)
                        
                        Text(formatMessageTime(message.timestamp))
                            .font(.system(size: 11))
                            .foregroundColor(Theme.textQuaternary)
                    }
                    
                    // Message text
                    Text(message.text)
                        .font(Theme.bodyFont(13))
                        .foregroundColor(Theme.textPrimary)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }
            
            Spacer(minLength: 0)
        }
    }
    
    private func formatMessageTime(_ date: Date) -> String {
        let calendar = Calendar.current
        let formatter = DateFormatter()
        
        if calendar.isDateInToday(date) {
            formatter.dateFormat = "h:mm a"
        } else if calendar.isDateInYesterday(date) {
            formatter.dateFormat = "'Yesterday' h:mm a"
        } else {
            formatter.dateFormat = "d MMM, h:mm a"
        }
        
        return formatter.string(from: date)
    }
    
    // MARK: - Connect Prompt
    
    private var connectPrompt: some View {
        VStack(spacing: 16) {
            Spacer()
            
            VStack(spacing: 10) {
                Image(systemName: "number")
                    .font(.system(size: 36))
                    .foregroundColor(Theme.textQuaternary)
                
                Text("Connect your Slack")
                    .font(Theme.headingFont(16))
                    .foregroundColor(Theme.textPrimary)
                
                Text("View your Slack messages directly inside Tap.\nChannels, DMs, and group messages all in one place.")
                    .font(Theme.captionFont())
                    .foregroundColor(Theme.textTertiary)
                    .multilineTextAlignment(.center)
            }
            
            // Connect card
            VStack(spacing: 14) {
                Text("Sign in with your Slack workspace to get started.\nYou'll be asked to approve access in your browser.")
                    .font(Theme.captionFont(12))
                    .foregroundColor(Theme.textSecondary)
                    .multilineTextAlignment(.center)
                
                Button {
                    slack.signIn()
                } label: {
                    HStack(spacing: 6) {
                        if slack.isAuthenticating {
                            ProgressView()
                                .controlSize(.small)
                            Text("Connecting…")
                        } else {
                            Image(systemName: "link")
                                .font(.system(size: 12, weight: .medium))
                            Text("Connect Slack")
                        }
                    }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
                    .background(Theme.olive)
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                .disabled(slack.isAuthenticating)
            }
            .padding(20)
            .background(Color.white)
            .cornerRadius(8)
            .frame(maxWidth: 400)
            
            if let error = slack.authError {
                Text(error)
                    .font(.system(size: 11))
                    .foregroundColor(Theme.recording)
            }
            
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
