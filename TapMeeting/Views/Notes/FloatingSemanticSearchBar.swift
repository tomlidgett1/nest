import SwiftUI

// MARK: - Floating Trigger Bar

struct FloatingSemanticSearchBar: View {
    @Environment(AppState.self) private var appState
    @State private var isOpen = false
    @State private var triggerQuery = ""

    var body: some View {
        VStack(spacing: 0) {
            if isOpen {
                NestChatPanel(onClose: {
                    withAnimation(.easeOut(duration: 0.25)) {
                        isOpen = false
                    }
                })
                .transition(.asymmetric(
                    insertion: .opacity.combined(with: .move(edge: .bottom)).animation(.spring(response: 0.35, dampingFraction: 0.82)),
                    removal: .opacity.animation(.easeOut(duration: 0.18))
                ))
            }

            // Compact trigger pill
            if !isOpen {
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                        isOpen = true
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Theme.olive)

                        Text("Ask Nest anything…")
                            .font(.system(size: 13))
                            .foregroundColor(Theme.textTertiary)

                        Spacer()

                        Text("⌘K")
                            .font(.system(size: 10, weight: .medium, design: .rounded))
                            .foregroundColor(Theme.textQuaternary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Theme.background)
                            .cornerRadius(4)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                    .background(.ultraThinMaterial)
                    .background(Color.white.opacity(0.85))
                    .cornerRadius(14)
                    .shadow(color: .black.opacity(0.06), radius: 12, y: 4)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Theme.divider.opacity(0.5), lineWidth: 0.5)
                    )
                }
                .buttonStyle(.plain)
                .onHover { hovering in
                    if hovering { NSCursor.pointingHand.push() } else { NSCursor.pop() }
                }
            }
        }
        .frame(maxWidth: 600)
    }
}

// MARK: - Chat Panel

private struct NestChatPanel: View {
    @Environment(AppState.self) private var appState
    @State private var draft = ""
    @FocusState private var isInputFocused: Bool
    let onClose: () -> Void

    private var backfillStage: SearchBackfillStatus.Stage? {
        appState.searchIngestionService?.backfillStatus.stage
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            panelHeader

            Divider().foregroundColor(Theme.divider)

            // Indexing banner (only when actively indexing)
            if backfillStage == .indexing {
                indexingBanner
            }

            // Chat thread
            chatThread

            Divider().foregroundColor(Theme.divider)

            // Input bar
            inputBar
        }
        .background(Color.white)
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.10), radius: 20, y: 6)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Theme.divider.opacity(0.4), lineWidth: 0.5)
        )
        .onAppear { isInputFocused = true }
    }

    // MARK: - Header

    private var panelHeader: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkles")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Theme.olive)

            Text("Ask Nest")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Theme.textPrimary)

            Spacer()

            if !appState.semanticChatMessages.isEmpty {
                Button {
                    withAnimation(.easeOut(duration: 0.15)) {
                        appState.clearSemanticChat()
                    }
                } label: {
                    Text("New Chat")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Theme.textTertiary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Theme.background)
                        .cornerRadius(6)
                }
                .buttonStyle(.plain)
            }

            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Theme.textTertiary)
                    .frame(width: 24, height: 24)
                    .background(Theme.background)
                    .cornerRadius(6)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Indexing Banner

    private var indexingBanner: some View {
        HStack(spacing: 8) {
            ProgressView()
                .controlSize(.mini)

            Text("Building your semantic memory…")
                .font(.system(size: 11))
                .foregroundColor(Theme.textSecondary)

            Spacer()

            let pct = Int(appState.searchIngestionService?.backfillStatus.progressPercent ?? 0)
            Text("\(pct)%")
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundColor(Theme.textTertiary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Theme.background)
    }

    // MARK: - Chat Thread

    private var chatThread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    if appState.semanticChatMessages.isEmpty {
                        emptyState
                    } else {
                        ForEach(appState.semanticChatMessages) { message in
                            chatBubble(message)
                                .id(message.id)
                        }

                        if appState.isSemanticLoading {
                            thinkingBubble
                                .id("thinking")
                        }
                    }
                }
                .padding(.vertical, 12)
            }
            .frame(minHeight: 160, maxHeight: 340)
            .onChange(of: appState.semanticChatMessages.count) { _, _ in
                scrollToBottom(proxy)
            }
            .onChange(of: appState.semanticChatMessages.last?.content) { _, _ in
                // Auto-scroll as streaming tokens arrive
                scrollToBottom(proxy)
            }
            .onChange(of: appState.isSemanticLoading) { _, loading in
                if loading {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo("thinking", anchor: .bottom)
                    }
                }
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "sparkles")
                .font(.system(size: 24))
                .foregroundColor(Theme.olive.opacity(0.5))

            Text("Ask me anything about your\nnotes, meetings, or emails")
                .font(.system(size: 13))
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .lineSpacing(2)

            VStack(spacing: 6) {
                suggestionChip("What follow-ups did I promise this week?")
                suggestionChip("Summarise my last meeting with Daniel")
                suggestionChip("What did Rene say about the launch?")
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }

    private func suggestionChip(_ text: String) -> some View {
        Button {
            draft = text
            sendMessage()
        } label: {
            Text(text)
                .font(.system(size: 11))
                .foregroundColor(Theme.textSecondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Theme.background)
                .cornerRadius(8)
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            if hovering { NSCursor.pointingHand.push() } else { NSCursor.pop() }
        }
    }

    // MARK: - Chat Bubble

    @ViewBuilder
    private func chatBubble(_ message: SemanticChatMessage) -> some View {
        if message.role == .user {
            userBubble(message)
        } else {
            assistantBubble(message)
        }
    }

    private func userBubble(_ message: SemanticChatMessage) -> some View {
        HStack {
            Spacer(minLength: 80)

            Text(message.content)
                .font(.system(size: 12.5))
                .foregroundColor(Theme.textPrimary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Theme.olive.opacity(0.10))
                .cornerRadius(14)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 3)
    }

    private func assistantBubble(_ message: SemanticChatMessage) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            // Message box
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(Theme.olive)
                        Text("Nest")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(Theme.textSecondary)
                    }

                    if !message.content.isEmpty {
                        Text(message.content)
                            .font(.system(size: 12.5))
                            .foregroundColor(Theme.textPrimary)
                            .lineSpacing(3)
                            .textSelection(.enabled)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Theme.background)
                .cornerRadius(14)

                Spacer(minLength: 80)
            }

            // Sources — outside the box
            if !message.citations.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 5) {
                        ForEach(message.citations.prefix(5)) { citation in
                            HStack(spacing: 4) {
                                Image(systemName: citationIcon(citation.sourceType))
                                    .font(.system(size: 8))
                                Text(citation.title)
                                    .lineLimit(1)
                            }
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(Theme.textTertiary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Theme.background)
                            .cornerRadius(6)
                        }
                    }
                    .padding(.leading, 2)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 3)
    }

    // MARK: - Thinking Bubble

    private var thinkingBubble: some View {
        HStack {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Theme.olive)

                ShimmerText("Thinking…")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Theme.background)
            .cornerRadius(14)

            Spacer(minLength: 80)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 3)
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        HStack(spacing: 10) {
            TextField("Ask a question…", text: $draft)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .focused($isInputFocused)
                .onSubmit { sendMessage() }

            if appState.isSemanticLoading {
                ProgressView()
                    .controlSize(.small)
                    .frame(width: 28, height: 28)
            } else {
                Button(action: sendMessage) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 24))
                        .foregroundColor(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? Theme.textQuaternary
                            : Theme.olive
                        )
                }
                .buttonStyle(.plain)
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Scroll

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        if let last = appState.semanticChatMessages.last {
            proxy.scrollTo(last.id, anchor: .bottom)
        }
    }

    // MARK: - Actions

    private func sendMessage() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        draft = ""
        Task { await appState.askSemanticAssistant(trimmed) }
    }

    private func citationIcon(_ type: SearchSourceType) -> String {
        switch type {
        case .noteSummary, .noteChunk: return "doc.text"
        case .utteranceChunk: return "waveform"
        case .emailSummary, .emailChunk: return "envelope"
        case .calendarSummary: return "calendar"
        }
    }
}

// MARK: - Shimmer Text

/// Renders text with a continuously sweeping shimmer highlight using overlay + mask.
private struct ShimmerText: View {
    let text: String
    @State private var phase: CGFloat = 0

    init(_ text: String) {
        self.text = text
    }

    private var textView: some View {
        Text(text)
            .font(.system(size: 12, weight: .medium))
    }

    var body: some View {
        textView
            .foregroundColor(Theme.textTertiary)
            .overlay(
                GeometryReader { geo in
                    let width = geo.size.width
                    LinearGradient(
                        stops: [
                            .init(color: .clear, location: 0),
                            .init(color: Theme.textPrimary, location: 0.4),
                            .init(color: Theme.textPrimary, location: 0.6),
                            .init(color: .clear, location: 1.0)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: width * 0.6)
                    .offset(x: -width * 0.3 + phase * (width * 1.3))
                }
                .mask(textView)
            )
            .onAppear {
                withAnimation(
                    .linear(duration: 1.8)
                    .repeatForever(autoreverses: false)
                ) {
                    phase = 1.0
                }
            }
    }
}
