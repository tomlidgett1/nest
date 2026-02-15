import SwiftUI

/// Main email view — full-height split-pane layout with toolbar, thread list, and detail panel.
///
/// Layout:
/// ┌──────────────────────────────────────────────────────┐
/// │ [Tabs]          [Delete] [Archive]      [Compose]    │
/// ├─────────────────────┬────────────────────────────────┤
/// │   EmailListView     │         EmailDetailView        │
/// │   (full height)     │         (full height)          │
/// └─────────────────────┴────────────────────────────────┘
struct EmailView: View {
    
    @Binding var isSidebarCollapsed: Bool
    @Environment(AppState.self) private var appState
    @State private var showEmailCompose = false
    @State private var showSentAnimation = false
    @State private var sentCheckmarkScale: CGFloat = 0.3
    private var gmail: GmailService { appState.gmailService }
    
    /// The email of the account to send from — follows the view filter, or first account.
    private var composeSenderEmail: String {
        if let filterId = gmail.filterAccountId,
           let account = gmail.accounts.first(where: { $0.id == filterId }) {
            return account.email
        }
        return gmail.connectedEmail ?? ""
    }
    
    var body: some View {
        VStack(spacing: 0) {
            if gmail.isConnected {
                connectedContent
            } else {
                connectPrompt
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
        .onAppear {
            if gmail.isConnected && gmail.inboxThreads.isEmpty {
                Task { await gmail.fetchMailbox(.inbox) }
            }
        }
    }
    
    // MARK: - Connected Content
    
    private var connectedContent: some View {
        GeometryReader { geo in
            let listWidth = min(360, geo.size.width * 0.38)
            
            VStack(spacing: 0) {
                // Full-width toolbar: left half = tabs, right half = delete/archive/compose
                HStack(spacing: 0) {
                    emailToolbar
                        .frame(width: listWidth)
                    
                    detailToolbar
                        .frame(maxWidth: .infinity)
                }
                .fixedSize(horizontal: false, vertical: true)
                
                Rectangle()
                    .fill(Theme.divider)
                    .frame(height: 1)
                
                // Split pane — fills all remaining space
                HStack(spacing: 0) {
                    EmailListView()
                        .frame(width: listWidth)
                    
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(width: 1)
                    
                    // Right panel: sent animation > compose > detail
                    ZStack {
                        if showSentAnimation {
                            sentSuccessView
                                .transition(.opacity)
                        } else if showEmailCompose {
                            ScrollView {
                                EmailComposeView(
                                    draft: EmailDraft(),
                                    mode: .newEmail,
                                    senderEmail: composeSenderEmail,
                                    onDismiss: {
                                        withAnimation(.easeInOut(duration: 0.25)) {
                                            showEmailCompose = false
                                        }
                                    },
                                    onSent: {
                                        sentCheckmarkScale = 0.3
                                        withAnimation(.easeInOut(duration: 0.3)) {
                                            showEmailCompose = false
                                            showSentAnimation = true
                                        }
                                        // Spring the checkmark in after a tiny delay
                                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                                            withAnimation(.spring(response: 0.5, dampingFraction: 0.6)) {
                                                sentCheckmarkScale = 1.0
                                            }
                                        }
                                        // Auto-dismiss after 2s
                                        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                                            withAnimation(.easeOut(duration: 0.35)) {
                                                showSentAnimation = false
                                            }
                                        }
                                    }
                                )
                                .padding(.bottom, 20)
                            }
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .transition(.asymmetric(
                                insertion: .move(edge: .bottom).combined(with: .opacity),
                                removal: .opacity
                            ))
                        } else {
                            EmailDetailView()
                                .frame(maxWidth: .infinity)
                                .transition(.opacity)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .animation(.easeInOut(duration: 0.3), value: showEmailCompose)
                    .animation(.easeInOut(duration: 0.3), value: showSentAnimation)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
    
    // MARK: - Email Toolbar
    
    // MARK: - Left Toolbar (mailbox tabs)
    
    private var emailToolbar: some View {
        HStack(spacing: 6) {
            mailboxTabs
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
    
    // MARK: - Detail Toolbar (Delete, Archive, Refresh, Compose)
    
    private var detailToolbar: some View {
        HStack(spacing: 8) {
            if showEmailCompose {
                Button {
                    postComposeToolbarAction(.toggleAIAssist)
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 11))
                        Text("AI Assist")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Theme.textPrimary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Theme.cardBackground)
                    .cornerRadius(6)
                    .shadow(color: .black.opacity(0.06), radius: 1, y: 1)
                }
                .buttonStyle(.plain)
                
                Button {
                    postComposeToolbarAction(.discard)
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "xmark")
                            .font(.system(size: 11))
                        Text("Discard")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Theme.textPrimary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Theme.cardBackground)
                    .cornerRadius(6)
                    .shadow(color: .black.opacity(0.06), radius: 1, y: 1)
                }
                .buttonStyle(.plain)
                
                Button {
                    postComposeToolbarAction(.attach)
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "paperclip")
                            .font(.system(size: 11))
                        Text("Attach")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Theme.textPrimary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Theme.cardBackground)
                    .cornerRadius(6)
                    .shadow(color: .black.opacity(0.06), radius: 1, y: 1)
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    if let thread = gmail.selectedThread {
                        Task { await gmail.trashThread(threadId: thread.id) }
                    }
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "trash")
                            .font(.system(size: 11))
                        Text("Delete")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Theme.textPrimary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Theme.cardBackground)
                    .cornerRadius(6)
                    .shadow(color: .black.opacity(0.06), radius: 1, y: 1)
                }
                .buttonStyle(.plain)
                .help("Move to Bin")
                .opacity(gmail.selectedThread != nil ? 1.0 : 0.4)
                
                Button {
                    if let thread = gmail.selectedThread {
                        Task { await gmail.archiveThread(threadId: thread.id) }
                    }
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "archivebox")
                            .font(.system(size: 11))
                        Text("Archive")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Theme.textPrimary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Theme.cardBackground)
                    .cornerRadius(6)
                    .shadow(color: .black.opacity(0.06), radius: 1, y: 1)
                }
                .buttonStyle(.plain)
                .help("Archive")
                .opacity(gmail.selectedThread != nil ? 1.0 : 0.4)
            }
            
            Spacer()
            
            if showEmailCompose {
                if let error = gmail.sendError {
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundColor(Theme.recording)
                        .lineLimit(1)
                }
                
                if gmail.sendSuccess {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 12))
                        Text("Sent")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Theme.olive)
                }
                
                Button {
                    postComposeToolbarAction(.send)
                } label: {
                    HStack(spacing: 5) {
                        if gmail.isSending {
                            ProgressView()
                                .controlSize(.mini)
                        } else {
                            Image(systemName: "paperplane.fill")
                                .font(.system(size: 11, weight: .medium))
                        }
                        Text("Send")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(gmail.isSending ? Theme.textQuaternary : Theme.olive)
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                .disabled(gmail.isSending)
            }
            
            // Refresh
            Button {
                Task { await gmail.fetchMailbox(gmail.currentMailbox) }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Theme.textSecondary)
                    .frame(width: 28, height: 28)
                    .rotationEffect(.degrees(gmail.isFetching ? 360 : 0))
                    .animation(gmail.isFetching ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: gmail.isFetching)
            }
            .buttonStyle(.plain)
            .disabled(gmail.isFetching)
            .help("Refresh")
            
            // Compose
            Button {
                withAnimation(.easeInOut(duration: 0.25)) {
                    showEmailCompose.toggle()
                    if !showEmailCompose {
                        showSentAnimation = false
                    }
                }
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: showEmailCompose ? "xmark" : "square.and.pencil")
                        .font(.system(size: 11, weight: .medium))
                    Text(showEmailCompose ? "Close" : "Compose")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Theme.olive)
                .cornerRadius(6)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
    
    // MARK: - Toolbar Button
    
    private func toolbarButton(icon: String, tooltip: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundColor(Theme.textSecondary)
                .frame(width: 30, height: 28)
                .background(Color.clear)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(tooltip)
    }
    
    private func postComposeToolbarAction(_ action: EmailComposeToolbarAction) {
        NotificationCenter.default.post(
            name: .emailComposeToolbarAction,
            object: nil,
            userInfo: ["action": action.rawValue]
        )
    }
    
    // MARK: - Mailbox Tabs
    
    private var mailboxTabs: some View {
        HStack(spacing: 0) {
            ForEach(Mailbox.allCases) { mailbox in
                let isActive = gmail.currentMailbox == mailbox
                Button {
                    gmail.currentMailbox = mailbox
                    gmail.selectedThread = nil
                    gmail.selectedMessageId = nil
                    Task { await gmail.fetchMailbox(mailbox) }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: mailbox.icon)
                            .font(.system(size: 10))
                        Text(mailbox.displayName)
                            .font(.system(size: 12, weight: .medium))
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .foregroundColor(isActive ? Color(red: 0.24, green: 0.22, blue: 0.16) : Color(red: 0.55, green: 0.52, blue: 0.47))
                    .background(isActive ? Color.white : Color.clear)
                    .cornerRadius(6)
                    .shadow(color: isActive ? .black.opacity(0.05) : .clear, radius: 1, y: 1)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(2)
        .background(Color(red: 0.94, green: 0.93, blue: 0.90))
        .cornerRadius(6)
    }
    
    // MARK: - Sent Success Animation
    
    private var sentSuccessView: some View {
        VStack(spacing: 16) {
            Spacer()
            
            ZStack {
                Circle()
                    .fill(Theme.olive.opacity(0.08))
                    .frame(width: 88, height: 88)
                    .scaleEffect(sentCheckmarkScale)
                
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 46))
                    .foregroundColor(Theme.olive)
                    .scaleEffect(sentCheckmarkScale)
            }
            
            VStack(spacing: 6) {
                Text("Email Sent")
                    .font(Theme.headingFont(17))
                    .foregroundColor(Theme.textPrimary)
                
                Text("Your message has been delivered successfully.")
                    .font(Theme.captionFont(13))
                    .foregroundColor(Theme.textTertiary)
            }
            
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
    }
    
    // MARK: - Connect Prompt
    
    private var connectPrompt: some View {
        VStack(spacing: 16) {
            Spacer()
            
            VStack(spacing: 10) {
                Image(systemName: "envelope")
                    .font(.system(size: 36))
                    .foregroundColor(Theme.textQuaternary)
                
                Text("Connect your Gmail")
                    .font(Theme.headingFont(16))
                    .foregroundColor(Theme.textPrimary)
                
                Text("View, send, and manage your emails directly inside Tap.\nSign in with Google or add an account in Preferences.")
                    .font(Theme.captionFont())
                    .foregroundColor(Theme.textTertiary)
                    .multilineTextAlignment(.center)
            }
            
            if gmail.hasCredentials {
                Button {
                    gmail.signIn()
                } label: {
                    HStack(spacing: 6) {
                        if gmail.isAuthenticating {
                            ProgressView()
                                .controlSize(.small)
                            Text("Connecting…")
                        } else {
                            Image(systemName: "envelope.badge.person.crop")
                                .font(.system(size: 12))
                            Text("Connect Gmail")
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
                .disabled(gmail.isAuthenticating)
            } else if !gmail.isConnectedViaSupabase {
                Text("Sign in with Google to get started, or set up OAuth credentials in Preferences → Calendars.")
                    .font(Theme.captionFont())
                    .foregroundColor(Theme.textQuaternary)
                    .multilineTextAlignment(.center)
            }
            
            if let error = gmail.authError {
                Text(error)
                    .font(.system(size: 11))
                    .foregroundColor(Theme.recording)
            }
            
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
