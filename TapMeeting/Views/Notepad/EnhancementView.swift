import SwiftUI

/// Post-meeting enhancement and sharing controls.
struct EnhancementView: View {
    
    let note: Note
    @Environment(AppState.self) private var appState
    @State private var isEnhancing = false
    @State private var copied = false
    
    var body: some View {
        HStack(spacing: 12) {
            if note.status == .ended && note.enhancedNotes == nil {
                if isEnhancing {
                    ProgressView()
                        .controlSize(.small)
                    Text("Enhancing…")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.textSecondary)
                } else {
                    Button {
                        isEnhancing = true
                        Task {
                            await appState.enhanceNotes(for: note)
                            isEnhancing = false
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 11))
                            Text("Enhance")
                                .font(.system(size: 12, weight: .medium))
                        }
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(Theme.olive)
                }
                
            } else if note.enhancedNotes != nil {
                Button {
                    appState.shareService.copyAsMarkdown(note: note)
                    copied = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { copied = false }
                } label: {
                    Text(copied ? "Copied" : "Copy")
                        .font(.system(size: 12, weight: .medium))
                }
                .buttonStyle(.plain)
                .foregroundColor(copied ? .green : Theme.textSecondary)
                
                Button {
                    Task {
                        let url = try? await appState.shareService.generateShareLink(for: note)
                        if let url {
                            appState.noteRepository.markShared(note, url: url)
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(url, forType: .string)
                        }
                    }
                } label: {
                    Text("Share")
                        .font(.system(size: 12, weight: .medium))
                }
                .buttonStyle(.plain)
                .foregroundColor(Theme.textSecondary)
            }
            
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
    }
}
