import SwiftUI

/// Full editor for standalone notes — title, tag strip, rich editor, AI enhance.
/// Simplified compared to NoteDetailView: no transcript, no recording controls.
struct StandaloneNoteDetailView: View {
    
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
    private let chatService = InlineChatService()
    
    private var isGeneratingNotes: Bool {
        appState.enhancingNoteId == note.id
    }
    
    private var generatingDotsText: String {
        "Generating notes" + String(repeating: ".", count: generatingDotCount)
    }
    
    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottom) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        // Title row
                        HStack(alignment: .center) {
                            if isEditingTitle {
                                TextField("Note title", text: $editingTitle, onCommit: {
                                    let finalTitle = editingTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                                    if !finalTitle.isEmpty {
                                        appState.renameNote(note, to: finalTitle)
                                    }
                                    isEditingTitle = false
                                })
                                .font(Theme.titleFont(26))
                                .foregroundColor(Theme.textPrimary)
                                .textFieldStyle(.plain)
                                .onExitCommand { isEditingTitle = false }
                            } else {
                                Text(note.title)
                                    .font(Theme.titleFont(26))
                                    .foregroundColor(note.title == "Untitled Note" ? Theme.textTertiary : Theme.textPrimary)
                                    .contentShape(Rectangle())
                                    .onTapGesture {
                                        editingTitle = note.title == "Untitled Note" ? "" : note.title
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
                                if note.enhancedNotes == nil {
                                    Button {
                                        isEnhancing = true
                                        Task {
                                            await appState.enhanceStandaloneNote(note)
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
                                    .help("Enhance with AI")
                                }
                                
                                // Share
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
                        
                        // Metadata badges
                        HStack(spacing: 8) {
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
                            
                            HStack(spacing: 5) {
                                Image(systemName: "doc.text")
                                    .font(.system(size: 11))
                                Text("Note")
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
                            
                            FolderBadgePickerStandalone(note: note)
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
                        
                        // Enhanced notes
                        if let enhanced = note.enhancedNotes, !enhanced.isEmpty {
                            EnhancedContentView(text: enhanced)
                                .padding(.bottom, 16)
                        }
                        
                        // WYSIWYG Markdown Editor
                        MarkdownTextEditor(text: $manualNotes)
                            .frame(minHeight: 200)
                            .onChange(of: manualNotes) { _, newValue in
                                appState.noteRepository.updateRawNotes(newValue, for: note)
                                scheduleAutoTag()
                            }
                        
                        Spacer(minLength: 80)
                    }
                    .frame(maxWidth: 640)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, Theme.Spacing.contentPadding)
                    .padding(.top, 16)
                }
                .scrollIndicators(.never)
                
                // Bottom bar — chat only (no transcript)
                StandaloneBottomBar(
                    note: note,
                    chatMessages: chatMessages,
                    askText: $askText,
                    isAskLoading: $isAskLoading,
                    onAsk: { askQuestion() }
                )
            }
        }
        .background(Theme.background)
        .onAppear {
            if !hasLoadedNotes {
                manualNotes = note.rawNotes
                hasLoadedNotes = true
            }
            if note.title == "Untitled Note" {
                editingTitle = ""
                isEditingTitle = true
            }
        }
        .onChange(of: note.id) { _, _ in
            manualNotes = note.rawNotes
            chatMessages = []
            askText = ""
            isEditingTitle = false
            pendingTags = []
        }
        .onReceive(Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()) { _ in
            if isGeneratingNotes {
                generatingDotCount = (generatingDotCount + 1) % 4
            } else {
                generatingDotCount = 0
            }
        }
        .animation(.easeInOut(duration: 0.4), value: isGeneratingNotes)
    }
    
    // MARK: - Auto Tagging
    
    private func scheduleAutoTag() {
        autoTagTimer?.invalidate()
        autoTagTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { _ in
            Task {
                await appState.autoTagNote(note)
            }
        }
    }
    
    // MARK: - Chat
    
    private func askQuestion() {
        guard !askText.isEmpty else { return }
        isAskLoading = true
        let question = askText
        askText = ""
        
        chatMessages.append(ChatMessage(role: .user, content: question))
        
        Task {
            do {
                let context = note.enhancedNotes ?? note.rawNotes
                let response = try await chatService.ask(
                    question: question,
                    transcriptContext: context,
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
}

// MARK: - Standalone Bottom Bar

private struct StandaloneBottomBar: View {
    let note: Note
    let chatMessages: [ChatMessage]
    @Binding var askText: String
    @Binding var isAskLoading: Bool
    let onAsk: () -> Void
    
    @State private var showChat = true
    
    var body: some View {
        VStack(spacing: 8) {
            // Chat messages panel
            if !chatMessages.isEmpty && showChat {
                VStack(spacing: 0) {
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
                .background(Color.white)
                .cornerRadius(16)
                .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
            }
            
            // Input bar
            HStack(spacing: 8) {
                // Chat toggle
                if !chatMessages.isEmpty {
                    HStack(spacing: 6) {
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
                    }
                    .padding(.horizontal, 14)
                    .frame(height: 50)
                    .background(Theme.barBackground)
                    .cornerRadius(25)
                    .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
                }
                
                // Search/ask bar
                HStack(spacing: 0) {
                    if isAskLoading {
                        HStack(spacing: 6) {
                            ProgressView()
                                .controlSize(.mini)
                            Text("Thinking…")
                                .font(.system(size: 13))
                                .foregroundColor(Theme.textTertiary)
                        }
                        .padding(.leading, 14)
                    } else {
                        TextField("Ask anything about this note", text: $askText)
                            .textFieldStyle(.plain)
                            .font(.system(size: 14))
                            .foregroundColor(Theme.textPrimary)
                            .padding(.leading, 16)
                            .onSubmit { onAsk() }
                    }
                    
                    Spacer()
                }
                .padding(.leading, 6)
                .padding(.trailing, 8)
                .padding(.vertical, 10)
                .frame(minHeight: 50)
                .background(Theme.barBackground)
                .cornerRadius(25)
                .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
            }
        }
        .frame(maxWidth: 640)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.bottom, 16)
    }
}

// MARK: - Folder Badge Picker (Standalone)

private struct FolderBadgePickerStandalone: View {
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
                    if note.folder == nil { Image(systemName: "checkmark") }
                }
            }
            if !folders.isEmpty { Divider() }
            ForEach(folders, id: \.id) { folder in
                Button {
                    appState.noteRepository.moveNote(note, to: folder)
                } label: {
                    HStack {
                        Text(folder.name)
                        if note.folder?.id == folder.id { Image(systemName: "checkmark") }
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
