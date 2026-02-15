import SwiftUI

/// Floating notepad panel — warm cream, distraction-free.
///
/// During meeting: just a title bar + blank editor + optional transcript.
/// After meeting: shows content with enhance prompt.
struct NotepadView: View {
    
    @Environment(AppState.self) private var appState
    @State private var showTranscript = false
    
    var body: some View {
        VStack(spacing: 0) {
            if let meeting = appState.currentMeeting {
                // Header
                PanelHeader(
                    note: meeting.note,
                    showTranscript: $showTranscript,
                    isRecording: true
                )
                
                Rectangle()
                    .fill(Theme.divider)
                    .frame(height: 1)
                
                NoteEditorView(note: meeting.note)
                
                if showTranscript {
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(height: 1)
                    TranscriptPanelView()
                        .frame(maxHeight: 180)
                }
                
            } else {
                // Show recent note or empty state
                let recent = appState.noteRepository.fetchAllNotes()
                if let lastNote = recent.first, lastNote.status != .inProgress {
                    PanelHeader(
                        note: lastNote,
                        showTranscript: $showTranscript,
                        isRecording: false
                    )
                    
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(height: 1)
                    
                    PostMeetingContent(note: lastNote)
                } else {
                    EmptyPanel()
                }
            }
        }
        .frame(minWidth: 380, minHeight: 480)
        .background(Theme.background)
    }
}

// MARK: - Panel Header

private struct PanelHeader: View {
    let note: Note
    @Binding var showTranscript: Bool
    let isRecording: Bool
    @Environment(AppState.self) private var appState
    @State private var isEditingTitle = false
    @State private var editingTitle = ""
    
    var body: some View {
        HStack(alignment: .center) {
            // Back button — hides the notepad
            Button {
                NotificationCenter.default.post(name: .hideNotepad, object: nil)
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 11, weight: .medium))
                    Text("Back")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(Theme.textSecondary)
            }
            .buttonStyle(.plain)
            .onHover { hovering in
                if hovering { NSCursor.pointingHand.push() } else { NSCursor.pop() }
            }
            
            VStack(alignment: .leading, spacing: 2) {
                if isEditingTitle {
                    TextField("Meeting title", text: $editingTitle, onCommit: {
                        let trimmed = editingTitle.trimmingCharacters(in: .whitespaces)
                        if !trimmed.isEmpty {
                            appState.renameNote(note, to: trimmed)
                        }
                        isEditingTitle = false
                    })
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Theme.textPrimary)
                    .textFieldStyle(.plain)
                    .lineLimit(1)
                    .onExitCommand {
                        isEditingTitle = false
                    }
                } else {
                    Text(note.title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(note.title == "New Note" ? Theme.textTertiary : Theme.textPrimary)
                        .lineLimit(1)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            editingTitle = note.title == "New Note" ? "" : note.title
                            isEditingTitle = true
                        }
                        .help("Click to rename")
                }
                
                // Metadata badges row
                HStack(spacing: 6) {
                    if isRecording {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(Theme.recording)
                                .frame(width: 5, height: 5)
                            Text("Recording")
                                .font(.system(size: 10, weight: .medium))
                        }
                        .foregroundColor(Theme.textTertiary)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Theme.cardBackground)
                        .cornerRadius(4)
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(Theme.divider, lineWidth: 1)
                        )
                    }
                    
                    // Date badge
                    HStack(spacing: 3) {
                        Image(systemName: "calendar")
                            .font(.system(size: 9))
                        Text(note.createdAt.formatted(date: .abbreviated, time: .omitted))
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundColor(Theme.textSecondary)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Theme.cardBackground)
                    .cornerRadius(4)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .stroke(Theme.divider, lineWidth: 1)
                    )
                    
                    // Attendee badge
                    if !note.attendees.isEmpty {
                        NotepadAttendeeBadge(attendees: note.attendees)
                    }
                    
                    // Folder badge
                    NotepadFolderBadge(note: note)
                }
            }
            
            Spacer()
            
            if isRecording {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showTranscript.toggle()
                    }
                } label: {
                    Image(systemName: "text.quote")
                        .font(.system(size: 12))
                        .foregroundColor(showTranscript ? Theme.textPrimary : Theme.textQuaternary)
                }
                .buttonStyle(.plain)
                
                Button {
                    appState.stopMeeting()
                } label: {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 8))
                        .foregroundColor(.white)
                        .frame(width: 18, height: 18)
                        .background(Theme.recording)
                        .cornerRadius(4)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, Theme.Spacing.titleTopPadding)
        .padding(.bottom, 10)
        .onAppear {
            if note.title == "New Note" {
                editingTitle = ""
                isEditingTitle = true
            }
        }
    }
}

// MARK: - Post Meeting Content

private struct PostMeetingContent: View {
    let note: Note
    @Environment(AppState.self) private var appState
    
    private var isGenerating: Bool {
        appState.enhancingNoteId == note.id
    }
    
    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    // Generating animation
                    if isGenerating {
                        NotesGeneratingView()
                            .transition(.opacity.combined(with: .scale(scale: 0.98)))
                    } else if note.status == .ended && note.enhancedNotes == nil {
                        // Enhance banner — fallback if auto-enhancement failed
                        HStack(spacing: 8) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.olive)
                            
                            Text("Meeting ended.")
                                .font(.system(size: 13))
                                .foregroundColor(Theme.textSecondary)
                            
                            Spacer()
                            
                            Button("Enhance Notes") {
                                Task {
                                    await appState.enhanceNotes(for: note)
                                }
                            }
                            .font(.system(size: 12, weight: .medium))
                            .buttonStyle(.plain)
                            .foregroundColor(Theme.olive)
                        }
                        .padding(10)
                        .background(Theme.oliveFaint)
                        .cornerRadius(6)
                    }
                    
                    if !note.rawNotes.isEmpty {
                        Text(note.rawNotes)
                            .font(Theme.bodyFont())
                            .foregroundColor(Theme.textPrimary)
                            .textSelection(.enabled)
                            .lineSpacing(3)
                    }
                    
                    if let enhanced = note.enhancedNotes, !enhanced.isEmpty {
                        Rectangle()
                            .fill(Theme.divider)
                            .frame(height: 1)
                        
                        EnhancedContentView(text: enhanced)
                            .transition(.opacity)
                    }
                    
                    Spacer(minLength: 60)
                }
                .padding(.horizontal, 20)
                .padding(.top, Theme.Spacing.contentTopPadding)
                .padding(.bottom, 16)
                .animation(.easeInOut(duration: 0.4), value: isGenerating)
                .animation(.easeInOut(duration: 0.4), value: note.enhancedNotes != nil)
            }
            .scrollIndicators(.never)
        }
    }
}

// MARK: - Empty Panel

private struct EmptyPanel: View {
    @Environment(AppState.self) private var appState
    
    var body: some View {
        VStack(spacing: 10) {
            Spacer()
            
            Text("Tap")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
            
            Text("Start a meeting from the menu bar\nor it will begin automatically.")
                .font(.system(size: 13))
                .foregroundColor(Theme.textTertiary)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
            
            Button("New Note") {
                appState.startMeeting()
            }
            .font(.system(size: 13, weight: .medium))
            .buttonStyle(.plain)
            .foregroundColor(Theme.olive)
            .padding(.top, 4)
            
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
    }
}

// MARK: - Notes Generating View

/// Simple animated placeholder shown while AI enhancement is in progress.
private struct NotesGeneratingView: View {
    @State private var dotCount = 0
    private let timer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()
    
    var body: some View {
        HStack(spacing: 8) {
            ProgressView()
                .controlSize(.small)
            
            Text("Generating notes" + String(repeating: ".", count: dotCount))
                .font(Theme.bodyFont())
                .foregroundColor(Theme.textTertiary)
        }
        .padding()
        .onReceive(timer) { _ in
            dotCount = (dotCount + 1) % 4
        }
    }
}

// MARK: - Notepad Folder Badge

private struct NotepadFolderBadge: View {
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
            HStack(spacing: 3) {
                Image(systemName: note.folder != nil ? "folder.fill" : "plus")
                    .font(.system(size: 9))
                Text(note.folder?.name ?? "Add to folder")
                    .font(.system(size: 10, weight: .medium))
            }
            .foregroundColor(Theme.textSecondary)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(Theme.cardBackground)
            .cornerRadius(4)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(Theme.divider, lineWidth: 1)
            )
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
    }
}

// MARK: - Notepad Attendee Badge

private struct NotepadAttendeeBadge: View {
    let attendees: [String]
    
    var body: some View {
        if attendees.count == 1 {
            label(name: attendees[0], icon: "person.fill")
        } else {
            Menu {
                ForEach(Array(attendees.enumerated()), id: \.offset) { _, name in
                    Button(name) {}
                }
            } label: {
                label(name: attendees[0] + " +\(attendees.count - 1)", icon: "person.2.fill")
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
        }
    }
    
    private func label(name: String, icon: String) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon)
                .font(.system(size: 9))
            Text(name)
                .font(.system(size: 10, weight: .medium))
                .lineLimit(1)
        }
        .foregroundColor(Theme.textSecondary)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(Theme.cardBackground)
        .cornerRadius(4)
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(Theme.divider, lineWidth: 1)
        )
    }
}
