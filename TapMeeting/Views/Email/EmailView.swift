import SwiftUI

/// Main email view — Outlook-style floating panel layout.
///
/// Layout:
/// ┌──────────────────────────────────────────────────────────────┐
/// │  ┌─────────────────────┐  ┌────────────────────────────────┐ │
/// │  │ [Tabs] [Search]     │  │ [Actions]         [Compose TB] │ │
/// │  │                     │  │                                │ │
/// │  │   EmailListView     │  │      EmailDetailView           │ │
/// │  │                     │  │      / ComposeView             │ │
/// │  └─────────────────────┘  └────────────────────────────────┘ │
/// └──────────────────────────────────────────────────────────────┘
struct EmailView: View {
    
    @Binding var isSidebarCollapsed: Bool
    @Environment(AppState.self) private var appState
    @State private var showEmailCompose = false
    @State private var showSentAnimation = false
    @State private var sentCheckmarkScale: CGFloat = 0.3
    @State private var listPanelWidth: CGFloat? = nil
    @State private var isDraggingDivider = false
    @State private var searchText: String = ""
    @State private var isInReplyMode = false
    @State private var showMailboxPopover = false
    @FocusState private var isSearchFocused: Bool
    
    private let minListWidth: CGFloat = 340
    private let maxListWidthFraction: CGFloat = 0.55
    private let defaultListWidthFraction: CGFloat = 0.38
    
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
        .onReceive(NotificationCenter.default.publisher(for: .emailReplyModeChanged)) { notification in
            let active = notification.userInfo?["active"] as? Bool ?? false
            withAnimation(.easeInOut(duration: 0.2)) {
                isInReplyMode = active
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .emailComposeToggle)) { _ in
            withAnimation(.easeInOut(duration: 0.25)) {
                showEmailCompose.toggle()
                if !showEmailCompose {
                    showSentAnimation = false
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .emailMailboxChanged)) { _ in
            searchText = ""
        }
    }
    
    // MARK: - Connected Content
    
    private func resolvedListWidth(in totalWidth: CGFloat) -> CGFloat {
        let maxWidth = totalWidth * maxListWidthFraction
        if let stored = listPanelWidth {
            return min(max(stored, minListWidth), maxWidth)
        }
        return min(max(totalWidth * defaultListWidthFraction, minListWidth), maxWidth)
    }
    
    private var connectedContent: some View {
        GeometryReader { geo in
            let totalWidth = geo.size.width - 28 // account for outer padding + gap
            let listWidth = resolvedListWidth(in: totalWidth)
            
            HStack(spacing: 0) {
                // MARK: Left Panel — Thread List
                VStack(spacing: 0) {
                    listPanelHeader
                    
                    Rectangle()
                        .fill(Theme.divider.opacity(0.5))
                        .frame(height: 1)
                        .padding(.horizontal, 12)
                    
                    EmailListView()
                        .frame(maxHeight: .infinity)
                }
                .frame(width: listWidth)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Theme.divider.opacity(0.3), lineWidth: 0.5)
                )
                
                // MARK: Drag Handle (in the gap)
                Color.clear
                    .frame(width: 8)
                    .contentShape(Rectangle())
                    .onHover { hovering in
                        if hovering {
                            NSCursor.resizeLeftRight.push()
                        } else {
                            NSCursor.pop()
                        }
                    }
                    .gesture(
                        DragGesture(minimumDistance: 1)
                            .onChanged { value in
                                isDraggingDivider = true
                                let maxWidth = totalWidth * maxListWidthFraction
                                let newWidth = listWidth + value.translation.width
                                listPanelWidth = min(max(newWidth, minListWidth), maxWidth)
                            }
                            .onEnded { _ in
                                isDraggingDivider = false
                            }
                    )
                
                // MARK: Right Panel — Detail / Compose
                VStack(spacing: 0) {
                    detailPanelHeader
                    
                    Rectangle()
                        .fill(Theme.divider.opacity(0.5))
                        .frame(height: 1)
                        .padding(.horizontal, 12)
                    
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
                                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                                            withAnimation(.spring(response: 0.5, dampingFraction: 0.6)) {
                                                sentCheckmarkScale = 1.0
                                            }
                                        }
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
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Theme.divider.opacity(0.3), lineWidth: 0.5)
                )
            }
            .padding(.horizontal, 10)
            .padding(.top, 2)
            .padding(.bottom, 10)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
    
    // MARK: - List Panel Header (Search)
    
    private var isSearchActive: Bool { !gmail.searchQuery.isEmpty }
    
    private var listPanelHeader: some View {
        HStack(spacing: 6) {
            // Mailbox dropdown
            Button {
                showMailboxPopover.toggle()
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: gmail.currentMailbox.icon)
                        .font(.system(size: 12, weight: .medium))
                    Text(gmail.currentMailbox.displayName)
                        .font(.system(size: 12, weight: .medium))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 8, weight: .medium))
                        .foregroundColor(Theme.textTertiary)
                }
                .foregroundColor(Theme.textPrimary)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Theme.sidebarBackground)
                .cornerRadius(6)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showMailboxPopover, arrowEdge: .bottom) {
                mailboxPopover
            }
            
            // Search bar
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Theme.textTertiary)
                
                TextField("Search emails…", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
                    .focused($isSearchFocused)
                    .onSubmit {
                        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !query.isEmpty else { return }
                        Task { await gmail.searchThreads(query) }
                    }
                
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                        gmail.clearSearch()
                        gmail.selectedThread = nil
                        gmail.selectedMessageId = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.textTertiary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Theme.sidebarBackground)
            .cornerRadius(6)
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(isSearchFocused ? Theme.olive.opacity(0.4) : Color.clear, lineWidth: 1)
            )
            
            if gmail.isSearching {
                ProgressView()
                    .controlSize(.mini)
            } else if isSearchActive {
                Text("\(gmail.searchResults.count) result\(gmail.searchResults.count == 1 ? "" : "s")")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Theme.textTertiary)
                    .fixedSize()
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .padding(.bottom, 8)
    }
    
    private var mailboxPopover: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(Mailbox.allCases.enumerated()), id: \.element.id) { index, mailbox in
                if index > 0 {
                    Divider()
                        .padding(.horizontal, 14)
                }
                
                Button {
                    gmail.currentMailbox = mailbox
                    gmail.selectedThread = nil
                    gmail.selectedMessageId = nil
                    gmail.clearSearch()
                    searchText = ""
                    NotificationCenter.default.post(name: .emailMailboxChanged, object: nil)
                    Task { await gmail.fetchMailbox(mailbox) }
                    showMailboxPopover = false
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: mailbox.icon)
                            .font(.system(size: 12))
                            .foregroundColor(Theme.textSecondary)
                            .frame(width: 18)
                        
                        Text(mailbox.displayName)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Theme.textPrimary)
                        
                        Spacer()
                        
                        if gmail.currentMailbox == mailbox {
                            Image(systemName: "checkmark")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(Theme.olive)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 6)
        .frame(width: 200)
        .background(Color.white)
    }
    
    // MARK: - Detail Panel Header (Actions bar)
    
    private var detailPanelHeader: some View {
        HStack(spacing: 6) {
            if showEmailCompose {
                composeActionBar
            } else {
                emailActionBar
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
    
    private func postDetailToolbarAction(_ action: EmailDetailToolbarAction) {
        NotificationCenter.default.post(
            name: .emailDetailToolbarAction,
            object: nil,
            userInfo: ["action": action.rawValue]
        )
    }
    
    /// Actions shown when viewing an email (Delete, Archive, AI actions, reply compose controls)
    private var emailActionBar: some View {
        HStack(spacing: 6) {
            panelActionButton(icon: "trash", label: "Delete") {
                if let thread = gmail.selectedThread {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        Task { await gmail.trashThread(threadId: thread.id) }
                    }
                }
            }
            .help("Move to Bin")
            .opacity(gmail.selectedThread != nil ? 1.0 : 0.4)
            
            panelActionButton(icon: "archivebox", label: "Archive") {
                if let thread = gmail.selectedThread {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        Task { await gmail.archiveThread(threadId: thread.id) }
                    }
                }
            }
            .help("Archive")
            .opacity(gmail.selectedThread != nil ? 1.0 : 0.4)
            
            Rectangle()
                .fill(Theme.divider.opacity(0.4))
                .frame(width: 1, height: 18)
                .padding(.horizontal, 2)
            
            panelActionButton(icon: "text.alignleft", label: "Summarise") {
                postDetailToolbarAction(.summarise)
            }
            .help("AI Summarise")
            .opacity(gmail.selectedThread != nil ? 1.0 : 0.4)
            
            panelActionButton(icon: "sparkles", label: "AI Draft") {
                postDetailToolbarAction(.aiDraft)
            }
            .help("AI Draft Reply")
            .opacity(gmail.selectedThread != nil ? 1.0 : 0.4)
            
            Spacer()
            
            if !isInReplyMode {
                Button {
                    NotificationCenter.default.post(name: .emailComposeToggle, object: nil)
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "square.and.pencil")
                            .font(.system(size: 12, weight: .medium))
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
            
            if isInReplyMode {
                // Reply-mode compose actions
                panelActionButton(icon: "xmark", label: "Discard") {
                    postComposeToolbarAction(.discard)
                }
                
                panelActionButton(icon: "paperclip", label: "Attach") {
                    postComposeToolbarAction(.attach)
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
        }
    }
    
    /// Actions shown when composing a new email (AI Assist, Discard, Attach, Send)
    private var composeActionBar: some View {
        HStack(spacing: 6) {
            panelActionButton(icon: "sparkles", label: "AI Assist") {
                postComposeToolbarAction(.toggleAIAssist)
            }
            
            panelActionButton(icon: "xmark", label: "Discard") {
                postComposeToolbarAction(.discard)
            }
            
            panelActionButton(icon: "paperclip", label: "Attach") {
                postComposeToolbarAction(.attach)
            }
            
            Spacer()
            
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
            
            // Close compose
            Button {
                withAnimation(.easeInOut(duration: 0.25)) {
                    showEmailCompose = false
                    showSentAnimation = false
                }
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .medium))
                    Text("Close")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(Theme.textSecondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Theme.sidebarBackground)
                .cornerRadius(6)
            }
            .buttonStyle(.plain)
            
            // Send
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
    }
    
    // MARK: - Panel Action Button
    
    private func panelActionButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 11))
                Text(label)
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundColor(Theme.textSecondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Theme.sidebarBackground)
            .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }
    
    private func postComposeToolbarAction(_ action: EmailComposeToolbarAction) {
        NotificationCenter.default.post(
            name: .emailComposeToolbarAction,
            object: nil,
            userInfo: ["action": action.rawValue]
        )
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
