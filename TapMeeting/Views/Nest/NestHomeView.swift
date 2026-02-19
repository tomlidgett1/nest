import SwiftUI

/// The Nest Home tab — an intelligent, time-aware, relationship-aware surface
/// that connects calendar, email, notes, and todos into a single view.
/// AI-powered: morning briefings, email triage, meeting prep, action context.
struct NestHomeView: View {
    
    @Binding var isSidebarCollapsed: Bool
    let onSelectNote: (UUID) -> Void
    let onNewNote: () -> Void
    let onNavigateToTodos: () -> Void
    let onNavigateToEmail: () -> Void
    /// Navigate to the Email tab with a specific thread pre-selected.
    let onSelectEmailThread: ((String) -> Void)?
    
    @Environment(AppState.self) private var appState
    
    /// References to app-level services (survive tab switches).
    private var nestService: NestHomeService? { appState.nestHomeService }
    private var aiService: NestAIService { appState.nestAIService }
    
    /// 60-second auto-refresh timer — fetches fresh email + calendar data each cycle.
    private let refreshTimer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()
    
    var body: some View {
        let _ = appState.noteRepository.dataRevision // observe sync changes
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Adaptive Greeting
                    if let service = nestService {
                        AdaptiveGreetingView(greeting: service.greeting)
                            .padding(.top, Theme.Spacing.mainContentTopPadding)
                        
                        // Momentum Meter
                        MomentumMeterView(momentum: service.momentum)
                        
                        // Morning Briefing (AI-powered)
                        if !aiService.morningBriefing.isEmpty || aiService.isBriefingStreaming {
                            MorningBriefingCard(
                                text: aiService.morningBriefing,
                                isStreaming: aiService.isBriefingStreaming,
                                onDismiss: {
                                    withAnimation(.easeOut(duration: 0.2)) {
                                        aiService.dismissBriefing()
                                    }
                                }
                            )
                        }
                        
                        // Compact action bar — Record + Summarise
                        nestActionBar
                            .zIndex(10)
                        
                        // AI Summary card (streams in when requested)
                        if !aiService.activeSummary.isEmpty || aiService.isSummaryStreaming {
                            summaryCard
                        }
                        
                        // Meeting Dossiers (with AI Brief)
                        if !service.meetingDossiers.isEmpty {
                            ForEach(service.meetingDossiers) { dossier in
                                MeetingDossierCard(
                                    dossier: dossier,
                                    aiBrief: aiService.meetingBriefs[dossier.id],
                                    isAIBriefStreaming: aiService.streamingMeetingBriefId == dossier.id,
                                    onStartRecording: { title, eventId, attendees in
                                        appState.startMeeting(title: title, calendarEventId: eventId, attendees: attendees)
                                    },
                                    onJoinMeeting: { url in
                                        NSWorkspace.shared.open(url)
                                    },
                                    onRequestAIBrief: {
                                        Task { await requestMeetingBrief(dossier: dossier) }
                                    }
                                )
                            }
                        }
                        
                        // Action Stream (with AI context)
                        if !service.actionStream.isEmpty {
                            ActionStreamView(
                                items: service.actionStream,
                                aiContexts: aiService.actionContexts,
                                onComplete: { todo in
                                    service.completeTodo(todo)
                                    refreshData()
                                },
                                onNavigateToNote: { sourceId in
                                    if let uuid = UUID(uuidString: sourceId) {
                                        onSelectNote(uuid)
                                    }
                                }
                            )
                        }
                        
                        // Email Radar (AI-triaged)
                        if !service.emailRadar.isEmpty {
                            EmailRadarView(
                                emails: service.emailRadar,
                                aiTriageScores: aiService.emailTriageScores,
                                isTriaging: aiService.isTriaging,
                                onSelectThread: { threadId in
                                    onSelectEmailThread?(threadId)
                                }
                            )
                        }
                        
                        // Unfinished Business
                        if !service.unfinishedBusiness.isEmpty {
                            UnfinishedBusinessView(
                                items: service.unfinishedBusiness,
                                onNavigateToNote: { id in
                                    onSelectNote(id)
                                },
                                onCompleteTodo: { todoId in
                                    service.completeTodoById(todoId)
                                    refreshData()
                                }
                            )
                        }
                        
                        // Insight Cards
                        if !service.insightCards.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                ForEach(service.insightCards) { card in
                                    InsightCardView(
                                        card: card,
                                        onAction: {
                                            handleInsightAction(card)
                                        },
                                        onDismiss: {
                                            withAnimation(.easeOut(duration: 0.2)) {
                                                service.dismissInsight(card.id)
                                            }
                                        }
                                    )
                                }
                            }
                        }
                        
                        // Empty state for new users
                        if service.greeting.main.isEmpty && service.actionStream.isEmpty && service.emailRadar.isEmpty && service.meetingDossiers.isEmpty {
                            emptyState
                        }
                    } else {
                        // Loading
                        Text("Nest")
                            .font(Theme.titleFont(28))
                            .foregroundColor(Theme.textPrimary)
                            .padding(.top, Theme.Spacing.mainContentTopPadding)
                    }
                    
                    Spacer(minLength: 60)
                }
                .padding(.horizontal, Theme.Spacing.contentPadding)
            }
            .scrollIndicators(.never)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
        .onTapGesture {
            if isSummaryMenuOpen {
                withAnimation(.easeInOut(duration: 0.15)) { isSummaryMenuOpen = false }
            }
        }
        .onAppear {
            initialiseService()
            // If we already have data, show it instantly — refresh in background only.
            if nestService?.hasInitialData == true {
                backgroundRefresh()
            } else {
                refreshData()
            }
            triggerAIFeatures()
        }
        .onReceive(refreshTimer) { _ in
            backgroundRefresh()
        }
    }
    
    // MARK: - AI Orchestration
    
    /// Fire all AI features once per session. The flag lives on the AI service
    /// so it survives tab switches.
    private func triggerAIFeatures() {
        guard !aiService.hasTriggeredInitialAI else { return }
        aiService.markInitialAITriggered()
        
        let cal = Calendar.current
        let gmail = appState.gmailService
        let todoRepo = appState.todoRepository
        let noteRepo = appState.noteRepository
        let calService = appState.calendarService
        
        Task {
            // 1. Morning Briefing
            let todayEvents = calService.upcomingEvents.filter { cal.isDateInToday($0.startDate) || cal.isDateInToday($0.endDate) }
            let pendingTodos = todoRepo.fetchPendingTodos()
            let completedToday = todoRepo.fetchCompletedTodos().filter {
                guard let at = $0.completedAt else { return false }
                return cal.isDateInToday(at)
            }
            let unreadEmails = gmail.inboxThreads.filter(\.isUnread).compactMap { thread -> (sender: String, subject: String)? in
                guard let m = thread.latestMessage else { return nil }
                return (sender: m.from, subject: m.subject)
            }
            let yesterdayNotes = noteRepo.fetchAllNotes().filter {
                $0.noteType == .meeting && cal.isDateInYesterday($0.createdAt)
            }
            let yesterdayMeetings = yesterdayNotes.map { note -> (title: String, attendees: [String], actionItems: Int, completed: Int) in
                let todos = todoRepo.fetchTodos(forSourceId: note.id.uuidString)
                return (title: note.title, attendees: note.attendees, actionItems: todos.count, completed: todos.filter(\.isCompleted).count)
            }
            
            await aiService.generateMorningBriefing(
                todayEvents: todayEvents,
                pendingTodos: pendingTodos,
                completedTodosToday: completedToday,
                unreadEmails: unreadEmails,
                yesterdayMeetings: yesterdayMeetings
            )
            
            // 2. Email Triage
            let unreadThreads = gmail.inboxThreads.filter(\.isUnread)
            let userEmails = Set(gmail.accounts.map(\.email).map { $0.lowercased() })
            let attendeeEmails = Set(todayEvents.flatMap(\.attendeeEmails).map { $0.lowercased() })
            
            if !unreadThreads.isEmpty {
                await aiService.triageEmails(
                    threads: unreadThreads,
                    userEmails: userEmails,
                    todayAttendeeEmails: attendeeEmails
                )
                // Re-score email radar with AI triage results
                nestService?.applyAITriageScores(aiService.emailTriageScores)
            }
            
            // 3. Action Item Contexts
            let topTodos = (nestService?.actionStream ?? []).map(\.todo)
            let recentNotes = noteRepo.fetchAllNotes()
            if !topTodos.isEmpty {
                await aiService.generateActionContexts(
                    topTodos: topTodos,
                    todayEvents: todayEvents,
                    recentNotes: recentNotes
                )
            }
        }
    }
    
    /// Request an AI brief for a specific meeting dossier.
    private func requestMeetingBrief(dossier: MeetingDossier) async {
        let noteRepo = appState.noteRepository
        let allNotes = noteRepo.fetchAllNotes()
        
        // Gather prior meeting notes content
        let priorNotes = allNotes.filter { note in
            note.noteType == .meeting &&
            !Set(note.attendees).intersection(Set(dossier.attendeeNames)).isEmpty
        }.sorted { $0.createdAt > $1.createdAt }.prefix(3)
        
        let noteContents = priorNotes.map { note in
            let content = note.enhancedNotes ?? note.rawNotes
            return String(content.prefix(1000))
        }
        
        await aiService.generateMeetingBrief(
            eventId: dossier.id,
            title: dossier.title,
            attendeeNames: dossier.attendeeNames,
            priorMeetingNotes: noteContents,
            emailSubjects: dossier.emailSubjects.map { (sender: $0.sender, subject: $0.subject) },
            openItems: dossier.openItems
        )
    }
    
    // MARK: - Action Bar
    
    @State private var isSummaryMenuOpen = false
    
    private var nestActionBar: some View {
        HStack(spacing: 10) {
            // Record Meeting — compact pill
            Button(action: onNewNote) {
                HStack(spacing: 5) {
                    Image(systemName: "waveform")
                        .font(.system(size: 11))
                    Text("Record Meeting")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(Theme.olive)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Theme.olive.opacity(0.1))
                .cornerRadius(6)
            }
            .buttonStyle(.plain)
            
            // Summarise — dropdown trigger
            Button {
                withAnimation(.easeInOut(duration: 0.15)) {
                    isSummaryMenuOpen.toggle()
                }
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 11))
                    Text("Summarise")
                        .font(.system(size: 12, weight: .medium))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 8, weight: .semibold))
                        .rotationEffect(.degrees(isSummaryMenuOpen ? 180 : 0))
                        .animation(.easeInOut(duration: 0.2), value: isSummaryMenuOpen)
                }
                .foregroundColor(Theme.textSecondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Theme.cardBackground)
                .cornerRadius(6)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Theme.divider.opacity(0.6), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            
            Spacer()
        }
        .overlay(alignment: .topLeading) {
            if isSummaryMenuOpen {
                summaryDropdown
                    .offset(x: 112, y: 34)
            }
        }
    }
    
    private var summaryDropdown: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(NestAIService.SummaryType.allCases, id: \.rawValue) { type in
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        isSummaryMenuOpen = false
                    }
                    requestSummary(type)
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: type.icon)
                            .font(.system(size: 11))
                            .foregroundColor(aiService.activeSummaryType == type ? Theme.olive : Theme.textTertiary)
                            .frame(width: 16)
                        
                        Text(type.label)
                            .font(.system(size: 13, weight: aiService.activeSummaryType == type ? .semibold : .regular))
                            .foregroundColor(Theme.textPrimary)
                        
                        Spacer()
                        
                        if aiService.activeSummaryType == type && aiService.isSummaryStreaming {
                            ProgressView()
                                .controlSize(.mini)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(width: 220)
        .background(Theme.cardBackground)
        .cornerRadius(8)
        .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Theme.divider.opacity(0.5), lineWidth: 1)
        )
        .transition(.opacity.combined(with: .scale(scale: 0.95, anchor: .topLeading)))
    }
    
    // MARK: - Summary Card
    
    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                if let type = aiService.activeSummaryType {
                    Image(systemName: type.icon)
                        .font(.system(size: 11))
                        .foregroundColor(Theme.olive)
                    Text(type.label)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Theme.textTertiary)
                        .tracking(0.3)
                }
                
                Spacer()
                
                if aiService.isSummaryStreaming {
                    ProgressView()
                        .controlSize(.mini)
                } else {
                    Button {
                        withAnimation(.easeOut(duration: 0.2)) {
                            aiService.dismissSummary()
                        }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(Theme.textQuaternary)
                            .frame(width: 20, height: 20)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            
            StreamingMarkdownView(
                text: aiService.activeSummary,
                isStreaming: aiService.isSummaryStreaming
            )
        }
        .padding(16)
        .background(Theme.cardBackground)
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.03), radius: 3, y: 1)
    }
    
    private func requestSummary(_ type: NestAIService.SummaryType) {
        let cal = Calendar.current
        let calService = appState.calendarService
        let gmail = appState.gmailService
        let todoRepo = appState.todoRepository
        let noteRepo = appState.noteRepository
        
        let allEvents = calService.upcomingEvents
        let todayEvents = allEvents.filter { cal.isDateInToday($0.startDate) || cal.isDateInToday($0.endDate) }
        let tomorrowEvents = allEvents.filter { cal.isDateInTomorrow($0.startDate) || cal.isDateInTomorrow($0.endDate) }
        let pendingTodos = todoRepo.fetchPendingTodos()
        let completedToday = todoRepo.fetchCompletedTodos().filter {
            guard let at = $0.completedAt else { return false }
            return cal.isDateInToday(at)
        }
        let recentNotes = noteRepo.fetchAllNotes()
        let userEmails = Set(gmail.accounts.map(\.email).map { $0.lowercased() })
        
        Task {
            await aiService.generateSummary(
                type: type,
                todayEvents: todayEvents,
                tomorrowEvents: tomorrowEvents,
                pendingTodos: pendingTodos,
                completedTodosToday: completedToday,
                recentNotes: recentNotes,
                inboxThreads: gmail.inboxThreads,
                userEmails: userEmails
            )
        }
    }
    
    // MARK: - Empty State
    
    private var emptyState: some View {
        VStack(spacing: 16) {
            if !appState.googleCalendarService.isConnected {
                emptyStateCard(icon: "calendar", title: "Connect Google Calendar", subtitle: "See your day at a glance with meeting preparation and follow-ups.")
            }
            if !appState.gmailService.isConnected {
                emptyStateCard(icon: "envelope", title: "Connect Gmail", subtitle: "Surface actionable emails and cross-reference with your meetings.")
            }
            emptyStateCard(icon: "waveform", title: "Record your first meeting", subtitle: "Nest gets smarter with every meeting you transcribe.")
        }
    }
    
    private func emptyStateCard(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Theme.olive.opacity(0.08))
                    .frame(width: 36, height: 36)
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundColor(Theme.olive)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                Text(subtitle)
                    .font(Theme.captionFont(12))
                    .foregroundColor(Theme.textTertiary)
            }
            Spacer()
        }
        .padding(16)
        .background(Theme.cardBackground)
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.03), radius: 3, y: 1)
    }
    
    // MARK: - Helpers
    
    private func initialiseService() {
        _ = appState.ensureNestHomeService()
    }
    
    /// Full refresh — fetches network data, then recomputes. Used on first load.
    private func refreshData() {
        Task {
            await fetchNetworkData()
            nestService?.refresh(
                isMeetingActive: appState.isMeetingActive,
                currentMeetingTitle: appState.currentMeeting?.note.title
            )
        }
    }
    
    /// Silent background refresh — recomputes from already-loaded data immediately,
    /// then fetches fresh network data and recomputes again if anything changed.
    /// This keeps the UI snappy when switching tabs.
    private func backgroundRefresh() {
        // Immediately recompute from existing in-memory data (instant, no network).
        nestService?.refresh(
            isMeetingActive: appState.isMeetingActive,
            currentMeetingTitle: appState.currentMeeting?.note.title
        )
        
        // Then fetch fresh data in the background and recompute again.
        Task {
            await fetchNetworkData()
            nestService?.refresh(
                isMeetingActive: appState.isMeetingActive,
                currentMeetingTitle: appState.currentMeeting?.note.title
            )
        }
    }
    
    /// Fetch calendar + email data from network sources.
    private func fetchNetworkData() async {
        let gmail = appState.gmailService
        
        if appState.googleCalendarService.isConnected {
            await appState.googleCalendarService.fetchEvents()
        } else {
            appState.calendarService.fetchUpcomingEvents()
        }
        
        if gmail.isConnected {
            await gmail.fetchMailbox(.inbox)
            if gmail.sentThreads.isEmpty {
                await gmail.fetchMailbox(.sent)
            }
        }
    }
    
    private func handleInsightAction(_ card: InsightCard) {
        switch card.actionType {
        case .navigateEmail: onNavigateToEmail()
        case .navigateNote: break
        case .navigateTodos: onNavigateToTodos()
        }
    }
}
