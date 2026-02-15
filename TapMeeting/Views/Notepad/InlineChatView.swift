import SwiftUI

/// Inline AI chat (Cmd+J) — ephemeral question/answer.
struct InlineChatView: View {
    
    @Binding var isPresented: Bool
    @Binding var query: String
    
    @Environment(AppState.self) private var appState
    @State private var response: String = ""
    @State private var isLoading = false
    @FocusState private var isFocused: Bool
    
    private let chatService = InlineChatService()
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "sparkle")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textTertiary)
                
                TextField("Ask about this meeting…", text: $query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .focused($isFocused)
                    .onSubmit {
                        Task { await askQuestion() }
                    }
                
                if isLoading {
                    ProgressView()
                        .controlSize(.mini)
                } else if !query.isEmpty || !response.isEmpty {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 9))
                            .foregroundColor(Theme.textTertiary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 8)
            
            if !response.isEmpty {
                Text(response)
                    .font(.system(size: 12))
                    .foregroundColor(Theme.textSecondary)
                    .textSelection(.enabled)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 8)
            }
        }
        .background(Theme.sidebarBackground)
        .onAppear { isFocused = true }
    }
    
    private func askQuestion() async {
        guard !query.isEmpty else { return }
        isLoading = true
        
        do {
            let transcript = appState.transcriptStore.fullTranscriptText
            response = try await chatService.ask(
                question: query,
                transcriptContext: transcript
            )
        } catch {
            response = error.localizedDescription
        }
        
        isLoading = false
    }
    
    private func dismiss() {
        query = ""
        response = ""
        isPresented = false
    }
}
