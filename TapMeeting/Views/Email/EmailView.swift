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
    
    private var gmail: GmailService { appState.gmailService }
    
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
        .sheet(isPresented: $showEmailCompose) {
            EmailComposeView(draft: EmailDraft(), mode: .newEmail)
                .environment(appState)
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
                    
                    EmailDetailView()
                        .frame(maxWidth: .infinity)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
    
    // MARK: - Email Toolbar
    
    // MARK: - Left Toolbar (mailbox tabs only)
    
    private var emailToolbar: some View {
        HStack(spacing: 0) {
            mailboxTabs
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
    
    // MARK: - Detail Toolbar (Delete, Archive, Refresh, Compose)
    
    private var detailToolbar: some View {
        HStack(spacing: 8) {
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
                .foregroundColor(Theme.textSecondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Theme.sidebarBackground)
                .cornerRadius(6)
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
                .foregroundColor(Theme.textSecondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Theme.sidebarBackground)
                .cornerRadius(6)
            }
            .buttonStyle(.plain)
            .help("Archive")
            .opacity(gmail.selectedThread != nil ? 1.0 : 0.4)
            
            Spacer()
            
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
                showEmailCompose = true
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 11, weight: .medium))
                    Text("Compose")
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
                        
                        if mailbox == .inbox {
                            let unreadCount = gmail.inboxThreads.filter(\.isUnread).count
                            if unreadCount > 0 {
                                Text("\(unreadCount)")
                                    .font(.system(size: 9, weight: .semibold))
                                    .foregroundColor(Theme.olive)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(Theme.oliveFaint)
                                    .clipShape(RoundedRectangle(cornerRadius: 4))
                            }
                        }
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
                
                Text("View, send, and manage your emails directly inside Tap.\nAI-powered response drafting included.")
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
            } else {
                Text("Set up Google credentials in Preferences → Calendars first.")
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
