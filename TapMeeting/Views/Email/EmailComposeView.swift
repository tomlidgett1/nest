import SwiftUI
import SwiftData
import UniformTypeIdentifiers

extension Notification.Name {
    static let emailComposeToolbarAction = Notification.Name("emailComposeToolbarAction")
}

enum EmailComposeToolbarAction: String {
    case toggleAIAssist
    case attach
    case discard
    case send
}

/// Outlook-style inline email compose view with AI assist capability.
///
/// Renders inline within the conversation thread ScrollView.
/// Shows From, To (with Cc/Bcc toggles), Subject, body editor,
/// and the quoted original message below a separator.
/// AI assist mode allows composing from a natural language prompt.
/// Recipient fields support autocomplete via the Google People API.
struct EmailComposeView: View {
    
    enum Mode {
        case reply
        case replyAll
        case newEmail
    }
    
    /// Which recipient field is currently showing suggestions.
    private enum RecipientField {
        case to, cc, bcc
    }
    
    @Environment(AppState.self) private var appState
    @Query private var styleProfiles: [StyleProfile]
    
    @State private var draft: EmailDraft
    @State private var toText: String
    @State private var ccText: String
    @State private var bccText: String
    @State private var showCcField: Bool
    @State private var showBccField: Bool
    
    // AI Assist state
    @State private var aiAssistEnabled: Bool = false
    @State private var aiPrompt: String = ""
    @State private var isAIGenerating: Bool = false
    @State private var aiError: String?
    
    // Contact autocomplete state
    @State private var contactSuggestions: [ContactSuggestion] = []
    @State private var activeRecipientField: RecipientField?
    @State private var searchTask: Task<Void, Never>?
    @State private var hoveredSuggestionId: String?
    
    let mode: Mode
    let quotedMessage: GmailMessage?
    let senderEmail: String
    var onDismiss: (() -> Void)?
    var onSent: (() -> Void)?
    
    private var gmail: GmailService { appState.gmailService }
    private let aiService = EmailAIService()
    
    /// The style profile for the current account.
    private var activeStyleProfile: StyleProfile? {
        let email = appState.gmailService.connectedEmail ?? ""
        return styleProfiles.first { $0.accountEmail.lowercased() == email.lowercased() }
    }
    
    /// Global email instructions from UserDefaults.
    private var globalInstructions: String? {
        let value = UserDefaults.standard.string(forKey: Constants.Defaults.globalEmailInstructions)
        return value?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? value : nil
    }
    
    init(
        draft: EmailDraft,
        mode: Mode,
        quotedMessage: GmailMessage? = nil,
        senderEmail: String = "",
        onDismiss: (() -> Void)? = nil,
        onSent: (() -> Void)? = nil
    ) {
        self._draft = State(initialValue: draft)
        self._toText = State(initialValue: draft.to.joined(separator: ", "))
        self._ccText = State(initialValue: draft.cc.joined(separator: ", "))
        self._bccText = State(initialValue: draft.bcc.joined(separator: ", "))
        self._showCcField = State(initialValue: !draft.cc.isEmpty)
        self._showBccField = State(initialValue: !draft.bcc.isEmpty)
        self.mode = mode
        self.quotedMessage = quotedMessage
        self.senderEmail = senderEmail
        self.onDismiss = onDismiss
        self.onSent = onSent
    }
    
    // MARK: - Body
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            
            // — From —
            composeRow {
                Text("From:")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Theme.textTertiary)
                    .frame(width: 55, alignment: .trailing)
                
                Text(senderEmail.isEmpty ? "—" : senderEmail)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.textPrimary)
                
                Spacer()
                
                if let onDismiss, mode != .newEmail {
                    Button {
                        onDismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Theme.textTertiary)
                    }
                    .buttonStyle(.plain)
                }
            }
            
            rowDivider()
            
            // — To + Cc/Bcc toggles —
            composeRow {
                Text("To:")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Theme.textTertiary)
                    .frame(width: 55, alignment: .trailing)
                
                TextField("Recipients", text: $toText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.textPrimary)
                    .onChange(of: toText) { _, newValue in
                        draft.to = parseEmails(newValue)
                        onRecipientTextChanged(field: .to, text: newValue)
                    }
                
                Spacer()
                
                HStack(spacing: 12) {
                    if !showCcField {
                        Button("Cc") { withAnimation(.easeInOut(duration: 0.15)) { showCcField = true } }
                            .buttonStyle(.plain)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Theme.textTertiary)
                    }
                    if !showBccField {
                        Button("Bcc") { withAnimation(.easeInOut(duration: 0.15)) { showBccField = true } }
                            .buttonStyle(.plain)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
            }
            .overlay(alignment: .topLeading) {
                if activeRecipientField == .to && !contactSuggestions.isEmpty {
                    suggestionDropdownView
                        .offset(x: 75, y: 38)
                }
            }
            .zIndex(activeRecipientField == .to ? 10 : 1)
            
            // — Cc (shown on toggle or pre-filled) —
            if showCcField {
                rowDivider()
                composeRow {
                    Text("Cc:")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Theme.textTertiary)
                        .frame(width: 55, alignment: .trailing)
                    
                    TextField("", text: $ccText)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textPrimary)
                        .onChange(of: ccText) { _, newValue in
                            draft.cc = parseEmails(newValue)
                            onRecipientTextChanged(field: .cc, text: newValue)
                        }
                    
                    Spacer()
                }
                .overlay(alignment: .topLeading) {
                    if activeRecipientField == .cc && !contactSuggestions.isEmpty {
                        suggestionDropdownView
                            .offset(x: 75, y: 38)
                    }
                }
                .zIndex(activeRecipientField == .cc ? 10 : 1)
            }
            
            // — Bcc (shown on toggle or pre-filled) —
            if showBccField {
                rowDivider()
                composeRow {
                    Text("Bcc:")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Theme.textTertiary)
                        .frame(width: 55, alignment: .trailing)
                    
                    TextField("", text: $bccText)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textPrimary)
                        .onChange(of: bccText) { _, newValue in
                            draft.bcc = parseEmails(newValue)
                            onRecipientTextChanged(field: .bcc, text: newValue)
                        }
                    
                    Spacer()
                }
                .overlay(alignment: .topLeading) {
                    if activeRecipientField == .bcc && !contactSuggestions.isEmpty {
                        suggestionDropdownView
                            .offset(x: 75, y: 38)
                    }
                }
                .zIndex(activeRecipientField == .bcc ? 10 : 1)
            }
            
            rowDivider()
            
            // — Subject —
            composeRow {
                Text("Subject:")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Theme.textTertiary)
                    .frame(width: 55, alignment: .trailing)
                
                TextField("Subject", text: $draft.subject)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                
                Spacer()
            }
            
            rowDivider()
            
            // — AI Prompt (when AI Assist is on and mode is newEmail) —
            if mode == .newEmail && aiAssistEnabled {
                aiPromptSection
                rowDivider()
            }
            
            // — Body editor —
            TextEditor(text: $draft.body)
                .font(.system(size: 14))
                .foregroundColor(Theme.textPrimary)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .frame(minHeight: 150)
            
            // — Attachments bar —
            if !draft.attachments.isEmpty {
                rowDivider()
                FlowLayout(spacing: 8) {
                    ForEach(draft.attachments) { attachment in
                        composeAttachmentCard(attachment)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
            }
            
            // — Send / Discard bar —
            if mode != .newEmail {
                HStack(spacing: 10) {
                    Button {
                        onDismiss?()
                    } label: {
                        Text("Discard")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Theme.textTertiary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 6)
                            .background(Theme.sidebarBackground)
                            .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                    
                    // Attach file button
                    Button {
                        pickFiles()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "paperclip")
                                .font(.system(size: 11))
                            Text("Attach")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(Theme.textSecondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Theme.sidebarBackground)
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                    
                    Spacer()
                    
                    if let error = gmail.sendError {
                        Text(error)
                            .font(.system(size: 11))
                            .foregroundColor(Theme.recording)
                    }
                    
                    if let aiError {
                        Text(aiError)
                            .font(.system(size: 11))
                            .foregroundColor(Theme.recording)
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
                        sendDraft()
                    } label: {
                        HStack(spacing: 4) {
                            if gmail.isSending {
                                ProgressView().controlSize(.mini)
                            } else {
                                Image(systemName: "paperplane.fill")
                                    .font(.system(size: 11))
                            }
                            Text("Send")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(canSend ? Theme.olive : Theme.textQuaternary)
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                    .disabled(!canSend || gmail.isSending)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
            }
            
            // — Quoted original email —
            if let quoted = quotedMessage {
                rowDivider()
                
                VStack(alignment: .leading, spacing: 4) {
                    quotedField("From:", value: "\(quoted.from) <\(quoted.fromEmail)>")
                    quotedField("Date:", value: formattedQuotedDate(quoted.date))
                    quotedField("To:", value: quoted.to.joined(separator: ", "))
                    quotedField("Subject:", value: quoted.subject)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                
                // Original email body
                if !quoted.bodyHTML.isEmpty {
                    InlineHTMLView(html: quoted.bodyHTML, messageId: "quoted-\(quoted.id)")
                        .padding(.horizontal, 20)
                        .padding(.bottom, 16)
                } else if !quoted.bodyPlain.isEmpty {
                    Text(quoted.bodyPlain)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textSecondary)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 16)
                }
            }
        }
        .background(Theme.background)
        .onReceive(NotificationCenter.default.publisher(for: .emailComposeToolbarAction)) { notification in
            guard mode == .newEmail else { return }
            guard let rawAction = notification.userInfo?["action"] as? String,
                  let action = EmailComposeToolbarAction(rawValue: rawAction) else { return }
            
            switch action {
            case .toggleAIAssist:
                withAnimation(.easeInOut(duration: 0.15)) {
                    aiAssistEnabled.toggle()
                }
            case .attach:
                pickFiles()
            case .discard:
                onDismiss?()
            case .send:
                sendDraft()
            }
        }
    }
    
    private func sendDraft() {
        Task {
            let wasSent = await gmail.sendEmail(draft)
            if wasSent {
                if let onSent {
                    onSent()
                } else {
                    onDismiss?()
                }
            }
        }
    }
    
    // MARK: - Contact Suggestion Dropdown
    
    /// Floating dropdown showing matching contacts below the active recipient field.
    private var suggestionDropdownView: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(contactSuggestions.prefix(5).enumerated()), id: \.element.id) { index, suggestion in
                HStack(spacing: 8) {
                    // Avatar initial circle
                    ZStack {
                        Circle()
                            .fill(Theme.sidebarBackground)
                            .frame(width: 28, height: 28)
                        
                        Text(contactInitial(for: suggestion))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Theme.textSecondary)
                    }
                    
                    VStack(alignment: .leading, spacing: 1) {
                        if !suggestion.name.isEmpty {
                            Text(suggestion.name)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Theme.textPrimary)
                                .lineLimit(1)
                        }
                        Text(suggestion.email)
                            .font(.system(size: 11))
                            .foregroundColor(Theme.textSecondary)
                            .lineLimit(1)
                    }
                    
                    Spacer()
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(hoveredSuggestionId == suggestion.id ? Theme.sidebarSelection : Color.clear)
                .contentShape(Rectangle())
                .onHover { isHovered in
                    hoveredSuggestionId = isHovered ? suggestion.id : nil
                }
                .onTapGesture {
                    selectSuggestion(suggestion)
                }
                
                if index < min(contactSuggestions.count, 5) - 1 {
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(height: 1)
                        .padding(.leading, 42)
                }
            }
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .shadow(color: .black.opacity(0.08), radius: 12, x: 0, y: 4)
        .shadow(color: .black.opacity(0.04), radius: 2, x: 0, y: 1)
        .frame(width: 280)
    }
    
    // MARK: - Contact Autocomplete Logic
    
    /// Called when text changes in any recipient field. Debounces and searches contacts.
    private func onRecipientTextChanged(field: RecipientField, text: String) {
        searchTask?.cancel()
        
        // Extract the token currently being typed (text after the last comma)
        let token = text
            .components(separatedBy: ",")
            .last?
            .trimmingCharacters(in: .whitespaces) ?? ""
        
        // Need at least 2 characters to search
        guard token.count >= 2 else {
            contactSuggestions = []
            activeRecipientField = nil
            return
        }
        
        activeRecipientField = field
        
        // Debounce: wait 300ms before hitting the API
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            
            let results = await gmail.searchContactSuggestions(query: token)
            guard !Task.isCancelled else { return }
            
            await MainActor.run {
                // Filter out emails already in To/Cc/Bcc
                let existingEmails = Set(
                    (draft.to + draft.cc + draft.bcc)
                        .map { $0.lowercased() }
                )
                contactSuggestions = results.filter {
                    !existingEmails.contains($0.email.lowercased())
                }
                
                // Hide dropdown if no results after filtering
                if contactSuggestions.isEmpty {
                    activeRecipientField = nil
                }
            }
        }
    }
    
    /// Insert the selected contact's email into the active recipient field.
    private func selectSuggestion(_ suggestion: ContactSuggestion) {
        guard let field = activeRecipientField else { return }
        
        // Get the current text for the active field
        let currentText: String
        switch field {
        case .to: currentText = toText
        case .cc: currentText = ccText
        case .bcc: currentText = bccText
        }
        
        // Split into completed emails, drop the partial token, append the selected email
        var parts = currentText
            .components(separatedBy: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        
        if !parts.isEmpty {
            parts.removeLast() // remove the partial token being typed
        }
        parts.append(suggestion.email)
        
        let newText = parts.joined(separator: ", ") + ", "
        
        // Update the correct field
        switch field {
        case .to:
            toText = newText
            draft.to = parseEmails(newText)
        case .cc:
            ccText = newText
            draft.cc = parseEmails(newText)
        case .bcc:
            bccText = newText
            draft.bcc = parseEmails(newText)
        }
        
        // Clear suggestions
        contactSuggestions = []
        activeRecipientField = nil
        hoveredSuggestionId = nil
    }
    
    /// First letter for the avatar circle.
    private func contactInitial(for suggestion: ContactSuggestion) -> String {
        if !suggestion.name.isEmpty {
            return String(suggestion.name.prefix(1)).uppercased()
        }
        return String(suggestion.email.prefix(1)).uppercased()
    }
    
    // MARK: - AI Prompt Section
    
    private var aiPromptSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.olive)
                
                TextField(
                    "e.g. Email Sarah about rescheduling the design review to next Thursday at 2pm",
                    text: $aiPrompt
                )
                .textFieldStyle(.plain)
                .font(.system(size: 12))
                .foregroundColor(Theme.textPrimary)
                .onSubmit {
                    if !aiPrompt.isEmpty {
                        generateFromPrompt()
                    }
                }
                
                Spacer()
                
                Button {
                    generateFromPrompt()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.system(size: 12))
                        Text("Generate")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(aiPrompt.isEmpty || isAIGenerating ? Theme.textQuaternary : Theme.olive)
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                .disabled(aiPrompt.isEmpty || isAIGenerating)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            
            // Shimmer thinking indicator when generating
            if isAIGenerating {
                ShimmerThinkingView(
                    text: "Composing email…",
                    icon: "sparkles",
                    lineCount: 3
                )
                .padding(.horizontal, 20)
                .padding(.bottom, 10)
            }
        }
    }
    
    // MARK: - AI Generation
    
    private func generateFromPrompt() {
        guard !aiPrompt.isEmpty else { return }
        
        isAIGenerating = true
        aiError = nil
        
        Task {
            do {
                let composed = try await aiService.composeEmail(
                    prompt: aiPrompt,
                    styleProfile: activeStyleProfile,
                    globalInstructions: globalInstructions
                )
                await MainActor.run {
                    if !composed.subject.isEmpty {
                        draft.subject = composed.subject
                    }
                    draft.body = composed.body
                    
                    // Try to fill in recipient if suggested
                    if !composed.suggestedTo.isEmpty && composed.suggestedTo.contains("@") {
                        toText = composed.suggestedTo
                        draft.to = parseEmails(composed.suggestedTo)
                    }
                    
                    isAIGenerating = false
                }
            } catch {
                await MainActor.run {
                    aiError = error.localizedDescription
                    isAIGenerating = false
                }
            }
        }
    }
    
    // MARK: - Compose Row
    
    private func composeRow<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 8) {
            content()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }
    
    private func rowDivider() -> some View {
        Rectangle()
            .fill(Theme.divider)
            .frame(height: 1)
            .padding(.leading, 75)
    }
    
    // MARK: - Quoted Field
    
    private func quotedField(_ label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: 4) {
            Text(label)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(Theme.textSecondary)
            Text(value)
                .font(.system(size: 12))
                .foregroundColor(Theme.textSecondary)
                .textSelection(.enabled)
        }
    }
    
    // MARK: - Compose Attachment Card
    
    @ViewBuilder
    private func composeAttachmentCard(_ attachment: EmailAttachmentFile) -> some View {
        HStack(spacing: 0) {
            // File type icon area
            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Theme.sidebarBackground)
                    .frame(width: 32, height: 32)
                
                Image(systemName: "doc.fill")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Theme.textSecondary)
            }
            .padding(.trailing, 8)
            
            // Filename + size
            VStack(alignment: .leading, spacing: 1) {
                Text(attachment.filename)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                
                Text(attachment.formattedSize)
                    .font(.system(size: 10))
                    .foregroundColor(Theme.textTertiary)
            }
            
            Spacer(minLength: 8)
            
            // Remove button
            Button {
                withAnimation(.easeInOut(duration: 0.15)) {
                    draft.attachments.removeAll { $0.id == attachment.id }
                }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 14))
                    .foregroundColor(Theme.textQuaternary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .frame(minWidth: 160, maxWidth: 220)
        .background(Color.white)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Theme.divider, lineWidth: 1)
        )
        .cornerRadius(8)
    }
    
    // MARK: - File Picker
    
    private func pickFiles() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.title = "Attach Files"
        panel.allowedContentTypes = [.item] // allow all file types
        
        let response = panel.runModal()
        guard response == .OK else { return }
        
        for url in panel.urls {
            guard let data = try? Data(contentsOf: url) else { continue }
            
            let filename = url.lastPathComponent
            let mimeType = mimeTypeForURL(url)
            
            let attachment = EmailAttachmentFile(
                id: UUID().uuidString,
                filename: filename,
                mimeType: mimeType,
                data: data
            )
            draft.attachments.append(attachment)
        }
    }
    
    /// Determine MIME type from file URL using UTType.
    private func mimeTypeForURL(_ url: URL) -> String {
        if let utType = UTType(filenameExtension: url.pathExtension) {
            return utType.preferredMIMEType ?? "application/octet-stream"
        }
        return "application/octet-stream"
    }
    
    // MARK: - Helpers
    
    private func parseEmails(_ text: String) -> [String] {
        text.components(separatedBy: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }
    
    private var canSend: Bool {
        !draft.to.isEmpty &&
        draft.to.allSatisfy { $0.contains("@") } &&
        !draft.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    
    private func formattedQuotedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, d MMMM yyyy 'at' h:mm a"
        return formatter.string(from: date)
    }
}
