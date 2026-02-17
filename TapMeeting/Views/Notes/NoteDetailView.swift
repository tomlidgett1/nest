import SwiftUI

/// Note detail — warm cream background, Granola top nav, large title, structured content.
///
/// All buttons are functional:
/// - Back/Home → navigate back to home
/// - Sidebar toggle → collapse/expand sidebar
/// - Sparkles → enhance notes with AI
/// - Share → copy as markdown
/// - Link → copy share link
/// - … → context menu (delete, export)
/// - Bottom "Ask anything" → text field for AI questions
/// - "Write follow up email" → copies email-formatted content
struct NoteDetailView: View {
    
    let note: Note
    @Binding var isSidebarCollapsed: Bool
    var onBack: (() -> Void)?
    var onGoHome: (() -> Void)?
    var onSelectNote: ((UUID) -> Void)?

    @Environment(AppState.self) private var appState
    @State private var isEnhancing = false
    @State private var copied = false
    @State private var askText = ""
    @State private var chatMessages: [ChatMessage] = []
    @State private var isAskLoading = false
    @State private var isEditingTitle = false
    @State private var editingTitle = ""
    @State private var manualNotes = ""
    @State private var hasLoadedNotes = false
    @State private var generatingDotCount = 0
    @State private var pendingTags: [String] = []
    @State private var autoTagTimer: Timer?
    @State private var showMeetingFollowUp = false
    
    private let chatService = InlineChatService()
    
    /// Whether this note is currently being enhanced by AI.
    private var isGeneratingNotes: Bool {
        appState.enhancingNoteId == note.id
    }
    
    private var generatingDotsText: String {
        "Generating notes" + String(repeating: ".", count: generatingDotCount)
    }
    
    /// Whether this note belongs to the currently active meeting.
    private var isLiveNote: Bool {
        guard let meeting = appState.currentMeeting else { return false }
        return meeting.note.id == note.id
    }
    
    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottom) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        // Title row — title on left, actions on right, same line
                        HStack(alignment: .center) {
                            // Title
                            if isEditingTitle {
                                TextField("Meeting title", text: $editingTitle, onCommit: {
                                    let finalTitle = editingTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                                    if !finalTitle.isEmpty {
                                        appState.renameNote(note, to: finalTitle)
                                    }
                                    isEditingTitle = false
                                })
                                .font(Theme.titleFont(26))
                                .foregroundColor(Theme.textPrimary)
                                .textFieldStyle(.plain)
                                .onExitCommand {
                                    isEditingTitle = false
                                }
                            } else {
                                Text(note.title)
                                    .font(Theme.titleFont(26))
                                    .foregroundColor(note.title == "New Note" ? Theme.textTertiary : Theme.textPrimary)
                                    .contentShape(Rectangle())
                                    .onTapGesture {
                                        editingTitle = note.title == "New Note" ? "" : note.title
                                        isEditingTitle = true
                                    }
                                    .help("Click to rename")
                            }
                            
                            Spacer()
                            
                            // Actions
                            HStack(spacing: 10) {
                                // Pin toggle
                                Button {
                                    appState.noteRepository.togglePin(note)
                                } label: {
                                    Image(systemName: note.isPinned ? "star.fill" : "star")
                                        .font(.system(size: 13))
                                        .foregroundColor(note.isPinned ? Color.orange : Theme.textTertiary)
                                }
                                .buttonStyle(.plain)
                                .help(note.isPinned ? "Unpin" : "Pin to top")
                                
                                // Enhance with AI
                                if note.status == .ended && note.enhancedNotes == nil {
                                    Button {
                                        isEnhancing = true
                                        Task {
                                            await appState.enhanceNotes(for: note)
                                            isEnhancing = false
                                        }
                                    } label: {
                                        if isEnhancing {
                                            ProgressView()
                                                .controlSize(.mini)
                                        } else {
                                            Image(systemName: "sparkles")
                                                .font(.system(size: 12))
                                                .foregroundColor(Theme.olive)
                                        }
                                    }
                                    .buttonStyle(.plain)
                                }
                                
                                // Draft Follow-up Email (for ended/enhanced meetings with Gmail connected)
                                if (note.status == .ended || note.status == .enhanced) && appState.gmailService.isConnected {
                                    Button {
                                        showMeetingFollowUp = true
                                    } label: {
                                        HStack(spacing: 4) {
                                            Image(systemName: "envelope")
                                                .font(.system(size: 10))
                                            Text("Follow-up")
                                                .font(.system(size: 12, weight: .medium))
                                        }
                                        .foregroundColor(Theme.textSecondary)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 4)
                                        .background(Theme.cardBackground)
                                        .cornerRadius(6)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 6)
                                                .stroke(Theme.divider, lineWidth: 1)
                                        )
                                    }
                                    .buttonStyle(.plain)
                                    .help("Draft a follow-up email from meeting notes")
                                }
                                
                                // Share button
                                Button {
                                    appState.shareService.copyAsMarkdown(note: note)
                                    copied = true
                                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { copied = false }
                                } label: {
                                    HStack(spacing: 4) {
                                        Image(systemName: "lock.fill")
                                            .font(.system(size: 9))
                                        Text(copied ? "Copied!" : "Share")
                                            .font(.system(size: 12, weight: .medium))
                                    }
                                    .foregroundColor(Theme.textPrimary)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(Theme.cardBackground)
                                    .cornerRadius(6)
                                    .shadow(color: .black.opacity(0.04), radius: 2, y: 1)
                                }
                                .buttonStyle(.plain)
                                
                                // More menu
                                Menu {
                                    Button("Copy as Markdown") {
                                        appState.shareService.copyAsMarkdown(note: note)
                                    }
                                    Button("Copy link") {
                                        Task {
                                            let url = try? await appState.shareService.generateShareLink(for: note)
                                            if let url {
                                                NSPasteboard.general.clearContents()
                                                NSPasteboard.general.setString(url, forType: .string)
                                            }
                                        }
                                    }
                                    Divider()
                                    // Action items are now auto-extracted to the To-Dos tab
                                    if note.enhancedNotes != nil {
                                        Text("Action items are added to To-Dos automatically")
                                            .font(.system(size: 12))
                                            .foregroundColor(.secondary)
                                    }
                                    Divider()
                                    Button("Archived Note", role: .destructive) {
                                        appState.noteRepository.archiveNote(note)
                                        (onGoHome ?? {})()
                                    }
                                } label: {
                                    Image(systemName: "ellipsis")
                                        .font(.system(size: 12))
                                        .foregroundColor(Theme.textTertiary)
                                        .frame(width: 24, height: 24)
                                }
                                .menuStyle(.borderlessButton)
                                .menuIndicator(.hidden)
                                .frame(width: 24)
                            }
                        }
                        .padding(.bottom, 8)
                        
                        // Metadata badges — date, attendees, folder
                        HStack(spacing: 8) {
                            // Date badge
                            HStack(spacing: 5) {
                                Image(systemName: "calendar")
                                    .font(.system(size: 11))
                                Text(note.createdAt.formatted(date: .abbreviated, time: .omitted))
                                    .font(.system(size: 12, weight: .medium))
                            }
                            .foregroundColor(Theme.textSecondary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Theme.cardBackground)
                            .cornerRadius(6)
                            .overlay(
                                RoundedRectangle(cornerRadius: 6)
                                    .stroke(Theme.divider, lineWidth: 1)
                            )
                            
                            // Attendees badge
                            if !note.attendees.isEmpty {
                                AttendeeBadge(attendees: note.attendees)
                            }
                            
                            // Folder badge / picker
                            FolderBadgePicker(note: note)
                        }
                        .padding(.bottom, 8)
                        
                        // Tag strip
                        TagStripView(
                            note: note,
                            pendingTags: $pendingTags
                        )
                        .padding(.bottom, 16)
                        
                        // Generating notes indicator
                        if isGeneratingNotes {
                            HStack(spacing: 10) {
                                ProgressView()
                                    .controlSize(.small)
                                
                                Text(generatingDotsText)
                                    .font(.system(size: 13))
                                    .foregroundColor(Theme.textTertiary)
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.white)
                            .cornerRadius(8)
                            .padding(.bottom, 16)
                            .transition(.opacity.combined(with: .scale(scale: 0.98)))
                        }
                        
                        // Enhanced notes (AI-generated — full colour)
                        if let enhanced = note.enhancedNotes, !enhanced.isEmpty {
                            EnhancedContentView(text: enhanced)
                                .padding(.bottom, 16)
                        }
                        
                        // Manual notes editor — lighter gray to show they're user-typed
                        ManualNotesEditor(
                            text: $manualNotes,
                            hasEnhancedNotes: note.enhancedNotes != nil
                        )
                        .onChange(of: manualNotes) { _, newValue in
                            appState.noteRepository.updateRawNotes(newValue, for: note)
                        }
                        
                        Spacer(minLength: 80)
                    }
                    .frame(maxWidth: 640)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, Theme.Spacing.contentPadding)
                    .padding(.top, 16)
                }
                .scrollIndicators(.never)
                
                // Bottom bar — interactive, transcript + chat live here
                DetailBottomBar(
                    note: note,
                    isLiveNote: isLiveNote,
                    chatMessages: chatMessages,
                    askText: $askText,
                    isAskLoading: $isAskLoading,
                    onAsk: { askQuestion() },
                    onCatchUp: { seconds in catchUp(lastSeconds: seconds) },
                    onWriteEmail: { writeFollowUpEmail() }
                )
            }
        }
        .background(Theme.background)
        .onAppear {
            if !hasLoadedNotes {
                manualNotes = note.rawNotes
                hasLoadedNotes = true
            }
            // Auto-enter edit mode for new untitled notes
            if note.title == "New Note" {
                editingTitle = ""
                isEditingTitle = true
            }
        }
        .onChange(of: note.id) { _, _ in
            // Reset when switching between notes
            manualNotes = note.rawNotes
            chatMessages = []
            askText = ""
            isEditingTitle = false
        }
        .onReceive(Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()) { _ in
            if isGeneratingNotes {
                generatingDotCount = (generatingDotCount + 1) % 4
            } else {
                generatingDotCount = 0
            }
        }
        .animation(.easeInOut(duration: 0.4), value: isGeneratingNotes)
        .sheet(isPresented: $showMeetingFollowUp) {
            MeetingFollowUpSheet(
                note: note,
                onCompose: { draft in
                    // Copy to clipboard for now — user can paste into compose view
                    let emailText = """
                    To: \(draft.to.joined(separator: ", "))
                    Subject: \(draft.subject)
                    
                    \(draft.body)
                    """
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(emailText, forType: .string)
                    showMeetingFollowUp = false
                    copied = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { copied = false }
                },
                onDismiss: {
                    showMeetingFollowUp = false
                }
            )
            .frame(width: 500, height: 550)
        }
    }
    
    // MARK: - Actions
    
    private func askQuestion() {
        guard !askText.isEmpty else { return }
        isAskLoading = true
        let question = askText
        askText = ""
        
        chatMessages.append(ChatMessage(role: .user, content: question))
        
        Task {
            do {
                let transcript: String
                if isLiveNote {
                    transcript = appState.transcriptStore.fullTranscriptText
                } else {
                    transcript = note.transcript.map { u in
                        "[\(u.source.displayLabel)] \(u.text)"
                    }.joined(separator: "\n")
                }
                
                let response = try await chatService.ask(
                    question: question,
                    transcriptContext: transcript,
                    history: chatMessages.dropLast().map { $0 }
                )
                await MainActor.run {
                    chatMessages.append(ChatMessage(role: .assistant, content: response))
                    isAskLoading = false
                }
            } catch {
                await MainActor.run {
                    chatMessages.append(ChatMessage(role: .assistant, content: "Error: \(error.localizedDescription)"))
                    isAskLoading = false
                }
            }
        }
    }
    
    /// Catch up on the last N seconds using Claude Sonnet.
    private func catchUp(lastSeconds: TimeInterval) {
        isAskLoading = true
        
        let windowLabel: String
        switch lastSeconds {
        case ...30: windowLabel = "last 30 seconds"
        case ...120: windowLabel = "last 2 minutes"
        default: windowLabel = "last 5 minutes"
        }
        
        chatMessages.append(ChatMessage(role: .user, content: "What did I miss in the \(windowLabel)?"))
        
        Task {
            do {
                let transcript: String
                if isLiveNote {
                    transcript = appState.transcriptStore.transcriptText(lastSeconds: lastSeconds)
                } else {
                    let cutoff = Date.now.addingTimeInterval(-lastSeconds)
                    transcript = note.transcript
                        .filter { $0.endTime >= cutoff }
                        .map { "[\($0.source.displayLabel)] \($0.text)" }
                        .joined(separator: "\n")
                }
                
                let response = try await chatService.catchUp(
                    transcriptSlice: transcript,
                    windowLabel: windowLabel
                )
                await MainActor.run {
                    chatMessages.append(ChatMessage(role: .assistant, content: response))
                    isAskLoading = false
                }
            } catch {
                await MainActor.run {
                    chatMessages.append(ChatMessage(role: .assistant, content: "Error: \(error.localizedDescription)"))
                    isAskLoading = false
                }
            }
        }
    }
    
    /// Extract action items / next steps from enhanced notes into a new standalone note.
    private func extractActionItems(from enhanced: String) {
        let lines = enhanced.components(separatedBy: "\n")
        var actionItems: [String] = []
        var inActionSection = false
        
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.lowercased().hasPrefix("## next steps") || trimmed.lowercased().hasPrefix("## action items") {
                inActionSection = true
                continue
            }
            if inActionSection {
                if trimmed.hasPrefix("## ") {
                    break // Next section
                }
                if !trimmed.isEmpty {
                    actionItems.append(trimmed)
                }
            }
        }
        
        guard !actionItems.isEmpty else { return }
        
        let newNote = appState.createStandaloneNote(title: "Action Items — \(note.title)")
        newNote.rawNotes = actionItems.joined(separator: "\n")
        appState.noteRepository.linkNotes(note, newNote)
        onSelectNote?(newNote.id)
    }
    
    private func writeFollowUpEmail() {
        let content = note.enhancedNotes ?? note.rawNotes
        guard !content.isEmpty else { return }
        
        let email = """
        Hi,
        
        Following up on our meeting "\(note.title)" — here are the key points:
        
        \(content)
        
        Let me know if I've missed anything.
        
        Best regards
        """
        
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(email, forType: .string)
        copied = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { copied = false }
    }
}

// MARK: - Manual Notes Editor

/// Editable text area for the user's own notes.
/// Styled with a lighter gray to visually distinguish from AI-enhanced content.
private struct ManualNotesEditor: View {
    @Binding var text: String
    let hasEnhancedNotes: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if hasEnhancedNotes {
                Rectangle()
                    .fill(Theme.divider)
                    .frame(height: 1)
                    .padding(.vertical, 8)
                
                Text("Your Notes")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Theme.textQuaternary)
                    .padding(.bottom, 2)
            }
            
            // The actual editor — lighter gray text colour for manual notes
            TextEditor(text: $text)
                .font(Theme.bodyFont())
                .foregroundColor(Theme.textTertiary)
                .scrollContentBackground(.hidden)
                .scrollIndicators(.never)
                .frame(minHeight: 80)
                .padding(0)
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text("Type your notes here…")
                            .font(Theme.bodyFont())
                            .foregroundColor(Theme.textQuaternary)
                            .allowsHitTesting(false)
                            .padding(.top, 1)
                    }
                }
        }
    }
}

// MARK: - Detail Bottom Bar

/// Bottom bar with expandable transcript panel.
/// Shows live transcript (from TranscriptStore) during an active meeting,
/// or the saved transcript (from note.transcript) for ended meetings.
/// Transcript ONLY appears when the waveform button is clicked.
private struct DetailBottomBar: View {
    let note: Note
    let isLiveNote: Bool
    let chatMessages: [ChatMessage]
    @Binding var askText: String
    @Binding var isAskLoading: Bool
    let onAsk: () -> Void
    let onCatchUp: (TimeInterval) -> Void
    let onWriteEmail: () -> Void
    
    @Environment(AppState.self) private var appState
    @State private var showTranscript = false
    @State private var showChat = true
    
    /// Whether there's any transcript to show (live or saved).
    private var hasTranscript: Bool {
        if isLiveNote {
            return true // Always show button during live — even if empty, it shows "Listening…"
        }
        return !note.transcript.isEmpty
    }
    
    /// Responsive breakpoints
    private enum BarLayout {
        case wide      // >= 560pt — full 3-pill row
        case medium    // >= 420pt — compact labels, 2 rows when live
        case narrow    // < 420pt  — stacked, icon-only buttons
        
        init(width: CGFloat) {
            if width >= 560 { self = .wide }
            else if width >= 420 { self = .medium }
            else { self = .narrow }
        }
    }
    
    var body: some View {
        GeometryReader { geo in
            let layout = BarLayout(width: geo.size.width)
            let hPad: CGFloat = layout == .narrow ? 12 : (layout == .medium ? 20 : 32)
            
            VStack(spacing: 8) {
                Spacer()
                
                // Expandable panels — transcript and/or chat
                if (showTranscript && hasTranscript) || (!chatMessages.isEmpty && showChat) {
                    expandablePanels
                }
                
                // Floating action buttons — resume & regenerate
                if !isLiveNote && !note.transcript.isEmpty && (note.status == .ended || note.status == .enhanced) {
                    floatingActionButtons(layout: layout)
                }
                
                // Main bar — adapts to width
                mainBar(layout: layout)
            }
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, hPad)
            .padding(.bottom, layout == .narrow ? 10 : 16)
        }
    }
    
    // MARK: - Expandable Panels
    
    private var expandablePanels: some View {
        VStack(spacing: 0) {
            if showTranscript && hasTranscript {
                BottomTranscriptPanel(
                    note: note,
                    isLiveNote: isLiveNote
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
                
                if !chatMessages.isEmpty && showChat {
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(height: 1)
                        .padding(.horizontal, 12)
                }
            }
            
            if !chatMessages.isEmpty && showChat {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(chatMessages) { message in
                                if message.role == .user {
                                    HStack(spacing: 6) {
                                        Image(systemName: "person.fill")
                                            .font(.system(size: 9))
                                            .foregroundColor(Theme.textTertiary)
                                        Text(message.content)
                                            .font(.system(size: 13, weight: .medium))
                                            .foregroundColor(Theme.textPrimary)
                                        Spacer()
                                    }
                                    .id(message.id)
                                } else {
                                    HStack(alignment: .top, spacing: 6) {
                                        Image(systemName: "sparkle")
                                            .font(.system(size: 9))
                                            .foregroundColor(Theme.olive)
                                            .padding(.top, 2)
                                        
                                        Text(message.content)
                                            .font(.system(size: 13))
                                            .foregroundColor(Theme.textSecondary)
                                            .textSelection(.enabled)
                                            .lineSpacing(3)
                                        
                                        Spacer()
                                    }
                                    .id(message.id)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                    .frame(maxHeight: 240)
                    .scrollIndicators(.never)
                    .onChange(of: chatMessages.count) { _, _ in
                        if let lastMessage = chatMessages.last {
                            withAnimation(.easeOut(duration: 0.2)) {
                                proxy.scrollTo(lastMessage.id, anchor: .bottom)
                            }
                        }
                    }
                }
            }
        }
        .background(Color.white)
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
    }
    
    // MARK: - Floating Action Buttons
    
    private func floatingActionButtons(layout: BarLayout) -> some View {
        HStack(spacing: 8) {
            if !appState.isMeetingActive {
                Button {
                    appState.resumeMeeting(for: note)
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 10))
                        if layout != .narrow {
                            Text("Resume Meeting")
                                .font(.system(size: 12, weight: .medium))
                        }
                    }
                    .foregroundColor(Theme.textSecondary)
                    .padding(.horizontal, layout == .narrow ? 10 : 14)
                    .padding(.vertical, 8)
                    .background(Theme.barBackground)
                    .cornerRadius(20)
                    .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
                }
                .buttonStyle(.plain)
                .help("Continue recording on this note")
            }
            
            if appState.enhancingNoteId != note.id {
                Button {
                    Task {
                        await appState.regenerateNotes(for: note)
                    }
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "arrow.trianglehead.2.counterclockwise")
                            .font(.system(size: 10))
                        if layout != .narrow {
                            Text("Regenerate Notes")
                                .font(.system(size: 12, weight: .medium))
                        }
                    }
                    .foregroundColor(Theme.textSecondary)
                    .padding(.horizontal, layout == .narrow ? 10 : 14)
                    .padding(.vertical, 8)
                    .background(Theme.barBackground)
                    .cornerRadius(20)
                    .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
                }
                .buttonStyle(.plain)
                .help("Regenerate AI notes from transcript")
            }
        }
    }
    
    // MARK: - Main Bar (unified)
    
    @ViewBuilder
    private func mainBar(layout: BarLayout) -> some View {
        let compact = layout == .narrow
        let hideLabels = layout != .wide
        
        HStack(spacing: 0) {
            // Transcript toggle section
            if hasTranscript {
                transcriptSection(compact: compact)
                
                barDivider
            }
            
            // Ask anything section (stretches)
            searchSection(compact: hideLabels)
            
            // Recording controls section (live meetings only)
            if isLiveNote {
                barDivider
                
                RecordingControlsPill(compact: compact)
            }
        }
        .padding(.leading, compact ? 10 : 14)
        .padding(.trailing, compact ? 6 : 8)
        .padding(.vertical, compact ? 4 : 5)
        .frame(minHeight: compact ? 42 : 50)
        .background(Theme.barBackground)
        .cornerRadius(compact ? 21 : 25)
        .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
    }
    
    private var barDivider: some View {
        Rectangle()
            .fill(Theme.divider)
            .frame(width: 1, height: 22)
            .padding(.horizontal, 8)
    }
    
    // MARK: - Pill Components
    
    private func transcriptSection(compact: Bool) -> some View {
        HStack(spacing: 6) {
            if hasTranscript {
                HStack(spacing: compact ? 4 : 5) {
                    AnimatedWaveformIcon(
                        isActive: isLiveNote && !appState.isMeetingPaused,
                        micLevel: appState.audioCaptureManager.micLevel,
                        systemLevel: appState.audioCaptureManager.systemLevel
                    )
                    .foregroundColor(showTranscript ? Theme.olive : Theme.textTertiary)
                    
                    if !compact {
                        Text("Transcript")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(showTranscript ? Theme.textPrimary : Theme.textTertiary)
                    }
                    
                    Image(systemName: showTranscript ? "chevron.down" : "chevron.up")
                        .font(.system(size: 7, weight: .semibold))
                        .foregroundColor(Theme.textQuaternary)
                        .animation(.easeInOut(duration: 0.2), value: showTranscript)
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    withAnimation(.easeOut(duration: 0.2)) {
                        showTranscript.toggle()
                    }
                }
            }
            
            if !chatMessages.isEmpty {
                Rectangle()
                    .fill(Theme.divider)
                    .frame(width: 1, height: 14)
                
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showChat.toggle()
                    }
                } label: {
                    Image(systemName: showChat ? "bubble.left.fill" : "bubble.left")
                        .font(.system(size: 11))
                        .foregroundColor(showChat ? Theme.textPrimary : Theme.textTertiary)
                }
                .buttonStyle(.plain)
                .help(showChat ? "Collapse conversation" : "Expand conversation")
            }
        }
    }
    
    private func searchSection(compact: Bool) -> some View {
        HStack(spacing: 0) {
            if isAskLoading {
                HStack(spacing: 6) {
                    ProgressView()
                        .controlSize(.mini)
                    Text("Thinking…")
                        .font(.system(size: compact ? 12 : 13))
                        .foregroundColor(Theme.textTertiary)
                }
            } else {
                TextField("Ask anything", text: $askText)
                    .textFieldStyle(.plain)
                    .font(.system(size: compact ? 13 : 14))
                    .foregroundColor(Theme.textPrimary)
                    .onSubmit { onAsk() }
            }
            
            Spacer(minLength: 4)
            
            // Time-based catch-up buttons
            HStack(spacing: 4) {
                catchUpButton(label: compact ? "30s" : "30s", seconds: 30)
                catchUpButton(label: compact ? "2m" : "2 min", seconds: 120)
                catchUpButton(label: compact ? "5m" : "5 min", seconds: 300)
            }
        }
    }
    
    private func catchUpButton(label: String, seconds: TimeInterval) -> some View {
        Button { onCatchUp(seconds) } label: {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Theme.textSecondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(Theme.oliveFaint)
                .cornerRadius(12)
        }
        .buttonStyle(.plain)
        .help("Catch up on the last \(label)")
    }
}

// MARK: - Recording Controls Pill

/// Pill-shaped recording controls shown in the bottom bar during a live meeting.
/// Contains the recording indicator, elapsed timer, pause and stop buttons.
private struct RecordingControlsPill: View {
    var compact: Bool = false
    
    @Environment(AppState.self) private var appState
    @State private var elapsed: TimeInterval = 0
    @State private var dotOpacity: Double = 1.0
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    
    var body: some View {
        HStack(spacing: compact ? 6 : 8) {
            // Recording dot
            if !appState.isMeetingPaused {
                Circle()
                    .fill(Theme.recording)
                    .frame(width: 6, height: 6)
                    .opacity(dotOpacity)
                    .onAppear {
                        withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                            dotOpacity = 0.3
                        }
                    }
            }
            
            // Timer
            Text(formattedElapsed)
                .font(.system(size: compact ? 10 : 11, weight: .medium, design: .monospaced))
                .foregroundColor(appState.isMeetingPaused ? Theme.textTertiary : Theme.textSecondary)
            
            Rectangle()
                .fill(Theme.divider)
                .frame(width: 1, height: compact ? 12 : 14)
            
            // Pause / Resume
            Button {
                appState.toggleMeetingPause()
            } label: {
                Image(systemName: appState.isMeetingPaused ? "play.fill" : "pause.fill")
                    .font(.system(size: compact ? 8 : 9))
                    .foregroundColor(Theme.textSecondary)
            }
            .buttonStyle(.plain)
            .help(appState.isMeetingPaused ? "Resume recording" : "Pause recording")
            
            // Stop
            Button {
                appState.stopMeeting()
            } label: {
                Image(systemName: "stop.fill")
                    .font(.system(size: compact ? 7 : 8))
                    .foregroundColor(.white)
                    .frame(width: compact ? 18 : 22, height: compact ? 18 : 22)
                    .background(Theme.recording)
                    .cornerRadius(compact ? 9 : 11)
            }
            .buttonStyle(.plain)
            .help("End meeting")
        }
        .onReceive(timer) { _ in
            if let start = appState.currentMeeting?.startedAt, !appState.isMeetingPaused {
                elapsed = Date.now.timeIntervalSince(start)
            }
        }
    }
    
    private var formattedElapsed: String {
        let m = Int(elapsed) / 60
        let s = Int(elapsed) % 60
        return String(format: "%d:%02d", m, s)
    }
}

// MARK: - Bottom Transcript Panel

/// Unified transcript panel that shows in the bottom bar.
/// During a live meeting: shows real-time utterances from TranscriptStore.
/// After meeting ends: shows saved utterances from note.transcript.
private struct BottomTranscriptPanel: View {
    let note: Note
    let isLiveNote: Bool
    
    @Environment(AppState.self) private var appState
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack(spacing: 6) {
                if isLiveNote {
                    Circle()
                        .fill(Theme.recording)
                        .frame(width: 6, height: 6)
                    
                    Text("Live Transcript")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Theme.textSecondary)
                    
                    Text("(\(appState.transcriptStore.utteranceCount))")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textQuaternary)
                } else {
                    Text("Transcript")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Theme.textSecondary)
                    
                    Text("(\(note.transcript.count))")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textQuaternary)
                }
                
                Spacer()
                
                // Debug stats during live recording
                if isLiveNote {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(appState.audioCaptureManager.isMicActive ? .green : Theme.textQuaternary)
                            .frame(width: 4, height: 4)
                        Text("Mic")
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundColor(Theme.textTertiary)
                        
                        Circle()
                            .fill(appState.audioCaptureManager.isSystemAudioActive ? .green : Theme.textQuaternary)
                            .frame(width: 4, height: 4)
                        Text("Sys")
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 6)
            
            Rectangle()
                .fill(Theme.divider)
                .frame(height: 1)
                .padding(.horizontal, 12)
            
            if isLiveNote {
                liveTranscriptContent
            } else {
                savedTranscriptContent
            }
        }
        .frame(maxHeight: 280)
    }
    
    // MARK: - Live Transcript
    
    private var liveTranscriptContent: some View {
        let store = appState.transcriptStore
        
        return GeometryReader { geometry in
            let bubbleWidth = geometry.size.width * 0.75
            let utterances = store.recentUtterances
            
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 4) {
                        if store.utteranceCount == 0 && store.interimResult == nil {
                            Text("Listening…")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.textQuaternary)
                                .italic()
                                .padding(.vertical, 4)
                        }
                        
                        ForEach(Array(utterances.enumerated()), id: \.element.id) { index, utterance in
                            if shouldShowTimestamp(
                                current: utterance.startTime,
                                previous: index > 0 ? utterances[index - 1].startTime : nil
                            ) {
                                TranscriptTimestamp(date: utterance.startTime)
                            }
                            
                            TranscriptLine(
                                label: utterance.source.displayLabel,
                                text: utterance.text,
                                isMic: utterance.source == .mic,
                                isInterim: false,
                                maxBubbleWidth: bubbleWidth
                            )
                            .id(utterance.id)
                        }
                        
                        if let interim = store.interimResult {
                            TranscriptLine(
                                label: interim.source.displayLabel,
                                text: interim.text,
                                isMic: interim.source == .mic,
                                isInterim: true,
                                maxBubbleWidth: bubbleWidth
                            )
                            .id("interim")
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
                .contentMargins(.bottom, 4, for: .scrollContent)
                .scrollIndicators(.never)
                .onAppear {
                    scrollToBottom(proxy: proxy, store: store)
                }
                .onChange(of: store.utteranceCount) { _, _ in
                    withAnimation(.easeOut(duration: 0.3)) {
                        scrollToBottom(proxy: proxy, store: store)
                    }
                }
                .onChange(of: store.interimResult?.text) { _, _ in
                    withAnimation(.easeOut(duration: 0.25)) {
                        scrollToBottom(proxy: proxy, store: store)
                    }
                }
            }
        }
    }
    
    private func scrollToBottom(proxy: ScrollViewProxy, store: TranscriptStore) {
        if store.interimResult != nil {
            proxy.scrollTo("interim", anchor: .bottom)
        } else if let lastId = store.recentUtterances.last?.id {
            proxy.scrollTo(lastId, anchor: .bottom)
        }
    }
    
    /// Show a timestamp when the minute changes between consecutive utterances.
    private func shouldShowTimestamp(current: Date, previous: Date?) -> Bool {
        guard let previous else { return true }
        let cal = Calendar.current
        return cal.component(.minute, from: current) != cal.component(.minute, from: previous)
            || cal.component(.hour, from: current) != cal.component(.hour, from: previous)
    }
    
    // MARK: - Saved Transcript
    
    private var savedTranscriptContent: some View {
        GeometryReader { geometry in
            let bubbleWidth = geometry.size.width * 0.75
            let utterances = note.transcript
            
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(utterances.enumerated()), id: \.element.id) { index, utterance in
                            if shouldShowTimestamp(
                                current: utterance.startTime,
                                previous: index > 0 ? utterances[index - 1].startTime : nil
                            ) {
                                TranscriptTimestamp(date: utterance.startTime)
                            }
                            
                            TranscriptLine(
                                label: utterance.source.displayLabel,
                                text: utterance.text,
                                isMic: utterance.source == .mic,
                                isInterim: false,
                                maxBubbleWidth: bubbleWidth
                            )
                            .id(utterance.id)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
                .contentMargins(.bottom, 4, for: .scrollContent)
                .scrollIndicators(.never)
                .onAppear {
                    if let lastId = note.transcript.last?.id {
                        proxy.scrollTo(lastId, anchor: .bottom)
                    }
                }
            }
        }
    }
}

// MARK: - Transcript Timestamp

/// Centred timestamp separator shown every minute in the transcript flow.
private struct TranscriptTimestamp: View {
    let date: Date
    
    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        return f
    }()
    
    var body: some View {
        HStack(spacing: 8) {
            Rectangle()
                .fill(Theme.divider)
                .frame(height: 0.5)
            
            Text(Self.formatter.string(from: date).lowercased())
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(Theme.textQuaternary)
                .lineLimit(1)
                .fixedSize()
            
            Rectangle()
                .fill(Theme.divider)
                .frame(height: 0.5)
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Transcript Line

/// Conversation-style bubble: system audio (gray) on left, microphone (green) on right.
private struct TranscriptLine: View {
    let label: String
    let text: String
    let isMic: Bool
    let isInterim: Bool
    let maxBubbleWidth: CGFloat
    
    private var bubbleBackground: Color {
        isMic ? Color.green.opacity(0.25) : Color.gray.opacity(0.2)
    }
    
    var body: some View {
        HStack {
            if isMic { Spacer(minLength: 48) }
            Text(text)
                .font(.system(size: 12))
                .foregroundColor(isInterim ? Theme.textTertiary : Theme.textPrimary)
                .italic(isInterim)
                .textSelection(.enabled)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(bubbleBackground)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .frame(maxWidth: maxBubbleWidth, alignment: isMic ? .trailing : .leading)
            if !isMic { Spacer(minLength: 48) }
        }
    }
}

// MARK: - Enhanced Content View

struct EnhancedContentView: View {
    let text: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(text.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                if line.hasPrefix("## ") {
                    EnhancedHeadingLine(text: String(line.dropFirst(3)))
                } else if line.hasPrefix("# ") {
                    EnhancedHeadingLine(text: String(line.dropFirst(2)))
                } else if line.hasPrefix("- [ ] ") {
                    EnhancedCheckboxLine(text: String(line.dropFirst(6)))
                } else if line.hasPrefix("- ") {
                    EnhancedBulletLine(text: String(line.dropFirst(2)), isNested: false)
                } else if line.hasPrefix("* ") {
                    EnhancedBulletLine(text: String(line.dropFirst(2)), isNested: false)
                } else if line.hasPrefix("  - ") || line.hasPrefix("  * ") {
                    EnhancedBulletLine(text: String(line.dropFirst(4)), isNested: true)
                } else if line.hasPrefix("    - ") || line.hasPrefix("    * ") {
                    EnhancedBulletLine(text: String(line.dropFirst(6)), isNested: true)
                } else if !line.trimmingCharacters(in: .whitespaces).isEmpty {
                    Text(line)
                        .font(Theme.bodyFont())
                        .foregroundColor(Theme.textSecondary)
                }
            }
        }
        .textSelection(.enabled)
    }
}

private struct EnhancedHeadingLine: View {
    let text: String
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("#")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(Theme.olive)
            Text(text)
                .font(Theme.headingFont())
                .foregroundColor(Theme.textPrimary)
        }
        .padding(.top, 8)
    }
}

private struct EnhancedCheckboxLine: View {
    let text: String
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Image(systemName: "circle")
                .font(.system(size: 10))
                .foregroundColor(Theme.textTertiary)
            Text(text)
                .font(Theme.bodyFont())
                .foregroundColor(Theme.textSecondary)
        }
    }
}

private struct EnhancedBulletLine: View {
    let text: String
    let isNested: Bool
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(isNested ? "◦" : "•")
                .font(Theme.bodyFont())
                .foregroundColor(isNested ? Theme.textTertiary : Theme.textSecondary)
                .padding(.leading, isNested ? 16 : 0)
            Text(text)
                .font(Theme.bodyFont())
                .foregroundColor(isNested ? Theme.textTertiary : Theme.textSecondary)
                .textSelection(.enabled)
        }
    }
}

// MARK: - Folder Badge Picker

/// Small badge that shows the current folder or "Add to folder", with a dropdown to change it.
private struct FolderBadgePicker: View {
    let note: Note
    @Environment(AppState.self) private var appState
    
    private var folders: [Folder] {
        appState.noteRepository.fetchAllFolders()
    }
    
    var body: some View {
        Menu {
            Button {
                appState.noteRepository.moveNote(note, to: nil)
            } label: {
                HStack {
                    Text("None")
                    if note.folder == nil {
                        Image(systemName: "checkmark")
                    }
                }
            }
            
            if !folders.isEmpty {
                Divider()
            }
            
            ForEach(folders, id: \.id) { folder in
                Button {
                    appState.noteRepository.moveNote(note, to: folder)
                } label: {
                    HStack {
                        Text(folder.name)
                        if note.folder?.id == folder.id {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: note.folder != nil ? "folder.fill" : "plus")
                    .font(.system(size: 11))
                Text(note.folder?.name ?? "Add to folder")
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundColor(Theme.textSecondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Theme.cardBackground)
            .cornerRadius(6)
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Theme.divider, lineWidth: 1)
            )
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
    }
}

// MARK: - Attendee Badge

/// Shows the first attendee name as a badge. If multiple, shows a dropdown with all names.
private struct AttendeeBadge: View {
    let attendees: [String]
    
    var body: some View {
        if attendees.count == 1 {
            badgeLabel(name: attendees[0], icon: "person.fill")
        } else {
            Menu {
                ForEach(Array(attendees.enumerated()), id: \.offset) { _, name in
                    Button(name) {}
                }
            } label: {
                badgeLabel(
                    name: attendees[0] + " +\(attendees.count - 1)",
                    icon: "person.2.fill"
                )
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
        }
    }
    
    private func badgeLabel(name: String, icon: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 11))
            Text(name)
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
        }
        .foregroundColor(Theme.textSecondary)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Theme.cardBackground)
        .cornerRadius(6)
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(Theme.divider, lineWidth: 1)
        )
    }
}

// MARK: - Animated Waveform Icon

/// A waveform icon with animated bars that respond to live audio levels.
/// When inactive, displays a static waveform SF Symbol.
private struct AnimatedWaveformIcon: View {
    let isActive: Bool
    let micLevel: Float
    let systemLevel: Float
    
    /// Individual bar heights driven by a timer when active.
    @State private var barScales: [CGFloat] = [0.4, 0.6, 0.8, 0.6, 0.4]
    @State private var timer: Timer?
    
    private let barCount = 5
    private let barWidth: CGFloat = 1.6
    private let barSpacing: CGFloat = 1.2
    private let maxBarHeight: CGFloat = 12
    private let minScale: CGFloat = 0.25
    
    var body: some View {
        if isActive {
            HStack(spacing: barSpacing) {
                ForEach(0..<barCount, id: \.self) { index in
                    RoundedRectangle(cornerRadius: barWidth / 2)
                        .frame(width: barWidth, height: maxBarHeight * barScales[index])
                }
            }
            .frame(width: 16, height: maxBarHeight)
            .onAppear { startAnimating() }
            .onDisappear { stopAnimating() }
            .onChange(of: isActive) { _, active in
                if active { startAnimating() } else { stopAnimating() }
            }
        } else {
            Image(systemName: "waveform")
                .font(.system(size: 13))
        }
    }
    
    private func startAnimating() {
        stopAnimating()
        timer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: true) { _ in
            withAnimation(.easeInOut(duration: 0.12)) {
                let combinedLevel = CGFloat(max(micLevel, systemLevel))
                let hasInput = combinedLevel > 0.02
                
                for i in 0..<barCount {
                    if hasInput {
                        // Scale bars based on audio level with randomisation for natural look
                        let base = combinedLevel * 2.5
                        let randomVariance = CGFloat.random(in: -0.25...0.25)
                        barScales[i] = max(minScale, min(1.0, base + randomVariance))
                    } else {
                        // Idle pulse — subtle breathing animation
                        let phase = CGFloat(i) / CGFloat(barCount)
                        let idleVariance = CGFloat.random(in: 0.0...0.15)
                        barScales[i] = minScale + phase * 0.1 + idleVariance
                    }
                }
            }
        }
    }
    
    private func stopAnimating() {
        timer?.invalidate()
        timer = nil
        barScales = [0.4, 0.6, 0.8, 0.6, 0.4]
    }
}

