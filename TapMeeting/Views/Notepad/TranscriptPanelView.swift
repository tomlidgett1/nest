import SwiftUI

/// Live transcript — conversation style with gray (system) on left, green (mic) on right.
struct TranscriptPanelView: View {
    
    @Environment(AppState.self) private var appState
    
    var body: some View {
        GeometryReader { geometry in
            let bubbleWidth = geometry.size.width * 0.75
            
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(
                            appState.transcriptStore.recentUtterances,
                            id: \.id
                        ) { utterance in
                            TranscriptBubble(
                                label: utterance.source.displayLabel,
                                text: utterance.text,
                                isMic: utterance.source == .mic,
                                isInterim: false,
                                maxBubbleWidth: bubbleWidth
                            )
                            .id(utterance.id)
                        }
                        
                        if let interim = appState.transcriptStore.interimResult {
                            TranscriptBubble(
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
                .scrollIndicators(.never)
                .onChange(of: appState.transcriptStore.utteranceCount) { _, _ in
                    withAnimation(.easeOut(duration: 0.15)) {
                        if let lastId = appState.transcriptStore.recentUtterances.last?.id {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
            }
        }
        .background(Theme.sidebarBackground)
    }
}

// MARK: - Transcript Bubble

/// Conversation-style bubble: system audio (gray) on left, microphone (green) on right.
private struct TranscriptBubble: View {
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
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(bubbleBackground)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .frame(maxWidth: maxBubbleWidth, alignment: isMic ? .trailing : .leading)
            if !isMic { Spacer(minLength: 48) }
        }
    }
}
