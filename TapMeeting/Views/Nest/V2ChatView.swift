import SwiftUI
import AppKit

/// Full chat panel for the v2 agent system.
/// Replaces the main content area when the "v2" sub-tab is selected within Nest.
struct V2ChatView: View {

    @ObservedObject var chatService: V2ChatService
    @State private var inputText = ""
    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Chat messages
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        if chatService.messages.isEmpty && !chatService.isLoading {
                            emptyState
                        }

                        ForEach(Array(chatService.messages.enumerated()), id: \.element.id) { index, msg in
                            let showHeader = index == 0 || chatService.messages[index - 1].role != msg.role
                            MessageRow(message: msg, showHeader: showHeader)
                                .id(msg.id)
                                .transition(.opacity.combined(with: .offset(y: 6)))
                        }

                        if chatService.isLoading {
                            typingIndicator
                                .id("typing")
                        }
                    }
                    .padding(.vertical, 20)
                    .animation(.easeOut(duration: 0.2), value: chatService.messages.count)
                }
                .scrollIndicators(.never)
                .onChange(of: chatService.messages.count) { _, _ in
                    withAnimation(.easeOut(duration: 0.2)) {
                        if chatService.isLoading {
                            proxy.scrollTo("typing", anchor: .bottom)
                        } else if let lastId = chatService.messages.last?.id {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
                .onChange(of: chatService.isLoading) { _, loading in
                    if loading {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo("typing", anchor: .bottom)
                        }
                    }
                }
            }

            Divider()
                .foregroundColor(Theme.divider)

            // Input bar
            inputBar
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
        .task {
            await chatService.loadHistory()
            await chatService.subscribeToTriggers()
            await chatService.createDefaultTriggersIfNeeded()
        }
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        HStack(spacing: 10) {
            TextField("Ask about your meetings…", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(Theme.bodyFont(14))
                .foregroundColor(Theme.textPrimary)
                .lineLimit(1...5)
                .focused($isInputFocused)
                .onSubmit {
                    if !NSEvent.modifierFlags.contains(.shift) {
                        sendMessage()
                    }
                }

            Button(action: sendMessage) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 24))
                    .foregroundColor(canSend ? Theme.olive : Theme.textQuaternary)
            }
            .disabled(!canSend)
            .buttonStyle(.plain)
            .help("Send message")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(Theme.cardBackground)
    }

    private var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !chatService.isLoading
    }

    // MARK: - Send

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""

        Task {
            await chatService.send(text)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer(minLength: 80)

            Image(systemName: "bird.fill")
                .font(.system(size: 32))
                .foregroundColor(Theme.textQuaternary)
                .symbolRenderingMode(.hierarchical)

            Text("Nest Agent")
                .font(Theme.titleFont(20))
                .foregroundColor(Theme.textPrimary)

            Text("Ask me anything about your meetings, transcripts, notes, and emails. I can also draft emails based on meeting context.")
                .font(Theme.bodyFont(13))
                .foregroundColor(Theme.textTertiary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 360)

            VStack(alignment: .leading, spacing: 8) {
                suggestionChip("What did Ryan commit to in our last call?")
                suggestionChip("Summarise all meetings this week")
                suggestionChip("Draft a follow-up email to the Emirates team")
            }
            .padding(.top, 8)

            Spacer(minLength: 80)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
    }

    private func suggestionChip(_ text: String) -> some View {
        Button {
            inputText = text
            isInputFocused = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "sparkle")
                    .font(.system(size: 10))
                    .foregroundColor(Theme.olive)

                Text(text)
                    .font(Theme.captionFont(12))
                    .foregroundColor(Theme.textSecondary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Theme.cardBackground)
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Theme.divider.opacity(0.6), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Typing Indicator

    private var typingIndicator: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(Theme.textTertiary)
                    .frame(width: 6, height: 6)
                    .opacity(0.6)
                    .animation(
                        .easeInOut(duration: 0.5)
                        .repeatForever()
                        .delay(Double(index) * 0.15),
                        value: chatService.isLoading
                    )
                    .scaleEffect(chatService.isLoading ? 1.0 : 0.5)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 56)   // 20 (horizontal) + 26 (avatar) + 10 (spacing)
        .padding(.trailing, 20)
        .padding(.vertical, 8)
    }
}

// MARK: - Message Row

private struct MessageRow: View {
    let message: V2ChatService.V2Message
    let showHeader: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Avatar — only shown for the first message in a consecutive group
            if showHeader {
                avatar
            } else {
                Color.clear
                    .frame(width: 26, height: 1)
            }

            // Content
            VStack(alignment: .leading, spacing: 4) {
                if showHeader {
                    Text(roleLabel)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(roleLabelColor)
                }

                if message.style == .status {
                    // Status messages are lighter and italic — "Let me check…"
                    Text(message.content)
                        .font(Theme.bodyFont(13))
                        .foregroundColor(Theme.textTertiary)
                        .italic()
                } else {
                    StreamingMarkdownView(
                        text: message.content,
                        isStreaming: false
                    )
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, showHeader ? 8 : 3)
    }

    private var roleLabel: String {
        switch message.role {
        case "user": return "You"
        case "assistant": return "Nest"
        case "system": return "Notification"
        default: return message.role.capitalized
        }
    }

    private var roleLabelColor: Color {
        switch message.role {
        case "user": return Theme.textTertiary
        case "assistant": return Theme.olive
        case "system": return Theme.textTertiary
        default: return Theme.textTertiary
        }
    }

    @ViewBuilder
    private var avatar: some View {
        switch message.role {
        case "user":
            ZStack {
                Circle()
                    .fill(Theme.sidebarSelection)
                    .frame(width: 26, height: 26)
                Image(systemName: "person.fill")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textTertiary)
            }

        case "assistant":
            ZStack {
                Circle()
                    .fill(Theme.olive.opacity(0.12))
                    .frame(width: 26, height: 26)
                Image(systemName: "bird.fill")
                    .font(.system(size: 11))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundColor(Theme.olive)
            }

        case "system":
            ZStack {
                Circle()
                    .fill(Theme.divider)
                    .frame(width: 26, height: 26)
                Image(systemName: "bell.fill")
                    .font(.system(size: 10))
                    .foregroundColor(Theme.textTertiary)
            }

        default:
            EmptyView()
        }
    }
}
