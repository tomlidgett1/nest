import SwiftUI
@preconcurrency import WebKit

// MARK: - Detail Panel Toolbar Actions (from EmailView header bar)

extension Notification.Name {
    static let emailDetailToolbarAction = Notification.Name("emailDetailToolbarAction")
    static let emailReplyModeChanged = Notification.Name("emailReplyModeChanged")
    static let emailComposeToggle = Notification.Name("emailComposeToggle")
    static let emailMailboxChanged = Notification.Name("emailMailboxChanged")
}

enum EmailDetailToolbarAction: String {
    case aiDraft
    case summarise
}

/// Detail view for a selected email thread.
///
/// Shows subject at top, then one big scrollable conversation chain.
/// Each message renders its full body inline (no per-message scroll).
/// Horizontal separator between messages. Collapsible via small chevron.
struct EmailDetailView: View {
    
    @Environment(AppState.self) private var appState
    @State private var showReply = false
    @State private var showReplyAll = false
    @State private var showForward = false
    @State private var showAIDraft = false
    @State private var aiDraftBody: String = ""
    @State private var collapsedMessageIds: Set<String> = []
    @State private var collapsedForThreadId: String?
    @State private var expandedRecipientKeys: Set<String> = []
    
    // Summarise state
    @State private var threadSummary: String?
    @State private var isSummarising = false
    @State private var showSummary = false
    
    /// Whether any inline compose view (reply, reply all, forward, AI draft) is active.
    private var isInComposeMode: Bool {
        showReply || showReplyAll || showForward || showAIDraft
    }
    
    private func broadcastReplyMode() {
        NotificationCenter.default.post(
            name: .emailReplyModeChanged,
            object: nil,
            userInfo: ["active": isInComposeMode]
        )
    }
    
    private var gmail: GmailService { appState.gmailService }
    private var selectedThreadId: String? { gmail.selectedThread?.id }
    private var selectedMessageId: String? { gmail.selectedMessageId }
    
    /// The sender email for the current thread — uses the thread's account when available.
    private var senderEmailForCurrentThread: String {
        if let thread = gmail.selectedThread, !thread.accountEmail.isEmpty {
            return thread.accountEmail
        }
        return gmail.connectedEmail ?? ""
    }
    
    private let aiService = EmailAIService()
    
    var body: some View {
        Group {
            if let thread = gmail.selectedThread {
                threadContent(thread)
            } else {
                emptySelection
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.clear)
        .onChange(of: selectedThreadId) { _, _ in
            showReply = false
            showReplyAll = false
            showForward = false
            showAIDraft = false
            aiDraftBody = ""
            threadSummary = nil
            showSummary = false
            expandedRecipientKeys = []
            collapseOlderMessages()
            broadcastReplyMode()
        }
        .onChange(of: selectedMessageId) { _, _ in
            expandedRecipientKeys = []
            collapsedMessageIds = []
            collapsedForThreadId = gmail.selectedThread?.id
        }
        .onChange(of: showReply) { _, _ in broadcastReplyMode() }
        .onChange(of: showReplyAll) { _, _ in broadcastReplyMode() }
        .onChange(of: showForward) { _, _ in broadcastReplyMode() }
        .onChange(of: showAIDraft) { _, _ in broadcastReplyMode() }
        .onReceive(NotificationCenter.default.publisher(for: .emailDetailToolbarAction)) { notification in
            guard gmail.selectedThread != nil else { return }
            guard let rawAction = notification.userInfo?["action"] as? String,
                  let action = EmailDetailToolbarAction(rawValue: rawAction) else { return }
            
            switch action {
            case .aiDraft:
                showReply = false; showReplyAll = false; showForward = false
                withAnimation(.easeInOut(duration: 0.2)) { showAIDraft.toggle() }
            case .summarise:
                if showSummary {
                    withAnimation(.easeInOut(duration: 0.3)) { showSummary = false }
                } else {
                    let msgs = gmail.selectedThread.map { displayMessages(for: $0) } ?? []
                    summariseThread(messages: msgs)
                }
            }
        }
    }
    
    /// Collapse all messages except the most recent so the newest email is always
    /// prominently displayed when a thread is selected.
    private func collapseOlderMessages() {
        guard let thread = gmail.selectedThread else {
            collapsedMessageIds = []
            collapsedForThreadId = nil
            return
        }
        let msgs = displayMessages(for: thread)
        if msgs.count > 1 {
            // msgs is oldest→newest; collapse everything except the last (newest)
            collapsedMessageIds = Set(msgs.dropLast().map(\.id))
        } else {
            collapsedMessageIds = []
        }
        collapsedForThreadId = thread.id
    }
    
    /// Returns the effective collapsed set for the current render pass.
    /// When the thread has just changed but `collapseOlderMessages` hasn't fired yet
    /// (onChange runs AFTER the body), `collapsedMessageIds` is stale. This function
    /// detects that case and returns the correct default (all but newest collapsed)
    /// so we never briefly render every message expanded.
    private func effectiveCollapsedIds(for messages: [GmailMessage], threadId: String) -> Set<String> {
        if collapsedForThreadId == threadId {
            return collapsedMessageIds
        }
        // Stale — compute the default collapse set inline
        guard messages.count > 1 else { return [] }
        return Set(messages.dropLast().map(\.id))
    }
    
    // MARK: - Empty
    
    private var emptySelection: some View {
        VStack(spacing: 8) {
            Spacer()
            Image(systemName: "envelope.open")
                .font(.system(size: 28))
                .foregroundColor(Theme.textQuaternary)
            Text("Select an email to read")
                .font(Theme.captionFont(13))
                .foregroundColor(Theme.textTertiary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    // MARK: - Thread Content
    
    /// Messages to display: when a child message is selected, only that message and those before it.
    private func displayMessages(for thread: GmailThread) -> [GmailMessage] {
        guard let msgId = gmail.selectedMessageId,
              let idx = thread.messages.firstIndex(where: { $0.id == msgId }) else {
            return thread.messages
        }
        return Array(thread.messages.prefix(through: idx))
    }
    
    /// The "latest" message for reply/AI draft — the last in the displayed set.
    private func latestDisplayedMessage(for thread: GmailThread) -> GmailMessage? {
        let msgs = displayMessages(for: thread)
        return msgs.last
    }
    
    private func threadContent(_ thread: GmailThread) -> some View {
        let messagesToShow = displayMessages(for: thread)
        let latest = latestDisplayedMessage(for: thread)
        
        return VStack(spacing: 0) {
            // Subject + actions pinned at top
            HStack(alignment: .top) {
                Text(thread.subject)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(Theme.textPrimary)
                    .textSelection(.enabled)
                
                Spacer(minLength: 16)
                
                HStack(spacing: 2) {
                    actionButton(icon: "arrowshape.turn.up.left", tooltip: "Reply", isActive: showReply) {
                        showReplyAll = false; showForward = false; showAIDraft = false
                        showReply.toggle()
                    }
                    actionButton(icon: "arrowshape.turn.up.left.2", tooltip: "Reply All", isActive: showReplyAll) {
                        showReply = false; showForward = false; showAIDraft = false
                        showReplyAll.toggle()
                    }
                    actionButton(icon: "arrowshape.turn.up.right", tooltip: "Forward", isActive: showForward) {
                        showReply = false; showReplyAll = false; showAIDraft = false
                        showForward.toggle()
                    }
                    actionButton(icon: "sparkles", tooltip: "AI Draft", isActive: showAIDraft) {
                        showReply = false; showReplyAll = false; showForward = false
                        showAIDraft.toggle()
                    }
                    
                    // Summarise button — works for single emails and threads
                    actionButton(icon: "text.alignleft", tooltip: "Summarise", isActive: showSummary) {
                        if showSummary {
                            withAnimation(.easeInOut(duration: 0.3)) {
                                showSummary = false
                            }
                        } else {
                            summariseThread(messages: messagesToShow)
                        }
                    }
                    
                    if gmail.currentMailbox == .bin {
                        actionButton(icon: "arrow.uturn.backward", tooltip: "Restore", isActive: false) {
                            Task { await gmail.untrashThread(threadId: thread.id) }
                        }
                    } else {
                        actionButton(icon: "trash", tooltip: "Move to Bin", isActive: false) {
                            Task { await gmail.trashThread(threadId: thread.id) }
                        }
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            
            Rectangle().fill(Theme.divider.opacity(0.5)).frame(height: 1).padding(.horizontal, 12)
            
            // Summary card (above thread messages) — animated dropdown
            VStack(spacing: 0) {
                if showSummary {
                    summaryCard
                        .transition(.opacity.combined(with: .scale(scale: 0.95, anchor: .top)))
                }
            }
            .clipped()
            .animation(.easeInOut(duration: 0.3), value: showSummary)
            
            // When composing, the compose view REPLACES the thread (like Outlook).
            // Otherwise show the conversation chain.
            if showReply, let latest {
                ScrollView {
                    inlineComposeView(
                        draft: {
                            var d = replyDraft(for: latest)
                            if !aiDraftBody.isEmpty { d.body = aiDraftBody }
                            return d
                        }(),
                        mode: .reply,
                        quotedMessage: latest,
                        onDismiss: { showReply = false; aiDraftBody = "" }
                    )
                    .padding(.bottom, 20)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if showReplyAll, let latest {
                ScrollView {
                    inlineComposeView(
                        draft: {
                            var d = replyAllDraft(for: latest)
                            if !aiDraftBody.isEmpty { d.body = aiDraftBody }
                            return d
                        }(),
                        mode: .replyAll,
                        quotedMessage: latest,
                        onDismiss: { showReplyAll = false; aiDraftBody = "" }
                    )
                    .padding(.bottom, 20)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if showForward, let latest {
                ScrollView {
                    inlineComposeView(
                        draft: forwardDraft(for: latest),
                        mode: .forward,
                        quotedMessage: latest,
                        onDismiss: { showForward = false }
                    )
                    .padding(.bottom, 20)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                // Conversation view — AI Draft card appears above emails when active
                ScrollView {
                    if showAIDraft, let latest {
                        EmailAIDraftSheet(
                            thread: messagesToShow,
                            message: latest,
                            onUse: { draftText in
                                aiDraftBody = draftText
                                showAIDraft = false
                                showReply = true
                            },
                            onDismiss: { showAIDraft = false }
                        )
                    }
                    
                    let collapsed = effectiveCollapsedIds(for: messagesToShow, threadId: thread.id)
                    VStack(spacing: 0) {
                        ForEach(Array(messagesToShow.reversed())) { message in
                            let isExpanded = !collapsed.contains(message.id)
                            
                            messageBlock(message, isExpanded: isExpanded, canCollapse: messagesToShow.count > 1)
                            
                            if message.id != messagesToShow.first?.id {
                                Rectangle()
                                    .fill(Theme.divider.opacity(0.5))
                                    .frame(height: 1)
                                    .padding(.horizontal, 12)
                            }
                        }
                    }
                    .padding(.bottom, 20)
                }
                .id(thread.id)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    // MARK: - Summary Card
    
    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                HStack(spacing: 5) {
                    Image(systemName: "text.alignleft")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.olive)
                    Text(isSummarising ? "Summarising…" : "Summary")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Theme.textPrimary)
                }
                
                Spacer()
                
                Button {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        showSummary = false
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Theme.textTertiary)
                }
                .buttonStyle(.plain)
            }
            
            if isSummarising {
                ShimmerThinkingView(
                    text: "",
                    icon: "text.alignleft",
                    lineCount: 3
                )
            } else if let summary = threadSummary {
                SummaryMarkdownView(text: summary)
            }
        }
        .padding(14)
        .background(Theme.sidebarBackground)
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(Theme.divider.opacity(0.5), lineWidth: 1)
        )
        .cornerRadius(6)
        .padding(.horizontal, 24)
        .padding(.vertical, 10)
    }
    
    // MARK: - Summarise Thread
    
    private func summariseThread(messages: [GmailMessage]) {
        withAnimation(.easeInOut(duration: 0.3)) {
            showSummary = true
        }
        
        guard threadSummary == nil else { return }
        
        isSummarising = true
        
        Task {
            do {
                let summary = try await aiService.summariseThread(thread: messages)
                await MainActor.run {
                    threadSummary = summary
                    isSummarising = false
                }
            } catch {
                await MainActor.run {
                    threadSummary = "Failed to summarise: \(error.localizedDescription)"
                    isSummarising = false
                }
            }
        }
    }
    
    // MARK: - Action Button
    
    private func actionButton(icon: String, tooltip: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundColor(isActive ? Theme.olive : Theme.textTertiary)
                .frame(width: 28, height: 28)
                .background(isActive ? Theme.oliveFaint : Color.clear)
                .cornerRadius(6)
        }
        .buttonStyle(.plain)
        .help(tooltip)
    }
    
    private let recipientPreviewCount = 3
    
    /// Extract display name only (no email) from "Name <email>" format.
    private func displayName(for recipient: String) -> String {
        let trimmed = recipient.trimmingCharacters(in: .whitespaces)
        if let idx = trimmed.firstIndex(of: "<") {
            return String(trimmed[..<idx]).trimmingCharacters(in: .whitespaces)
        }
        return trimmed
    }
    
    @ViewBuilder
    private func recipientRow(label: String, recipients: [String], messageId: String, isTo: Bool) -> some View {
        let key = "\(messageId)-\(isTo ? "To" : "Cc")"
        let isExpanded = expandedRecipientKeys.contains(key)
        let visibleCount = isExpanded ? recipients.count : min(recipientPreviewCount, recipients.count)
        let visible = Array(recipients.prefix(visibleCount))
        let remaining = recipients.count - visibleCount
        let displayNames = visible.map { displayName(for: $0) }
        
        HStack(alignment: .center, spacing: 4) {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
            
            HStack(spacing: 0) {
                Text(displayNames.joined(separator: "; "))
                    .font(.system(size: 12))
                    .foregroundColor(Theme.textSecondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                
                if remaining > 0 {
                    Text("; ")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.textSecondary)
                    
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            if isExpanded {
                                expandedRecipientKeys.remove(key)
                            } else {
                                expandedRecipientKeys.insert(key)
                            }
                        }
                    } label: {
                        HStack(spacing: 2) {
                            Text("+\(remaining) more")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Theme.olive)
                            Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(Theme.olive)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .lineLimit(1)
        }
    }
    
    // MARK: - Message Block
    
    private func messageBlock(_ message: GmailMessage, isExpanded: Bool, canCollapse: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header — always visible
            Button {
                guard canCollapse else { return }
                withAnimation(.easeInOut(duration: 0.2)) {
                    if collapsedMessageIds.contains(message.id) {
                        collapsedMessageIds.remove(message.id)
                    } else {
                        collapsedMessageIds.insert(message.id)
                    }
                }
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    SenderAvatarView(
                        email: message.fromEmail,
                        name: message.from,
                        size: 40
                    )
                    
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 0) {
                            Text(message.from)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Theme.textPrimary)
                            Text(" <\(message.fromEmail)>")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.textTertiary)
                        }
                        
                        if isExpanded {
                            if !message.to.isEmpty {
                                recipientRow(
                                    label: "To:",
                                    recipients: message.to,
                                    messageId: message.id,
                                    isTo: true
                                )
                            }
                            if !message.cc.isEmpty {
                                recipientRow(
                                    label: "Cc:",
                                    recipients: message.cc,
                                    messageId: message.id,
                                    isTo: false
                                )
                            }
                        } else {
                            Text(message.snippet)
                                .font(.system(size: 12))
                                .foregroundColor(Theme.textTertiary)
                                .lineLimit(1)
                        }
                    }
                    
                    Spacer()
                    
                    Text(formattedDate(message.date))
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textTertiary)
                    
                    if canCollapse {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(Theme.textQuaternary)
                            .rotationEffect(.degrees(isExpanded ? 0 : -90))
                            .animation(.easeInOut(duration: 0.2), value: isExpanded)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            
            // Attachments — shown at top like Outlook, between header and body
            if isExpanded && !message.attachments.isEmpty {
                attachmentsSection(message.attachments)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 8)
            }
            
            // Body — fully expanded inline, no per-message scroll
            if isExpanded {
                messageBody(message)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 16)
            }
        }
    }
    
    // MARK: - Message Body (inline, no scroll)
    
    @ViewBuilder
    private func messageBody(_ message: GmailMessage) -> some View {
        if !message.bodyHTML.isEmpty {
            InlineHTMLView(html: message.bodyHTML, messageId: message.id)
        } else if !message.bodyPlain.isEmpty {
            Text(message.bodyPlain)
                .font(.system(size: 14))
                .foregroundColor(Theme.textPrimary)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text("No message content available.")
                .font(Theme.captionFont())
                .foregroundColor(Theme.textTertiary)
        }
    }
    
    // MARK: - Attachments Section
    
    @ViewBuilder
    private func attachmentsSection(_ attachments: [GmailAttachment]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            FlowLayout(spacing: 8) {
                ForEach(attachments) { attachment in
                    attachmentCard(attachment)
                }
            }
        }
    }
    
    @ViewBuilder
    private func attachmentCard(_ attachment: GmailAttachment) -> some View {
        Menu {
            Button {
                Task { await gmail.openAttachment(attachment) }
            } label: {
                Label("Open", systemImage: "eye")
            }
            
            Button {
                Task { await gmail.saveAttachmentToFile(attachment) }
            } label: {
                Label("Save As…", systemImage: "arrow.down.to.line")
            }
        } label: {
            HStack(spacing: 0) {
                // File type icon area
                ZStack {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Theme.sidebarBackground)
                        .frame(width: 36, height: 36)
                    
                    Image(systemName: attachment.iconName)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Theme.textSecondary)
                }
                .padding(.trailing, 10)
                
                // Filename + size stacked
                VStack(alignment: .leading, spacing: 1) {
                    Text(attachment.filename)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Theme.textPrimary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    
                    Text(attachment.formattedSize)
                        .font(.system(size: 10))
                        .foregroundColor(Theme.textTertiary)
                }
                
                Spacer(minLength: 8)
                
                // Download hint icon
                Image(systemName: "arrow.down.circle")
                    .font(.system(size: 13))
                    .foregroundColor(Theme.textQuaternary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .frame(minWidth: 180, maxWidth: 240)
            .background(Theme.sidebarBackground.opacity(0.5))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Theme.divider.opacity(0.6), lineWidth: 1)
            )
            .cornerRadius(8)
        }
        .menuStyle(.borderlessButton)
        .fixedSize(horizontal: false, vertical: true)
    }
    
    // MARK: - Inline Compose View
    
    @ViewBuilder
    private func inlineComposeView(
        draft: EmailDraft,
        mode: EmailComposeView.Mode,
        quotedMessage: GmailMessage,
        onDismiss: @escaping () -> Void
    ) -> some View {
        EmailComposeView(
            draft: draft,
            mode: mode,
            quotedMessage: quotedMessage,
            senderEmail: senderEmailForCurrentThread,
            onDismiss: onDismiss
        )
    }
    
    // MARK: - Reply Draft Builders
    
    private func replyDraft(for message: GmailMessage) -> EmailDraft {
        var draft = EmailDraft()
        draft.to = [message.fromEmail]
        draft.subject = message.subject.hasPrefix("Re:") ? message.subject : "Re: \(message.subject)"
        draft.inReplyTo = message.messageIdHeader
        draft.threadId = message.threadId
        draft.references = buildReferences(for: message)
        return draft
    }
    
    private func replyAllDraft(for message: GmailMessage) -> EmailDraft {
        let myEmail = senderEmailForCurrentThread.lowercased()
        
        var draft = EmailDraft()
        draft.to = [message.fromEmail]
        
        // Add all original To recipients (except me) to To
        let otherTo = message.to.filter { !$0.lowercased().contains(myEmail) && !$0.lowercased().contains(message.fromEmail.lowercased()) }
        draft.to.append(contentsOf: otherTo)
        
        // Keep CC recipients (except me)
        draft.cc = message.cc.filter { !$0.lowercased().contains(myEmail) }
        
        draft.subject = message.subject.hasPrefix("Re:") ? message.subject : "Re: \(message.subject)"
        draft.inReplyTo = message.messageIdHeader
        draft.threadId = message.threadId
        draft.references = buildReferences(for: message)
        return draft
    }
    
    private func forwardDraft(for message: GmailMessage) -> EmailDraft {
        var draft = EmailDraft()
        // To is empty — user fills in the recipient(s)
        draft.subject = message.subject.hasPrefix("Fw:") || message.subject.hasPrefix("Fwd:")
            ? message.subject
            : "Fw: \(message.subject)"
        // No inReplyTo, references, or threadId — forward starts a new thread
        return draft
    }
    
    private func buildReferences(for message: GmailMessage) -> String {
        var refs = message.references
        if !message.messageIdHeader.isEmpty {
            if refs.isEmpty {
                refs = message.messageIdHeader
            } else {
                refs += " \(message.messageIdHeader)"
            }
        }
        return refs
    }
    
    // MARK: - Helpers
    
    private func formattedDate(_ date: Date) -> String {
        let calendar = Calendar.current
        let formatter = DateFormatter()
        if calendar.isDateInToday(date) {
            formatter.dateFormat = "h:mm a"
        } else if calendar.isDateInYesterday(date) {
            formatter.dateFormat = "'Yesterday' h:mm a"
        } else {
            formatter.dateFormat = "EEEE d MMMM yyyy 'at' h:mm a"
        }
        return formatter.string(from: date)
    }
}

// MARK: - Summary Markdown View

/// Renders AI-generated summary text with proper markdown formatting.
/// Handles bullet points (•, -, *), bold (**text**), and line breaks.
struct SummaryMarkdownView: View {
    let text: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                if line.isBullet {
                    HStack(alignment: .top, spacing: 6) {
                        Text("•")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Theme.olive)
                        
                        buildAttributedText(line.content)
                            .font(.system(size: 13))
                            .foregroundColor(Theme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } else if line.isHeading {
                    buildAttributedText(line.content)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Theme.textPrimary)
                        .padding(.top, 2)
                } else if !line.content.trimmingCharacters(in: .whitespaces).isEmpty {
                    buildAttributedText(line.content)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .textSelection(.enabled)
    }
    
    // MARK: - Line Parsing
    
    private struct ParsedLine {
        let content: String
        let isBullet: Bool
        let isHeading: Bool
    }
    
    private var lines: [ParsedLine] {
        text.components(separatedBy: "\n").map { raw in
            let trimmed = raw.trimmingCharacters(in: .whitespaces)
            
            // Bullet points: •, -, *, or numbered (1., 2.)
            if trimmed.hasPrefix("• ") {
                return ParsedLine(content: String(trimmed.dropFirst(2)), isBullet: true, isHeading: false)
            } else if trimmed.hasPrefix("- ") {
                return ParsedLine(content: String(trimmed.dropFirst(2)), isBullet: true, isHeading: false)
            } else if trimmed.hasPrefix("* ") {
                return ParsedLine(content: String(trimmed.dropFirst(2)), isBullet: true, isHeading: false)
            } else if let match = trimmed.range(of: #"^\d+[\.\)]\s"#, options: .regularExpression) {
                return ParsedLine(content: String(trimmed[match.upperBound...]), isBullet: true, isHeading: false)
            }
            // Headings
            else if trimmed.hasPrefix("## ") {
                return ParsedLine(content: String(trimmed.dropFirst(3)), isBullet: false, isHeading: true)
            } else if trimmed.hasPrefix("# ") {
                return ParsedLine(content: String(trimmed.dropFirst(2)), isBullet: false, isHeading: true)
            }
            // Regular text
            else {
                return ParsedLine(content: trimmed, isBullet: false, isHeading: false)
            }
        }
    }
    
    // MARK: - Bold Text Rendering
    
    /// Builds a Text view that renders **bold** markdown inline.
    @ViewBuilder
    private func buildAttributedText(_ input: String) -> some View {
        let segments = parseBoldSegments(input)
        segments.reduce(Text("")) { result, segment in
            if segment.isBold {
                result + Text(segment.text).bold()
            } else {
                result + Text(segment.text)
            }
        }
    }
    
    private struct TextSegment {
        let text: String
        let isBold: Bool
    }
    
    /// Splits text on **bold** markers into alternating normal/bold segments.
    private func parseBoldSegments(_ input: String) -> [TextSegment] {
        var segments: [TextSegment] = []
        var remaining = input
        
        while let startRange = remaining.range(of: "**") {
            // Text before the bold marker
            let before = String(remaining[remaining.startIndex..<startRange.lowerBound])
            if !before.isEmpty {
                segments.append(TextSegment(text: before, isBold: false))
            }
            
            // Find closing **
            let afterStart = remaining[startRange.upperBound...]
            if let endRange = afterStart.range(of: "**") {
                let boldText = String(afterStart[afterStart.startIndex..<endRange.lowerBound])
                segments.append(TextSegment(text: boldText, isBold: true))
                remaining = String(afterStart[endRange.upperBound...])
            } else {
                // No closing **, treat rest as normal
                remaining = String(remaining[startRange.lowerBound...])
                segments.append(TextSegment(text: remaining, isBold: false))
                return segments
            }
        }
        
        // Remaining text after all bold markers
        if !remaining.isEmpty {
            segments.append(TextSegment(text: remaining, isBold: false))
        }
        
        return segments
    }
}

// MARK: - Inline HTML View (renders at full content height, no internal scroll)

/// SwiftUI wrapper that renders HTML at its natural height inside a parent ScrollView.
/// Uses a height-reporting WKWebView: after the page loads, JS measures document height,
/// and the view sets its own `.frame(height:)` so the parent ScrollView can scroll it.
struct InlineHTMLView: View {
    let html: String
    let messageId: String
    
    @State private var contentHeight: CGFloat = 200 // sensible default until measured
    
    var body: some View {
        InlineHTMLWebView(html: html, messageId: messageId, contentHeight: $contentHeight)
            .frame(maxWidth: .infinity)
            .frame(height: contentHeight)
            .id(messageId) // force new view per message
    }
}

/// The actual NSViewRepresentable WKWebView that measures its content height.
private struct InlineHTMLWebView: NSViewRepresentable {
    let html: String
    let messageId: String
    @Binding var contentHeight: CGFloat
    
    func makeCoordinator() -> Coordinator {
        Coordinator(contentHeight: $contentHeight)
    }
    
    /// Persistent temp directory for writing HTML files that WKWebView loads via loadFileURL.
    /// Using loadFileURL (instead of loadHTMLString) gives the page a proper file:// origin,
    /// which allows it to fetch remote images, stylesheets, and fonts without cross-origin blocks.
    private static let htmlDir: URL = {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("TapEmail", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()
    
    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.isElementFullscreenEnabled = false
        
        // Allow all remote content (images, stylesheets, etc.) to load automatically
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        
        // Use the default data store so the web view can cache/fetch remote resources
        config.websiteDataStore = .default()
        
        let webView = NonScrollingWebView(frame: CGRect(x: 0, y: 0, width: 600, height: 200), configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.setValue(false, forKey: "drawsBackground")
        
        // Set a standard browser user agent — some image servers reject the
        // default WKWebView UA, which prevents external email images from loading
        webView.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
        
        // Install a user content script that re-measures height after all images load
        let heightScript = WKUserScript(
            source: """
            (function() {
                // ── Rewrite wide fixed-width tables to be fluid ──
                var vw = document.documentElement.clientWidth || window.innerWidth;
                document.querySelectorAll('table').forEach(function(tbl) {
                    var w = tbl.getAttribute('width');
                    if (w && parseInt(w, 10) > vw) {
                        tbl.setAttribute('width', '100%');
                        tbl.style.width = '100%';
                        tbl.style.maxWidth = '100%';
                    }
                    if (tbl.style.width) {
                        var pw = parseInt(tbl.style.width, 10);
                        if (pw > vw) {
                            tbl.style.width = '100%';
                            tbl.style.maxWidth = '100%';
                        }
                    }
                });

                function reportHeight() {
                    var h = Math.max(document.body.scrollHeight, document.body.offsetHeight, document.documentElement.scrollHeight);
                    window.webkit.messageHandlers.heightChanged.postMessage(h);
                }
                // Re-measure when each image loads (or fails)
                document.querySelectorAll('img').forEach(function(img) {
                    if (img.complete) return;
                    img.addEventListener('load', reportHeight);
                    img.addEventListener('error', reportHeight);
                });
                // Also re-measure after a short delay for late-loading resources
                setTimeout(reportHeight, 500);
                setTimeout(reportHeight, 1500);
                setTimeout(reportHeight, 3000);
            })();
            """,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(heightScript)
        config.userContentController.add(context.coordinator, name: "heightChanged")
        
        return webView
    }
    
    func updateNSView(_ webView: WKWebView, context: Context) {
        // Only reload if the HTML actually changed
        if context.coordinator.lastHTML != html {
            context.coordinator.lastHTML = html
            let wrappedHTML = Self.wrapHTML(html)
            
            // Write to a per-message temp file and load via loadFileURL so the page
            // has a proper file:// origin for fetching remote images. Each message
            // gets its own file to prevent concurrent webviews from overwriting
            // each other's content during the brief all-expanded render window.
            let safeId = messageId.replacingOccurrences(of: "/", with: "_")
            let fileURL = Self.htmlDir.appendingPathComponent("email-\(safeId).html")
            try? wrappedHTML.write(to: fileURL, atomically: true, encoding: .utf8)
            webView.loadFileURL(fileURL, allowingReadAccessTo: Self.htmlDir)
        }
    }
    
    static func wrapHTML(_ html: String) -> String {
        """
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data: blob: https: http:; style-src * 'unsafe-inline'; font-src * data:;">
        <style>
            /* ── Base reset ── */
            * { box-sizing: border-box; }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                line-height: 1.55;
                color: #3d382a;
                margin: 0;
                padding: 0;
                background: transparent;
                word-wrap: break-word;
                overflow-wrap: break-word;
                overflow-x: hidden;
                overflow-y: hidden;
                max-width: 100%;
            }

            /* ── Email wrapper — containment boundary ── */
            .email-wrapper {
                max-width: 100%;
                overflow: hidden;
                word-wrap: break-word;
                overflow-wrap: break-word;
            }

            /* ── Table reset — emails use tables for LAYOUT, not data ── */
            table {
                border-collapse: collapse;
            }
            table, td, th {
                border: none;
                padding: 0;
            }

            /* ── Make top-level layout tables fluid ── */
            body > table,
            body > div > table,
            .email-wrapper > table,
            .email-wrapper > div > table,
            .email-wrapper > center > table {
                width: 100% !important;
                max-width: 100% !important;
            }

            /* ── Images — prevent gaps in table cells, constrain width ── */
            img {
                max-width: 100%;
                height: auto;
                display: inline-block;
                vertical-align: middle;
                border: 0;
            }

            /* ── Links ── */
            a {
                color: #6b6440;
                word-break: break-all;
            }

            /* ── Quoted text / blockquotes ── */
            blockquote {
                border-left: 3px solid #e0ddce;
                margin: 10px 0;
                padding: 4px 16px;
                color: #8c8778;
            }

            /* ── Gmail quoted replies ── */
            .gmail_quote {
                border-left: 3px solid #e0ddce;
                margin: 12px 0 0 0;
                padding: 0 0 0 12px;
                color: #8c8778;
            }

            /* ── Code blocks ── */
            pre, code {
                background: #f5f4f0;
                border-radius: 4px;
                padding: 2px 6px;
                font-size: 13px;
            }
            pre {
                overflow-x: auto;
                max-width: 100%;
                padding: 8px 12px;
            }

            /* ── Horizontal rules (thread separators) ── */
            hr {
                border: none;
                border-top: 1px solid #e0ddce;
                margin: 16px 0;
            }

            /* ── Prevent wide fixed-width elements from overflowing ── */
            div, span, p, td {
                max-width: 100%;
            }

            /* ── Centre-aligned email wrappers (common pattern) ── */
            center {
                max-width: 100%;
            }
        </style>
        </head>
        <body>
        <div class="email-wrapper">\(html)</div>
        </body>
        </html>
        """
    }
    
    /// WKWebView subclass that disables its internal scroll view so scroll
    /// events pass through to the parent SwiftUI ScrollView.
    class NonScrollingWebView: WKWebView {
        override func viewDidMoveToSuperview() {
            super.viewDidMoveToSuperview()
            disableInternalScrolling()
        }
        
        override func layout() {
            super.layout()
            disableInternalScrolling()
        }
        
        private func disableInternalScrolling() {
            // WKWebView contains an internal NSScrollView; disable it
            for subview in subviews {
                if let scrollView = subview as? NSScrollView {
                    scrollView.hasVerticalScroller = false
                    scrollView.hasHorizontalScroller = false
                    scrollView.verticalScrollElasticity = .none
                    scrollView.horizontalScrollElasticity = .none
                    // Pass scroll events through
                    scrollView.scrollerStyle = .overlay
                }
            }
        }
        
        // Forward scroll events to the parent scroll view
        override func scrollWheel(with event: NSEvent) {
            nextResponder?.scrollWheel(with: event)
        }
    }
    
    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        @Binding var contentHeight: CGFloat
        var lastHTML: String?
        
        init(contentHeight: Binding<CGFloat>) {
            _contentHeight = contentHeight
        }
        
        // MARK: - Height Measurement
        
        /// Measure document height via JS eval.
        private func measureHeight(in webView: WKWebView) {
            webView.evaluateJavaScript(
                "Math.max(document.body.scrollHeight, document.body.offsetHeight, document.documentElement.scrollHeight)"
            ) { [weak self] result, _ in
                if let height = result as? CGFloat, height > 0 {
                    DispatchQueue.main.async {
                        let newHeight = height + 8
                        // Only grow or change significantly to avoid jitter
                        if newHeight > (self?.contentHeight ?? 0) || abs(newHeight - (self?.contentHeight ?? 0)) > 20 {
                            self?.contentHeight = newHeight
                        }
                    }
                }
            }
        }
        
        // MARK: - WKNavigationDelegate
        
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            measureHeight(in: webView)
        }
        
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .linkActivated,
               let url = navigationAction.request.url {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
        }
        
        // MARK: - WKScriptMessageHandler (re-measure after images load)
        
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "heightChanged", let height = message.body as? CGFloat, height > 0 {
                DispatchQueue.main.async { [weak self] in
                    let newHeight = height + 8
                    if newHeight > (self?.contentHeight ?? 0) || abs(newHeight - (self?.contentHeight ?? 0)) > 20 {
                        self?.contentHeight = newHeight
                    }
                }
            }
        }
    }
}
