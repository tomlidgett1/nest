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
        case forward
        case newEmail
    }
    
    /// Which recipient field is currently showing suggestions.
    private enum RecipientField {
        case to, cc, bcc
    }
    
    @Environment(AppState.self) private var appState
    @Query private var styleProfiles: [StyleProfile]
    
    @State private var draft: EmailDraft
    @State private var showCcField: Bool
    @State private var showBccField: Bool
    
    // Token-based recipient state
    @State private var toTokens: [RecipientToken]
    @State private var toInputText: String = ""
    @State private var ccTokens: [RecipientToken]
    @State private var ccInputText: String = ""
    @State private var bccTokens: [RecipientToken]
    @State private var bccInputText: String = ""
    
    // Dynamic row height measurement for dropdown positioning
    
    
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
        self._toTokens = State(initialValue: draft.to.map { RecipientToken(email: $0) })
        self._ccTokens = State(initialValue: draft.cc.map { RecipientToken(email: $0) })
        self._bccTokens = State(initialValue: draft.bcc.map { RecipientToken(email: $0) })
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
                
                RecipientTokenField(
                    tokens: $toTokens,
                    inputText: $toInputText,
                    placeholder: "Recipients",
                    onSearchQueryChanged: { query in
                        onRecipientInputChanged(field: .to, text: query)
                    }
                )
                .onChange(of: toTokens) { _, _ in
                    draft.to = toTokens.map(\.email)
                }
                
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
            
            // Inline suggestion dropdown for To field
            if activeRecipientField == .to && !contactSuggestions.isEmpty {
                suggestionDropdownView
                    .padding(.leading, 75)
                    .padding(.trailing, 20)
                    .padding(.vertical, 2)
            }
            
            // — Cc (shown on toggle or pre-filled) —
            if showCcField {
                rowDivider()
                composeRow {
                    Text("Cc:")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Theme.textTertiary)
                        .frame(width: 55, alignment: .trailing)
                    
                    RecipientTokenField(
                        tokens: $ccTokens,
                        inputText: $ccInputText,
                        placeholder: "",
                        onSearchQueryChanged: { query in
                            onRecipientInputChanged(field: .cc, text: query)
                        }
                    )
                    .onChange(of: ccTokens) { _, _ in
                        draft.cc = ccTokens.map(\.email)
                    }
                    
                    Spacer()
                }
                
                // Inline suggestion dropdown for Cc field
                if activeRecipientField == .cc && !contactSuggestions.isEmpty {
                    suggestionDropdownView
                        .padding(.leading, 75)
                        .padding(.trailing, 20)
                        .padding(.vertical, 2)
                }
            }
            
            // — Bcc (shown on toggle or pre-filled) —
            if showBccField {
                rowDivider()
                composeRow {
                    Text("Bcc:")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Theme.textTertiary)
                        .frame(width: 55, alignment: .trailing)
                    
                    RecipientTokenField(
                        tokens: $bccTokens,
                        inputText: $bccInputText,
                        placeholder: "",
                        onSearchQueryChanged: { query in
                            onRecipientInputChanged(field: .bcc, text: query)
                        }
                    )
                    .onChange(of: bccTokens) { _, _ in
                        draft.bcc = bccTokens.map(\.email)
                    }
                    
                    Spacer()
                }
                
                // Inline suggestion dropdown for Bcc field
                if activeRecipientField == .bcc && !contactSuggestions.isEmpty {
                    suggestionDropdownView
                        .padding(.leading, 75)
                        .padding(.trailing, 20)
                        .padding(.vertical, 2)
                }
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
            
            // — Quoted original email —
            if let quoted = quotedMessage {
                rowDivider()
                
                VStack(alignment: .leading, spacing: 4) {
                    if mode == .forward {
                        Text("---------- Forwarded message ----------")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.textTertiary)
                            .padding(.bottom, 4)
                    }
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
        .background(Color.clear)
        .task {
            await gmail.loadContactCacheIfNeeded()
        }
        .onReceive(NotificationCenter.default.publisher(for: .emailComposeToolbarAction)) { notification in
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
        // Auto-commit any pending text in recipient fields before sending
        commitPendingRecipients()
        
        Task {
            var finalDraft = draft
            
            if let quoted = quotedMessage {
                // ── Plain text version ──
                var plainQuoted = "\n\n"
                if mode == .forward {
                    plainQuoted += "---------- Forwarded message ----------\n"
                    plainQuoted += "From: \(quoted.from) <\(quoted.fromEmail)>\n"
                    plainQuoted += "Date: \(formattedQuotedDate(quoted.date))\n"
                    plainQuoted += "Subject: \(quoted.subject)\n"
                    plainQuoted += "To: \(quoted.to.joined(separator: ", "))\n\n"
                } else {
                    plainQuoted += "On \(formattedQuotedDate(quoted.date)), \(quoted.from) <\(quoted.fromEmail)> wrote:\n\n"
                }
                
                let plainBody: String
                if !quoted.bodyPlain.isEmpty {
                    plainBody = quoted.bodyPlain
                } else if !quoted.bodyHTML.isEmpty {
                    plainBody = Self.stripHTML(quoted.bodyHTML)
                } else {
                    plainBody = ""
                }
                
                if mode != .forward {
                    plainQuoted += plainBody.components(separatedBy: "\n").map { "> \($0)" }.joined(separator: "\n")
                } else {
                    plainQuoted += plainBody
                }
                
                finalDraft.body = draft.body + plainQuoted
                
                // ── HTML version (preserves original formatting) ──
                let escapedUserBody = draft.body
                    .replacingOccurrences(of: "&", with: "&amp;")
                    .replacingOccurrences(of: "<", with: "&lt;")
                    .replacingOccurrences(of: ">", with: "&gt;")
                    .replacingOccurrences(of: "\n", with: "<br>")
                
                let originalHTML = !quoted.bodyHTML.isEmpty ? quoted.bodyHTML : "<pre>\(plainBody)</pre>"
                
                var htmlBody = """
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#222;">
                \(escapedUserBody)
                </div>
                <br>
                """
                
                if mode == .forward {
                    htmlBody += """
                    <div style="border-top:1px solid #ccc;padding-top:12px;margin-top:12px;color:#555;font-size:13px;">
                    <b>---------- Forwarded message ----------</b><br>
                    <b>From:</b> \(quoted.from) &lt;\(quoted.fromEmail)&gt;<br>
                    <b>Date:</b> \(formattedQuotedDate(quoted.date))<br>
                    <b>Subject:</b> \(quoted.subject)<br>
                    <b>To:</b> \(quoted.to.joined(separator: ", "))<br>
                    </div>
                    <br>
                    \(originalHTML)
                    """
                } else {
                    htmlBody += """
                    <div style="border-left:3px solid #ccc;padding-left:12px;margin-top:12px;color:#555;">
                    <p style="font-size:12px;color:#888;">On \(formattedQuotedDate(quoted.date)), \(quoted.from) &lt;\(quoted.fromEmail)&gt; wrote:</p>
                    \(originalHTML)
                    </div>
                    """
                }
                
                finalDraft.bodyHTML = htmlBody
            }
            
            let wasSent = await gmail.sendEmail(finalDraft)
            if wasSent {
                if let onSent {
                    onSent()
                } else {
                    onDismiss?()
                }
            }
        }
    }
    
    /// Strips HTML tags and decodes common entities to produce a plain text version.
    private static func stripHTML(_ html: String) -> String {
        var result = html
        let blockPatterns = [
            "<style[^>]*>[\\s\\S]*?</style>",
            "<script[^>]*>[\\s\\S]*?</script>"
        ]
        for pattern in blockPatterns {
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
                result = regex.stringByReplacingMatches(in: result, range: NSRange(result.startIndex..., in: result), withTemplate: "")
            }
        }
        let newlinePatterns = ["<br\\s*/?>", "</p>", "</div>", "</tr>", "</li>", "</h[1-6]>"]
        for pattern in newlinePatterns {
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
                result = regex.stringByReplacingMatches(in: result, range: NSRange(result.startIndex..., in: result), withTemplate: "\n")
            }
        }
        if let regex = try? NSRegularExpression(pattern: "<[^>]+>", options: []) {
            result = regex.stringByReplacingMatches(in: result, range: NSRange(result.startIndex..., in: result), withTemplate: "")
        }
        let entities: [(String, String)] = [
            ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
            ("&quot;", "\""), ("&#39;", "'"), ("&apos;", "'"),
            ("&nbsp;", " "), ("&#160;", " ")
        ]
        for (entity, char) in entities {
            result = result.replacingOccurrences(of: entity, with: char)
        }
        if let regex = try? NSRegularExpression(pattern: "\\n{3,}", options: []) {
            result = regex.stringByReplacingMatches(in: result, range: NSRange(result.startIndex..., in: result), withTemplate: "\n\n")
        }
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
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
    
    /// Called when the inline input text changes in any recipient token field.
    /// Shows instant local cache results, then supplements with People API after a debounce.
    private func onRecipientInputChanged(field: RecipientField, text: String) {
        searchTask?.cancel()
        
        let query = text.trimmingCharacters(in: .whitespaces)
        // Need at least 1 character for local cache, 2 for API
        guard !query.isEmpty else {
            contactSuggestions = []
            activeRecipientField = nil
            return
        }
        
        activeRecipientField = field
        let existingEmails = allExistingRecipientEmails()
        
        // 1. Instant local cache results (no debounce)
        let localResults = gmail.searchLocalContactCache(query: query)
            .filter { !existingEmails.contains($0.email.lowercased()) }
        
        contactSuggestions = localResults
        if !localResults.isEmpty {
            activeRecipientField = field
        } else if query.count < 2 {
            activeRecipientField = nil
        }
        
        // 2. Debounced People API search for supplementary results
        guard query.count >= 2 else { return }
        
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            
            let apiResults = await gmail.searchContactSuggestions(query: query)
            guard !Task.isCancelled else { return }
            
            await MainActor.run {
                // Merge local + API, deduplicate, filter existing recipients
                let currentExisting = allExistingRecipientEmails()
                var seen = Set<String>()
                var merged: [ContactSuggestion] = []
                
                for contact in localResults + apiResults {
                    let key = contact.email.lowercased()
                    if !seen.contains(key) && !currentExisting.contains(key) {
                        seen.insert(key)
                        merged.append(contact)
                    }
                }
                
                contactSuggestions = merged
                activeRecipientField = merged.isEmpty ? nil : field
            }
        }
    }
    
    /// Insert the selected contact as a token in the active recipient field.
    private func selectSuggestion(_ suggestion: ContactSuggestion) {
        guard let field = activeRecipientField else { return }
        
        let token = RecipientToken(
            name: suggestion.name,
            email: suggestion.email
        )
        
        switch field {
        case .to:
            if !toTokens.contains(where: { $0.email.lowercased() == suggestion.email.lowercased() }) {
                withAnimation(.easeInOut(duration: 0.15)) {
                    toTokens.append(token)
                }
            }
            toInputText = ""
        case .cc:
            if !ccTokens.contains(where: { $0.email.lowercased() == suggestion.email.lowercased() }) {
                withAnimation(.easeInOut(duration: 0.15)) {
                    ccTokens.append(token)
                }
            }
            ccInputText = ""
        case .bcc:
            if !bccTokens.contains(where: { $0.email.lowercased() == suggestion.email.lowercased() }) {
                withAnimation(.easeInOut(duration: 0.15)) {
                    bccTokens.append(token)
                }
            }
            bccInputText = ""
        }
        
        // Clear suggestions
        contactSuggestions = []
        activeRecipientField = nil
        hoveredSuggestionId = nil
    }
    
    /// All email addresses currently in To/Cc/Bcc tokens (lowercased), used to filter suggestions.
    private func allExistingRecipientEmails() -> Set<String> {
        Set(
            (toTokens.map(\.email) + ccTokens.map(\.email) + bccTokens.map(\.email))
                .map { $0.lowercased() }
        )
    }
    
    /// Auto-commit any text left in the recipient input fields (e.g., user typed but didn't press Enter).
    private func commitPendingRecipients() {
        // Commit To input
        let toEmail = toInputText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !toEmail.isEmpty {
            if !toTokens.contains(where: { $0.email.lowercased() == toEmail.lowercased() }) {
                toTokens.append(RecipientToken(email: toEmail))
            }
            toInputText = ""
        }
        
        // Commit Cc input
        let ccEmail = ccInputText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !ccEmail.isEmpty {
            if !ccTokens.contains(where: { $0.email.lowercased() == ccEmail.lowercased() }) {
                ccTokens.append(RecipientToken(email: ccEmail))
            }
            ccInputText = ""
        }
        
        // Commit Bcc input
        let bccEmail = bccInputText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !bccEmail.isEmpty {
            if !bccTokens.contains(where: { $0.email.lowercased() == bccEmail.lowercased() }) {
                bccTokens.append(RecipientToken(email: bccEmail))
            }
            bccInputText = ""
        }
        
        // Sync draft
        draft.to = toTokens.map(\.email)
        draft.cc = ccTokens.map(\.email)
        draft.bcc = bccTokens.map(\.email)
    }
    
    /// First letter for the avatar circle in the suggestion dropdown.
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
                        let emails = composed.suggestedTo
                            .components(separatedBy: ",")
                            .map { $0.trimmingCharacters(in: .whitespaces) }
                            .filter { !$0.isEmpty }
                        for email in emails {
                            if !toTokens.contains(where: { $0.email.lowercased() == email.lowercased() }) {
                                toTokens.append(RecipientToken(email: email))
                            }
                        }
                        draft.to = toTokens.map(\.email)
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
    
    private var canSend: Bool {
        !toTokens.isEmpty &&
        toTokens.allSatisfy { $0.email.contains("@") } &&
        !draft.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    
    private func formattedQuotedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, d MMMM yyyy 'at' h:mm a"
        return formatter.string(from: date)
    }
}
