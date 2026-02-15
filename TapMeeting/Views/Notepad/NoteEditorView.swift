import SwiftUI

/// Clean text editor on warm cream background.
struct NoteEditorView: View {
    
    let note: Note
    @Environment(AppState.self) private var appState
    @State private var rawText: String = ""
    @FocusState private var isFocused: Bool
    
    var body: some View {
        TextEditor(text: $rawText)
            .font(Theme.bodyFont())
            .foregroundColor(Theme.textPrimary)
            .scrollContentBackground(.hidden)
            .scrollIndicators(.never)
            .focused($isFocused)
            .padding(.horizontal, 16)
            .padding(.top, Theme.Spacing.contentTopPadding)
            .padding(.bottom, 12)
            .background(Theme.background)
            .onChange(of: rawText) { _, newValue in
                appState.noteRepository.updateRawNotes(newValue, for: note)
            }
            .onAppear {
                rawText = note.rawNotes
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    isFocused = true
                }
            }
    }
}
