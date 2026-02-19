import SwiftUI

/// AI-powered email intelligence hub — shows when no thread is selected.
/// Designed to feel like reading a clean brief, not a dashboard.
struct EmailIntelligenceHubView: View {

    @Environment(AppState.self) private var appState

    let onSelectThread: ((String) -> Void)?

    private var gmail: GmailService { appState.gmailService }
    private var digestService: EmailDigestService { appState.emailDigestService }

    private var filteredThreads: [GmailThread] {
        gmail.threadsForMailbox(.inbox)
    }

    private var activeUserEmails: Set<String> {
        if let filterId = gmail.filterAccountId,
           let account = gmail.accounts.first(where: { $0.id == filterId }) {
            return [account.email.lowercased()]
        }
        return Set(gmail.accounts.map(\.email).map { $0.lowercased() })
    }

    @State private var selectedTab: EmailDigestService.DigestType = .catchUp
    @State private var hasTriggeredInitialDigest = false
    @State private var isHoveringRefresh = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {

            // Tab row — sits at the top, clean and tight
            tabRow
                .padding(.horizontal, 20)
                .padding(.top, 14)
                .padding(.bottom, 12)

            Rectangle()
                .fill(Theme.divider.opacity(0.4))
                .frame(height: 0.5)
                .padding(.horizontal, 16)

            // Content — this is the product
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    contentArea
                        .padding(.horizontal, 24)
                        .padding(.top, 20)
                        .padding(.bottom, 40)
                }
            }
            .scrollIndicators(.never)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            if !hasTriggeredInitialDigest {
                hasTriggeredInitialDigest = true
                triggerDigest(type: selectedTab)
            }
        }
        .onChange(of: gmail.filterAccountId) { _, _ in
            digestService.invalidateAllCaches()
            triggerDigest(type: selectedTab)
        }
    }

    // MARK: - Tab Row

    private var tabRow: some View {
        HStack(spacing: 0) {
            HStack(spacing: 2) {
                ForEach(EmailDigestService.DigestType.allCases) { type in
                    tabButton(type)
                }
            }
            .padding(2)
            .background(Theme.sidebarBackground.opacity(0.7))
            .cornerRadius(7)

            Spacer()

            // Refresh — only visible when content is loaded
            if !digestService.content(for: selectedTab).isEmpty && !digestService.isStreaming(for: selectedTab) {
                Button {
                    refreshDigest(type: selectedTab)
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(isHoveringRefresh ? Theme.textSecondary : Theme.textQuaternary)
                        .frame(width: 26, height: 26)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .onHover { isHoveringRefresh = $0 }
                .help("Regenerate")
            }
        }
    }

    private func tabButton(_ type: EmailDigestService.DigestType) -> some View {
        let isActive = selectedTab == type
        let isStreaming = digestService.isStreaming(for: type)

        return Button {
            guard selectedTab != type else { return }
            withAnimation(.easeInOut(duration: 0.15)) {
                selectedTab = type
            }
            triggerDigest(type: type)
        } label: {
            HStack(spacing: 4) {
                if isStreaming && isActive {
                    ProgressView()
                        .controlSize(.mini)
                } else {
                    Image(systemName: type.icon)
                        .font(.system(size: 9, weight: .medium))
                }
                Text(type.label)
                    .font(.system(size: 11, weight: isActive ? .semibold : .medium))
                    .lineLimit(1)
            }
            .foregroundColor(isActive ? Theme.textPrimary : Theme.textTertiary)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(isActive ? Color.white : Color.clear)
            .cornerRadius(5)
            .shadow(color: isActive ? .black.opacity(0.04) : .clear, radius: 1.5, y: 0.5)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Content Area

    @ViewBuilder
    private var contentArea: some View {
        let content = digestService.content(for: selectedTab)
        let streaming = digestService.isStreaming(for: selectedTab)

        if streaming && content.isEmpty {
            loadingState
        } else if content.isEmpty {
            emptyState
        } else {
            StreamingMarkdownView(
                text: content,
                isStreaming: streaming
            )
        }
    }

    // MARK: - Loading State

    @State private var loadingPhase = 0

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 8) {
                ProgressView()
                    .controlSize(.small)
                Text(loadingPhaseLabel)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Theme.textSecondary)
                    .animation(.easeInOut(duration: 0.3), value: loadingPhase)
            }
            .padding(.top, 4)

            VStack(alignment: .leading, spacing: 12) {
                ForEach(0..<5, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Theme.divider.opacity(0.2))
                        .frame(height: i == 0 ? 14 : 10)
                        .frame(maxWidth: placeholderWidth(for: i))
                }
            }
            .opacity(0.6)
        }
        .onAppear { startLoadingPhases() }
    }

    private var loadingPhaseLabel: String {
        switch loadingPhase {
        case 0: return "Reading your inbox..."
        case 1: return "Cross-referencing meetings and notes..."
        case 2: return "Finding relevant context per sender..."
        case 3: return "Building your brief..."
        default: return "Almost there..."
        }
    }

    private func startLoadingPhases() {
        loadingPhase = 0
        Task {
            try? await Task.sleep(for: .seconds(1.2))
            await MainActor.run { loadingPhase = 1 }
            try? await Task.sleep(for: .seconds(1.8))
            await MainActor.run { loadingPhase = 2 }
            try? await Task.sleep(for: .seconds(2.0))
            await MainActor.run { loadingPhase = 3 }
        }
    }

    private func placeholderWidth(for index: Int) -> CGFloat {
        switch index {
        case 0: return 180
        case 1: return .infinity
        case 2: return 300
        case 3: return .infinity
        default: return 200
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 14) {
            Spacer()
                .frame(height: 60)

            Text(selectedTab.label)
                .font(Theme.headingFont(15))
                .foregroundColor(Theme.textPrimary)

            Text(selectedTab.description)
                .font(Theme.captionFont(13))
                .foregroundColor(Theme.textTertiary)
                .multilineTextAlignment(.center)

            Button {
                triggerDigest(type: selectedTab)
            } label: {
                Text("Generate")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 7)
                    .background(Theme.olive)
                    .cornerRadius(6)
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Actions

    private func triggerDigest(type: EmailDigestService.DigestType) {
        let threads = filteredThreads
        let userEmails = activeUserEmails
        let calService = appState.calendarService
        let todoRepo = appState.todoRepository
        let cal = Calendar.current

        let todayEvents = calService.upcomingEvents.filter {
            cal.isDateInToday($0.startDate) || cal.isDateInToday($0.endDate)
        }
        let pendingTodos = todoRepo.fetchPendingTodos()

        Task {
            await digestService.generate(
                type: type,
                threads: threads,
                userEmails: userEmails,
                todayEvents: todayEvents,
                pendingTodos: pendingTodos
            )
        }
    }

    private func refreshDigest(type: EmailDigestService.DigestType) {
        let threads = filteredThreads
        let userEmails = activeUserEmails
        let calService = appState.calendarService
        let todoRepo = appState.todoRepository
        let cal = Calendar.current

        let todayEvents = calService.upcomingEvents.filter {
            cal.isDateInToday($0.startDate) || cal.isDateInToday($0.endDate)
        }
        let pendingTodos = todoRepo.fetchPendingTodos()

        Task {
            await digestService.refresh(
                type: type,
                threads: threads,
                userEmails: userEmails,
                todayEvents: todayEvents,
                pendingTodos: pendingTodos
            )
        }
    }
}
