import SwiftUI
import Foundation

/// Orchestrates all data aggregation for the Nest Home tab.
/// Computes greeting, momentum, action stream, email radar, meeting dossiers,
/// unfinished business, and insight cards from existing services.
@Observable
final class NestHomeService {
    
    // MARK: - Dependencies
    
    private let calendarService: CalendarService
    private let googleCalendarService: GoogleCalendarService
    private let gmailService: GmailService
    private let todoRepository: TodoRepository
    private let noteRepository: NoteRepository
    
    // MARK: - Published State
    
    private(set) var greeting: GreetingModel = .empty
    private(set) var momentum: MomentumModel = .empty
    private(set) var actionStream: [RankedTodo] = []
    private(set) var emailRadar: [ActionableEmail] = []
    private(set) var meetingDossiers: [MeetingDossier] = []
    private(set) var unfinishedBusiness: [UnfinishedBusinessItem] = []
    private(set) var insightCards: [InsightCard] = []
    private(set) var isLoading = false
    /// True after the first successful refresh — subsequent refreshes are silent/incremental.
    private(set) var hasInitialData = false
    
    // MARK: - Cache
    
    private var lastRefresh: Date?
    private var insightCacheDate: Date?
    private var dismissedInsightIds: Set<String> {
        get {
            Set(UserDefaults.standard.stringArray(forKey: "nest_dismissedInsightIds") ?? [])
        }
        set {
            UserDefaults.standard.set(Array(newValue), forKey: "nest_dismissedInsightIds")
        }
    }
    
    // MARK: - Init
    
    init(
        calendarService: CalendarService,
        googleCalendarService: GoogleCalendarService,
        gmailService: GmailService,
        todoRepository: TodoRepository,
        noteRepository: NoteRepository
    ) {
        self.calendarService = calendarService
        self.googleCalendarService = googleCalendarService
        self.gmailService = gmailService
        self.todoRepository = todoRepository
        self.noteRepository = noteRepository
    }
    
    // MARK: - Refresh
    
    @MainActor
    func refresh(isMeetingActive: Bool = false, currentMeetingTitle: String? = nil) {
        // Only show loading spinner on the very first load — subsequent
        // refreshes are silent and incremental (cached data stays visible).
        if !hasInitialData {
            isLoading = true
        }
        defer {
            isLoading = false
            hasInitialData = true
        }
        
        let now = Date.now
        let cal = Calendar.current
        
        // Fetch raw data
        let allEvents = calendarService.upcomingEvents
        let todayEvents = allEvents.filter { cal.isDateInToday($0.startDate) || cal.isDateInToday($0.endDate) }
        let pendingTodos = todoRepository.fetchPendingTodos()
        let completedTodos = todoRepository.fetchCompletedTodos().filter {
            guard let completedAt = $0.completedAt else { return false }
            return cal.isDateInToday(completedAt)
        }
        let allNotes = noteRepository.fetchAllNotes()
        let allInboxThreads = gmailService.inboxThreads
        let unreadThreads = allInboxThreads.filter(\.isUnread)
        
        print("[NestHome] refresh — accounts: \(gmailService.accounts.count), inboxThreads: \(allInboxThreads.count), unread: \(unreadThreads.count)")
        
        // 1. Greeting
        greeting = computeGreeting(
            now: now,
            todayEvents: todayEvents,
            allEvents: allEvents,
            pendingTodos: pendingTodos,
            completedTodos: completedTodos,
            unreadCount: unreadThreads.count,
            isMeetingActive: isMeetingActive,
            currentMeetingTitle: currentMeetingTitle
        )
        
        // 2. Momentum
        momentum = computeMomentum(
            todayEvents: todayEvents,
            pendingTodos: pendingTodos,
            completedTodos: completedTodos,
            allNotes: allNotes,
            now: now
        )
        
        // 3. Action Stream (ranked todos)
        actionStream = computeActionStream(
            pendingTodos: pendingTodos,
            todayEvents: todayEvents,
            allNotes: allNotes
        )
        
        // 4. Email Radar — uses ALL inbox threads (not just unread)
        emailRadar = computeEmailRadar(
            allInboxThreads: allInboxThreads,
            todayEvents: todayEvents,
            pendingTodos: pendingTodos,
            allNotes: allNotes,
            sentThreads: gmailService.sentThreads,
            userEmails: Set(gmailService.accounts.map(\.email).map { $0.lowercased() })
        )
        
        // 5. Meeting Dossiers
        meetingDossiers = computeMeetingDossiers(
            todayEvents: todayEvents,
            allNotes: allNotes,
            pendingTodos: pendingTodos,
            now: now
        )
        
        // 6. Unfinished Business
        unfinishedBusiness = computeUnfinishedBusiness(
            allNotes: allNotes,
            now: now
        )
        
        // 7. Insight Cards (cached 30 min)
        if insightCacheDate == nil || now.timeIntervalSince(insightCacheDate!) > 1800 {
            insightCards = computeInsightCards(
                todayEvents: todayEvents,
                pendingTodos: pendingTodos,
                allNotes: allNotes,
                unreadThreads: unreadThreads
            )
            insightCacheDate = now
        }
        
        lastRefresh = now
    }
    
    // MARK: - Actions
    
    func dismissInsight(_ id: String) {
        dismissedInsightIds.insert(id)
        insightCards.removeAll { $0.id == id }
    }
    
    @MainActor
    func completeTodo(_ todo: TodoItem) {
        todoRepository.toggleComplete(todo)
    }
    
    @MainActor
    func completeTodoById(_ id: UUID) {
        if let todo = todoRepository.fetchTodoById(id) {
            todoRepository.toggleComplete(todo)
        }
    }
    
    /// Blend AI triage scores into the existing email radar ranking.
    /// Re-sorts the list so AI-scored emails rise or fall appropriately.
    @MainActor
    func applyAITriageScores(_ scores: [String: EmailTriageResult]) {
        guard !scores.isEmpty else { return }
        
        emailRadar = emailRadar.map { email in
            guard let ai = scores[email.threadId] else { return email }
            // Blend: keep original heuristic score but add AI weight (normalised 0-50)
            let aiBoost = ai.score / 2  // 0-50 range
            let newScore = email.score + aiBoost
            let newWhyTag = ai.score >= 70 ? (ai.reason.isEmpty ? email.whyTag : ai.reason) : email.whyTag
            return ActionableEmail(
                threadId: email.threadId,
                senderName: email.senderName,
                senderEmail: email.senderEmail,
                senderInitials: email.senderInitials,
                subject: email.subject,
                snippet: email.snippet,
                date: email.date,
                meetingLink: email.meetingLink,
                hasTodos: email.hasTodos,
                score: newScore,
                whyTag: newWhyTag,
                hasQuestion: email.hasQuestion,
                hasDeadline: email.hasDeadline,
                isOneToOne: email.isOneToOne,
                isReplyBack: email.isReplyBack
            )
        }.sorted { $0.score > $1.score }
    }
    
    // MARK: - Greeting
    
    private func computeGreeting(
        now: Date,
        todayEvents: [CalendarEvent],
        allEvents: [CalendarEvent],
        pendingTodos: [TodoItem],
        completedTodos: [TodoItem],
        unreadCount: Int,
        isMeetingActive: Bool,
        currentMeetingTitle: String?
    ) -> GreetingModel {
        let cal = Calendar.current
        let hour = cal.component(.hour, from: now)
        let isWeekend = cal.isDateInWeekend(now)
        
        let remainingMeetings = todayEvents.filter { $0.startDate > now && !$0.isAllDay }
        let firstMeeting = todayEvents.filter({ !$0.isAllDay }).min(by: { $0.startDate < $1.startDate })
        let totalMeetings = todayEvents.filter { !$0.isAllDay }.count
        let pendingCount = pendingTodos.count
        
        // Check special states
        if isMeetingActive, let title = currentMeetingTitle {
            let duration = now.timeIntervalSince(now.addingTimeInterval(-300))
            return GreetingModel(
                main: "Currently recording: \(title).",
                sub: subGreeting(pendingTodos: pendingTodos, todayEvents: todayEvents, unreadCount: unreadCount, now: now)
            )
        }
        
        // Check last open for absence detection
        let lastOpen = UserDefaults.standard.object(forKey: "nest_lastHomeOpenTimestamp") as? Date
        if let lastOpen, now.timeIntervalSince(lastOpen) > 4 * 3600 {
            let newEmails = unreadCount
            UserDefaults.standard.set(now, forKey: "nest_lastHomeOpenTimestamp")
            return GreetingModel(
                main: "Welcome back. \(newEmails) new email\(newEmails == 1 ? "" : "s"), \(remainingMeetings.count) meeting\(remainingMeetings.count == 1 ? "" : "s") ahead.",
                sub: subGreeting(pendingTodos: pendingTodos, todayEvents: todayEvents, unreadCount: unreadCount, now: now)
            )
        }
        
        UserDefaults.standard.set(now, forKey: "nest_lastHomeOpenTimestamp")
        
        // Zero meetings
        if totalMeetings == 0 && !isWeekend {
            return GreetingModel(
                main: "Meeting-free day. \(pendingCount) to-do\(pendingCount == 1 ? "" : "s") waiting.",
                sub: subGreeting(pendingTodos: pendingTodos, todayEvents: todayEvents, unreadCount: unreadCount, now: now)
            )
        }
        
        // All done
        if pendingTodos.isEmpty && remainingMeetings.isEmpty {
            return GreetingModel(
                main: "Clear desk. Everything handled.",
                sub: "All clear."
            )
        }
        
        // Weekend
        if isWeekend {
            let context = totalMeetings == 0 ? "Nothing on the books." : "\(totalMeetings) meeting\(totalMeetings == 1 ? "" : "s") today."
            return GreetingModel(
                main: "Weekend mode. \(context)",
                sub: subGreeting(pendingTodos: pendingTodos, todayEvents: todayEvents, unreadCount: unreadCount, now: now)
            )
        }
        
        // Time-based
        let main: String
        let remaining = remainingMeetings.count
        
        switch hour {
        case 6..<11:
            if let first = firstMeeting {
                let timeStr = first.startDate.formatted(date: .omitted, time: .shortened)
                main = "Good morning. \(totalMeetings) meeting\(totalMeetings == 1 ? "" : "s") today, first at \(timeStr)."
            } else {
                main = "Good morning. \(pendingCount) to-do\(pendingCount == 1 ? "" : "s") pending."
            }
        case 11..<14:
            if remaining > 0 {
                main = "Afternoon ahead. \(remaining) meeting\(remaining == 1 ? "" : "s") remaining, \(pendingCount) to-do\(pendingCount == 1 ? "" : "s") pending."
            } else if pendingCount > 0 {
                main = "Afternoon ahead. No more meetings — \(pendingCount) to-do\(pendingCount == 1 ? "" : "s") to focus on."
            } else {
                main = "Afternoon ahead. Meetings done, to-dos clear."
            }
        case 14..<18:
            if remaining > 0 {
                main = "Almost there. \(remaining) meeting\(remaining == 1 ? "" : "s") left, then you're clear."
            } else if pendingCount > 0 {
                main = "Home stretch. Meetings done — \(pendingCount) to-do\(pendingCount == 1 ? "" : "s") remaining."
            } else {
                main = "Home stretch. Clear desk ahead."
            }
        default:
            let handledCount = completedTodos.count
            if handledCount > 0 {
                main = "Wrapping up. You handled \(handledCount) item\(handledCount == 1 ? "" : "s") today."
            } else {
                main = "Evening. Winding down for the day."
            }
        }
        
        return GreetingModel(
            main: main,
            sub: subGreeting(pendingTodos: pendingTodos, todayEvents: todayEvents, unreadCount: unreadCount, now: now)
        )
    }
    
    private func subGreeting(pendingTodos: [TodoItem], todayEvents: [CalendarEvent], unreadCount: Int, now: Date) -> String {
        // 1. Overdue todo
        if let overdue = pendingTodos.first(where: { $0.isOverdue }) {
            let days = Calendar.current.dateComponents([.day], from: overdue.dueDate ?? now, to: now).day ?? 0
            return "Overdue: \(overdue.title) (\(days) day\(days == 1 ? "" : "s") late)"
        }
        
        // 2. Imminent meeting (< 30 min)
        let upcoming = todayEvents.filter { !$0.isAllDay && $0.startDate > now }
        if let next = upcoming.first, next.startDate.timeIntervalSince(now) < 1800 {
            let minutes = Int(next.startDate.timeIntervalSince(now) / 60)
            return "Next: \(next.title) in \(minutes) minute\(minutes == 1 ? "" : "s")"
        }
        
        // 3. Next meeting today
        if let next = upcoming.first {
            let timeStr = next.startDate.formatted(date: .omitted, time: .shortened)
            return "Next: \(next.title) at \(timeStr)"
        }
        
        // 4. Unread email count
        if unreadCount > 0 {
            return "\(unreadCount) unread email\(unreadCount == 1 ? "" : "s")"
        }
        
        return "All clear."
    }
    
    // MARK: - Momentum
    
    private func computeMomentum(
        todayEvents: [CalendarEvent],
        pendingTodos: [TodoItem],
        completedTodos: [TodoItem],
        allNotes: [Note],
        now: Date
    ) -> MomentumModel {
        let cal = Calendar.current
        
        // Meetings attended (with notes today)
        let meetingNotesToday = allNotes.filter {
            $0.noteType == .meeting && cal.isDateInToday($0.createdAt)
        }.count
        
        // Completed todos today
        let completedCount = completedTodos.count
        
        // Remaining meetings today
        let remainingMeetings = todayEvents.filter { !$0.isAllDay && $0.startDate > now }.count
        
        // Pending todos due today or overdue (max 5)
        let dueTodayOrOverdue = pendingTodos.filter { todo in
            guard let due = todo.dueDate else { return false }
            return cal.isDateInToday(due) || due < now
        }.prefix(5).count
        
        let done = meetingNotesToday + completedCount
        let pending = remainingMeetings + dueTodayOrOverdue
        let total = done + pending
        
        let overdueTodos = pendingTodos.filter { $0.isOverdue }
        
        return MomentumModel(
            completedDots: done,
            pendingDots: pending - overdueTodos.count,
            overdueDots: overdueTodos.count,
            total: total,
            done: done,
            label: momentumLabel(done: done, total: total, pending: pending)
        )
    }
    
    private func momentumLabel(done: Int, total: Int, pending: Int) -> String? {
        guard total > 0 else { return nil }
        if done == 0 { return "Fresh day — \(total) items ahead" }
        if pending == 0 { return "Clear desk. Well done." }
        let ratio = Double(done) / Double(total)
        if ratio > 0.6 { return "Strong momentum — \(pending) to go" }
        return "\(done) of \(total) items handled"
    }
    
    // MARK: - Action Stream
    
    private func computeActionStream(
        pendingTodos: [TodoItem],
        todayEvents: [CalendarEvent],
        allNotes: [Note]
    ) -> [RankedTodo] {
        let scored = pendingTodos.map { todo -> RankedTodo in
            let score = scoreTodo(todo, todayEvents: todayEvents, allNotes: allNotes)
            
            // Determine social nudge
            var socialNudge: String?
            if let sender = todo.senderEmail {
                if let meeting = todayEvents.first(where: { $0.attendeeEmails.contains(sender) }) {
                    let timeStr = meeting.startDate.formatted(date: .omitted, time: .shortened)
                    let name = meeting.attendeeNames.first(where: { _ in true }) ?? sender
                    socialNudge = "You're seeing \(name) at \(timeStr)"
                }
            }
            if socialNudge == nil, let sourceId = todo.sourceId, let sourceNote = allNotes.first(where: { $0.id.uuidString == sourceId }) {
                if todayEvents.contains(where: { event in
                    !Set(event.attendeeNames).intersection(Set(sourceNote.attendees)).isEmpty
                }) {
                    let sharedAttendee = sourceNote.attendees.first ?? ""
                    if let meeting = todayEvents.first(where: { !Set($0.attendeeNames).intersection(Set(sourceNote.attendees)).isEmpty }) {
                        let timeStr = meeting.startDate.formatted(date: .omitted, time: .shortened)
                        socialNudge = "You're seeing \(sharedAttendee) at \(timeStr)"
                    }
                }
            }
            
            // Overdue days
            var overdueDays: Int?
            if let due = todo.dueDate, due < Date.now {
                overdueDays = Calendar.current.dateComponents([.day], from: due, to: Date.now).day
            }
            
            return RankedTodo(
                todo: todo,
                score: score,
                socialNudge: socialNudge,
                overdueDays: overdueDays
            )
        }
        
        return scored.sorted { $0.score > $1.score }.prefix(5).map { $0 }
    }
    
    private func scoreTodo(_ todo: TodoItem, todayEvents: [CalendarEvent], allNotes: [Note]) -> Int {
        var score = 0
        
        // Time urgency
        if let due = todo.dueDate {
            if due < .now { score += 40 }
            else if Calendar.current.isDateInToday(due) { score += 25 }
            else if due < Calendar.current.date(byAdding: .day, value: 7, to: .now)! { score += 10 }
        }
        
        // Social pressure: assignor in today's meetings?
        if let sender = todo.senderEmail {
            if todayEvents.contains(where: { $0.attendeeEmails.contains(sender) }) {
                score += 30
            }
        }
        
        // Source meeting has follow-up meeting today
        if let sourceId = todo.sourceId, let sourceNote = allNotes.first(where: { $0.id.uuidString == sourceId }) {
            if todayEvents.contains(where: { !Set($0.attendeeNames).intersection(Set(sourceNote.attendees)).isEmpty }) {
                score += 25
            }
        }
        
        // Recency/novelty
        if !todo.isSeen { score += 15 }
        if todo.createdAt > Calendar.current.date(byAdding: .day, value: -1, to: .now)! { score += 10 }
        
        // Source weight
        switch todo.sourceType {
        case .meeting: score += 10
        case .email: score += 5
        case .manual: score += 3
        }
        
        // Priority
        switch todo.priority {
        case .high: score += 15
        case .medium: score += 5
        case .low: score += 0
        }
        
        return score
    }
    
    // MARK: - Email Radar
    
    /// Surfaces emails that genuinely need YOUR action — read or unread.
    ///
    /// Core principle: an email "needs you" if someone else is waiting on YOU.
    /// It doesn't matter if you've read it — what matters is whether you've ACTED.
    ///
    /// Resolution detection (when an email leaves the radar):
    ///   - You sent the last message in the thread (ball in their court)
    ///   - The thread is older than 14 days with no recent activity
    ///   - It's automated/marketing/noise
    ///
    /// Scoring dimensions (higher = more urgent):
    ///   1. Ball-in-court  — someone else sent the last message, you haven't replied
    ///   2. Awaiting reply — you replied, they responded back (active volley)
    ///   3. Staleness      — how long since the last inbound message (decays over time)
    ///   4. Directedness   — TO vs CC
    ///   5. Audience size  — 1:1 > small group > mass
    ///   6. Content signals — questions, requests, deadlines in the body
    ///   7. Social pressure — sender in today's meetings
    ///   8. Relationship   — sender in past meeting notes
    ///   9. Thread momentum — active back-and-forth
    ///  10. Unread boost   — unread gets a bonus (haven't even looked at it)
    ///  11. Todo linkage   — action item already extracted
    private func computeEmailRadar(
        allInboxThreads: [GmailThread],
        todayEvents: [CalendarEvent],
        pendingTodos: [TodoItem],
        allNotes: [Note],
        sentThreads: [GmailThread],
        userEmails: Set<String>
    ) -> [ActionableEmail] {
        let noiseCategories: Set<EmailCategory> = [.newsletters, .promotions, .notifications, .receipts, .meetingInvites]
        let excludedSenders = todoRepository.excludedSenders()
        
        let noiseLabelIds: Set<String> = [
            "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"
        ]
        
        // Time window — ignore threads with no activity in the last 14 days
        let cutoffDate = Calendar.current.date(byAdding: .day, value: -14, to: .now)!
        
        // Collect context for scoring
        let meetingAttendeeEmails = Set(todayEvents.flatMap(\.attendeeEmails).map { $0.lowercased() })
        let recentAttendees = Set(allNotes.filter { $0.noteType == .meeting }.flatMap(\.attendees).map { $0.lowercased() })
        let todoSourceIds = Set(pendingTodos.compactMap(\.sourceId))
        
        var scored: [(thread: GmailThread, score: Int, signals: EmailSignals)] = []
        
        print("[EmailRadar] Processing \(allInboxThreads.count) total inbox threads (cutoff: 14 days), userEmails: \(userEmails)")
        
        for thread in allInboxThreads {
            guard let latest = thread.latestMessage else { continue }
            
            // ── Time gate: skip threads with no activity in 14 days ──
            if latest.date < cutoffDate { continue }
            
            // ── Ball-in-court: who sent the last message? ──
            let lastSenderEmail = latest.fromEmail.lowercased()
            let iSentLast = userEmails.contains(lastSenderEmail)
            
            // If I sent the last message, the ball is in their court — skip.
            // This handles "user has responded and dealt with it".
            if iSentLast { continue }
            
            // ── Noise filters ──
            
            // Find the last INBOUND message (from someone else) for content analysis
            let lastInbound = thread.messages.last(where: { !userEmails.contains($0.fromEmail.lowercased()) })
            guard let inbound = lastInbound else { continue }
            
            let fromLower = inbound.fromEmail.lowercased()
            let bodyLowerFull = inbound.bodyPlain.lowercased()
            let totalRecipients = inbound.to.count + inbound.cc.count
            
            if AppState.isAutomatedSender(inbound.fromEmail) { continue }
            if excludedSenders.contains(fromLower) { continue }
            
            let categories = EmailCategory.classify(
                subject: inbound.subject,
                fromEmail: inbound.fromEmail,
                labelIds: inbound.labelIds,
                attachmentFilenames: inbound.attachments.map(\.filename),
                attachmentMimeTypes: inbound.attachments.map(\.mimeType)
            )
            if !categories.intersection(noiseCategories).isEmpty { continue }
            
            if !Set(inbound.labelIds).intersection(noiseLabelIds).isEmpty { continue }
            
            // Bulk / marketing detection
            let hasUnsubscribe = bodyLowerFull.contains("unsubscribe")
                || bodyLowerFull.contains("opt out")
                || bodyLowerFull.contains("manage your preferences")
            let hasMarketingFooter = bodyLowerFull.contains("view in browser")
                || bodyLowerFull.contains("view online")
                || bodyLowerFull.contains("view this email in your browser")
                || bodyLowerFull.contains("email was sent to")
                || bodyLowerFull.contains("you are receiving this")
                || bodyLowerFull.contains("this email was sent")
                || bodyLowerFull.contains("sent to you because")
                || bodyLowerFull.contains("add us to your address book")
            if hasMarketingFooter { continue }
            if hasUnsubscribe && totalRecipients > 10 { continue }
            
            let fromName = inbound.from.lowercased()
            let impersonalSender = fromName.contains("team") || fromName.contains("noreply")
                || fromName.contains("no-reply") || fromName.contains("newsletter")
                || fromName.contains("digest") || fromName.contains("updates")
                || fromName.contains("marketing") || fromName.contains("promo")
                || fromName.contains("notification") || fromName == fromLower
            if hasUnsubscribe && impersonalSender { continue }
            
            // ── Scoring ──
            
            var score = 0
            var signals = EmailSignals()
            
            // Determine thread state
            let myMessages = thread.messages.filter { userEmails.contains($0.fromEmail.lowercased()) }
            let theirMessages = thread.messages.filter { !userEmails.contains($0.fromEmail.lowercased()) }
            let lastInboundDate = inbound.date
            let myLastReply = myMessages.last
            
            // Did I reply at some point, but they sent something newer?
            let iRepliedButTheyRespondedAfter = myLastReply != nil && lastInboundDate > (myLastReply?.date ?? .distantPast)
            
            // 1. Ball-in-court base score
            score += 20
            
            // 2. Awaiting reply volley — they responded AFTER my reply (active conversation)
            if iRepliedButTheyRespondedAfter {
                score += 10
                signals.isReplyToMyMessage = true
            }
            
            // 3. Staleness decay — how long since the last inbound message
            let hoursSinceInbound = Date.now.timeIntervalSince(lastInboundDate) / 3600
            if hoursSinceInbound < 1 { score += 15 }
            else if hoursSinceInbound < 4 { score += 12 }
            else if hoursSinceInbound < 12 { score += 8 }
            else if hoursSinceInbound < 24 { score += 5 }
            else if hoursSinceInbound < 48 { score += 3 }
            else if hoursSinceInbound < 72 { score += 1 }
            // 3-14 days: 0 points (still shown, just lower ranked)
            
            // 4. Directedness: am I in TO vs CC?
            let imInTo = inbound.to.contains(where: { userEmails.contains($0.lowercased()) })
            let imInCc = inbound.cc.contains(where: { userEmails.contains($0.lowercased()) })
            if imInTo {
                score += 15
                signals.directlyAddressed = true
            } else if imInCc {
                score += 3
            }
            
            // 5. Audience size
            if totalRecipients <= 2 {
                score += 15
                signals.isOneToOne = true
            } else if totalRecipients <= 5 {
                score += 8
            } else if totalRecipients <= 10 {
                score += 2
            }
            
            // 6. Content signals
            let bodyLower = bodyLowerFull
            let subjectLower = inbound.subject.lowercased()
            
            let hasQuestion = bodyLower.contains("?") && !bodyLower.hasPrefix("unsubscribe")
            let requestPhrases = [
                "could you", "can you", "would you", "will you",
                "please", "need you", "need your", "let me know",
                "get back to", "waiting for", "following up",
                "your thoughts", "your input", "your feedback",
                "review", "approve", "sign off", "confirm",
                "by eod", "by end of", "by friday", "by monday",
                "by tomorrow", "asap", "urgent", "time-sensitive",
                "action required", "action needed"
            ]
            let hasRequest = requestPhrases.contains(where: { bodyLower.contains($0) || subjectLower.contains($0) })
            let deadlinePhrases = ["deadline", "due date", "by eod", "by end of day", "by tomorrow", "by friday", "by monday", "by next week", "time-sensitive", "asap", "urgent"]
            let hasDeadline = deadlinePhrases.contains(where: { bodyLower.contains($0) || subjectLower.contains($0) })
            
            if hasQuestion { score += 10; signals.hasQuestion = true }
            if hasRequest { score += 12; signals.hasRequest = true }
            if hasDeadline { score += 15; signals.hasDeadline = true }
            
            let fyiPhrases = ["fyi", "for your information", "for your records", "no action needed", "no action required", "just a heads up", "heads up"]
            let isFYI = fyiPhrases.contains(where: { bodyLower.contains($0) || subjectLower.contains($0) })
            if isFYI && !hasQuestion && !hasRequest { score -= 15; signals.isFYI = true }
            
            // 7. Social pressure: sender in today's meetings
            if meetingAttendeeEmails.contains(fromLower) {
                score += 20
                if let meeting = todayEvents.first(where: { $0.attendeeEmails.map({ $0.lowercased() }).contains(fromLower) }) {
                    let timeStr = meeting.startDate.formatted(date: .omitted, time: .shortened)
                    signals.meetingLink = "Meeting with \(inbound.from) at \(timeStr)"
                }
            }
            
            // 8. Relationship depth
            let senderNameLower = inbound.from.lowercased()
            if recentAttendees.contains(where: { $0.lowercased().contains(senderNameLower) || senderNameLower.contains($0.lowercased()) }) {
                score += 8
                signals.knownContact = true
            }
            
            // 9. Thread momentum
            if theirMessages.count >= 3 { score += 8 }
            else if theirMessages.count >= 2 { score += 4 }
            
            // 10. Unread boost — you haven't even looked at this yet
            if thread.isUnread { score += 10 }
            
            // 11. Todo linkage
            if todoSourceIds.contains(thread.id) { score += 10; signals.hasTodos = true }
            
            // Attachment boost
            if inbound.hasAttachments { score += 3 }
            
            scored.append((thread: thread, score: score, signals: signals))
        }
        
        // Sort by score descending, take top 5
        print("[EmailRadar] \(scored.count) emails need action (from \(allInboxThreads.count) total)")
        let top = scored.sorted { $0.score > $1.score }.prefix(5)
        
        return top.compactMap { item -> ActionableEmail? in
            let inbound = item.thread.messages.last(where: { !userEmails.contains($0.fromEmail.lowercased()) })
            guard let msg = inbound else { return nil }
            
            let snippet = extractSmartSnippet(msg.bodyPlain)
            let whyTag = buildWhyTag(signals: item.signals)
            
            return ActionableEmail(
                threadId: item.thread.id,
                senderName: msg.from,
                senderEmail: msg.fromEmail,
                senderInitials: initials(from: msg.from),
                subject: item.thread.subject,
                snippet: snippet,
                date: msg.date,
                meetingLink: item.signals.meetingLink,
                hasTodos: item.signals.hasTodos,
                score: item.score,
                whyTag: whyTag,
                hasQuestion: item.signals.hasQuestion,
                hasDeadline: item.signals.hasDeadline,
                isOneToOne: item.signals.isOneToOne,
                isReplyBack: item.signals.isReplyToMyMessage
            )
        }
    }
    
    /// Internal signal flags accumulated during scoring.
    private struct EmailSignals {
        var directlyAddressed = false
        var isOneToOne = false
        var hasQuestion = false
        var hasRequest = false
        var hasDeadline = false
        var isFYI = false
        var meetingLink: String?
        var knownContact = false
        var hasTodos = false
        var isReplyToMyMessage = false
    }
    
    /// Build a short "why this is here" tag from the top scoring signal.
    private func buildWhyTag(signals: EmailSignals) -> String? {
        if signals.hasDeadline { return "Has deadline" }
        if let link = signals.meetingLink { return link }
        if signals.hasRequest { return "Asks you to do something" }
        if signals.hasQuestion { return "Waiting for your answer" }
        if signals.isReplyToMyMessage { return "They replied — your turn" }
        if signals.hasTodos { return "Has action items" }
        if signals.isOneToOne && signals.directlyAddressed { return "Direct message" }
        return nil
    }
    
    /// Extract the most meaningful sentence from the email body.
    private func extractSmartSnippet(_ body: String) -> String {
        let lines = body.components(separatedBy: .newlines)
        let skipPrefixes = [
            "sent from", "get outlook", "sent via", "--", "___",
            "on ", ">", "from:", "to:", "cc:", "subject:", "date:",
            "this email", "this message", "confidential", "disclaimer",
            "unsubscribe", "click here", "view in browser", "powered by",
            "------", "======", "______"
        ]
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            let lower = trimmed.lowercased()
            guard !trimmed.isEmpty, trimmed.count > 10 else { continue }
            if skipPrefixes.contains(where: { lower.hasPrefix($0) }) { continue }
            if trimmed == trimmed.uppercased() && trimmed.count > 5 { continue }
            return String(trimmed.prefix(140))
        }
        return ""
    }
    
    private func initials(from name: String) -> String {
        let parts = name.split(separator: " ")
        if parts.count >= 2 {
            return "\(parts[0].prefix(1))\(parts[1].prefix(1))".uppercased()
        }
        return String(name.prefix(2)).uppercased()
    }
    
    // MARK: - Meeting Dossiers
    
    private func computeMeetingDossiers(
        todayEvents: [CalendarEvent],
        allNotes: [Note],
        pendingTodos: [TodoItem],
        now: Date
    ) -> [MeetingDossier] {
        let upcoming = todayEvents.filter { !$0.isAllDay && $0.startDate > now && $0.startDate.timeIntervalSince(now) <= 7200 }
        
        return upcoming.map { event in
            // Prior meetings
            let priorMeetings = allNotes.filter { note in
                note.noteType == .meeting &&
                !Set(note.attendees).intersection(Set(event.attendeeNames)).isEmpty
            }.sorted { $0.createdAt > $1.createdAt }.prefix(5)
            
            // Email threads since last meeting
            let lastMeetingDate = priorMeetings.first?.createdAt ?? Date.distantPast
            let emailThreads = (gmailService.inboxThreads + gmailService.sentThreads).filter { thread in
                thread.messages.contains { msg in
                    event.attendeeEmails.contains(msg.fromEmail) || !Set(event.attendeeEmails).intersection(Set(msg.to)).isEmpty
                }
            }.filter { $0.date > lastMeetingDate }.sorted { $0.date > $1.date }.prefix(5)
            
            // Outstanding commitments
            let relatedTodos = pendingTodos.filter { todo in
                if let sourceId = todo.sourceId,
                   let sourceNote = allNotes.first(where: { $0.id.uuidString == sourceId }),
                   !Set(sourceNote.attendees).intersection(Set(event.attendeeNames)).isEmpty {
                    return true
                }
                if let sender = todo.senderEmail, event.attendeeEmails.contains(sender) {
                    return true
                }
                return false
            }
            
            let minutesAway = Int(event.startDate.timeIntervalSince(now) / 60)
            
            return MeetingDossier(
                id: event.id,
                title: event.title,
                attendeeNames: event.attendeeNames,
                startDate: event.startDate,
                endDate: event.endDate,
                minutesAway: minutesAway,
                meetingURL: event.meetingURL,
                platform: event.meetingPlatform,
                priorMeetingCount: priorMeetings.count,
                lastMeetingTitle: priorMeetings.first?.title,
                lastMeetingDate: priorMeetings.first?.createdAt,
                lastMeetingPreview: priorMeetings.first.flatMap { note in
                    let content = note.enhancedNotes ?? note.rawNotes
                    let lines = content.components(separatedBy: .newlines).prefix(3)
                    return lines.isEmpty ? nil : lines.joined(separator: "\n")
                },
                emailThreadCount: emailThreads.count,
                emailSubjects: emailThreads.map { ($0.latestMessage?.from ?? "", $0.subject, $0.date, $0.isUnread) },
                openItemCount: relatedTodos.count,
                openItems: relatedTodos.prefix(5).map { ($0.title, $0.isOverdue) },
                calendarEventId: event.id,
                attendees: event.attendeeNames,
                organizerDomain: event.organizerDomain,
                calendarSource: event.calendarSource
            )
        }
    }
    
    // MARK: - Unfinished Business
    
    private func computeUnfinishedBusiness(
        allNotes: [Note],
        now: Date
    ) -> [UnfinishedBusinessItem] {
        let recentMeetings = allNotes.filter { note in
            note.noteType == .meeting &&
            note.status == .enhanced &&
            note.createdAt > Calendar.current.date(byAdding: .hour, value: -48, to: now)!
        }.sorted { $0.createdAt > $1.createdAt }
        
        return recentMeetings.compactMap { note in
            let todos = todoRepository.fetchTodos(forSourceId: note.id.uuidString)
            let completed = todos.filter(\.isCompleted).count
            let pending = todos.count - completed
            let hoursSince = Int(now.timeIntervalSince(note.createdAt) / 3600)
            
            guard pending > 0 || todos.isEmpty else { return nil }
            
            let urgency: UnfinishedBusinessItem.UrgencyLevel
            if hoursSince > 48 && pending > 0 {
                urgency = .overdue
            } else if hoursSince > 24 && pending > 0 {
                urgency = .nudge
            } else {
                urgency = .normal
            }
            
            let timeLabel: String
            if hoursSince < 1 { timeLabel = "Just now" }
            else if hoursSince < 24 { timeLabel = "\(hoursSince)h ago" }
            else { timeLabel = "Yesterday" }
            
            return UnfinishedBusinessItem(
                noteId: note.id,
                title: note.title,
                timeLabel: timeLabel,
                attendees: note.attendees,
                totalTodos: todos.count,
                completedTodos: completed,
                pendingTodos: pending,
                urgency: urgency,
                todoItems: todos.prefix(5).map { UnfinishedTodoItem(id: $0.id, title: $0.title, isCompleted: $0.isCompleted, isOverdue: $0.isOverdue) }
            )
        }
    }
    
    // MARK: - Insight Cards
    
    private func computeInsightCards(
        todayEvents: [CalendarEvent],
        pendingTodos: [TodoItem],
        allNotes: [Note],
        unreadThreads: [GmailThread]
    ) -> [InsightCard] {
        var cards: [InsightCard] = []
        
        // Type A — Email-Meeting Convergence
        for event in todayEvents where !event.isAllDay {
            for email in event.attendeeEmails {
                let threads = unreadThreads.filter { $0.latestMessage?.fromEmail == email }
                if !threads.isEmpty {
                    let name = event.attendeeNames.first { _ in true } ?? email
                    let timeStr = event.startDate.formatted(date: .omitted, time: .shortened)
                    let id = "convergence-\(email)-\(event.id)"
                    guard !dismissedInsightIds.contains(id) else { continue }
                    cards.append(InsightCard(
                        id: id,
                        type: .emailMeetingConvergence,
                        title: "\(name) emailed \(threads.count) time\(threads.count == 1 ? "" : "s") since your last sync",
                        subtitle: "Might be worth discussing at \(timeStr) today",
                        actionLabel: "Open emails",
                        actionType: .navigateEmail
                    ))
                }
            }
        }
        
        // Type B — Stale Commitments
        let staleTodos = pendingTodos.filter { todo in
            todo.sourceType == .meeting &&
            todo.createdAt < Calendar.current.date(byAdding: .day, value: -7, to: .now)!
        }
        for todo in staleTodos.prefix(2) {
            let days = Calendar.current.dateComponents([.day], from: todo.createdAt, to: .now).day ?? 0
            let id = "stale-\(todo.id.uuidString)"
            guard !dismissedInsightIds.contains(id) else { continue }
            cards.append(InsightCard(
                id: id,
                type: .staleCommitment,
                title: "You committed to '\(todo.title)' \(days) days ago",
                subtitle: "From \(todo.sourceTitle ?? "a meeting"). Still pending.",
                actionLabel: "View source",
                actionType: .navigateNote
            ))
        }
        
        // Type C — Recurring Meeting Delta
        for event in todayEvents where !event.isAllDay {
            let prefix = String(event.title.prefix(15))
            let matchingNote = allNotes.first { note in
                note.noteType == .meeting &&
                note.title.hasPrefix(prefix) &&
                note.createdAt > Calendar.current.date(byAdding: .day, value: -14, to: .now)! &&
                note.createdAt < Calendar.current.startOfDay(for: .now)
            }
            if let note = matchingNote {
                let todos = todoRepository.fetchTodos(forSourceId: note.id.uuidString)
                let pendingCount = todos.filter { !$0.isCompleted }.count
                if pendingCount > 0 {
                    let id = "recurring-\(event.id)-\(note.id.uuidString)"
                    guard !dismissedInsightIds.contains(id) else { continue }
                    cards.append(InsightCard(
                        id: id,
                        type: .recurringMeetingDelta,
                        title: "Last week's \(note.title) had \(todos.count) action items",
                        subtitle: "\(pendingCount) still open.",
                        actionLabel: "Review",
                        actionType: .navigateNote
                    ))
                }
            }
        }
        
        return Array(cards.prefix(3))
    }
}

// MARK: - Models

struct GreetingModel {
    let main: String
    let sub: String
    
    static let empty = GreetingModel(main: "", sub: "")
}

struct MomentumModel {
    let completedDots: Int
    let pendingDots: Int
    let overdueDots: Int
    let total: Int
    let done: Int
    let label: String?
    
    static let empty = MomentumModel(completedDots: 0, pendingDots: 0, overdueDots: 0, total: 0, done: 0, label: nil)
}

struct RankedTodo: Identifiable {
    let todo: TodoItem
    let score: Int
    let socialNudge: String?
    let overdueDays: Int?
    
    var id: UUID { todo.id }
}

struct ActionableEmail: Identifiable {
    let threadId: String
    let senderName: String
    let senderEmail: String
    let senderInitials: String
    let subject: String
    let snippet: String
    let date: Date
    let meetingLink: String?
    let hasTodos: Bool
    /// Relevance score (higher = more important). Used for sorting.
    let score: Int
    /// Short explanation of why this email is surfaced (e.g. "Has deadline", "Waiting for your answer").
    let whyTag: String?
    /// The email body contains a question directed at the user.
    let hasQuestion: Bool
    /// The email mentions a deadline or time pressure.
    let hasDeadline: Bool
    /// 1:1 or very small audience — high response expectation.
    let isOneToOne: Bool
    /// The sender is replying back to a message the user sent.
    let isReplyBack: Bool
    
    var id: String { threadId }
}

struct MeetingDossier: Identifiable {
    let id: String
    let title: String
    let attendeeNames: [String]
    let startDate: Date
    let endDate: Date
    let minutesAway: Int
    let meetingURL: URL?
    let platform: String?
    let priorMeetingCount: Int
    let lastMeetingTitle: String?
    let lastMeetingDate: Date?
    let lastMeetingPreview: String?
    let emailThreadCount: Int
    let emailSubjects: [(sender: String, subject: String, date: Date, isUnread: Bool)]
    let openItemCount: Int
    let openItems: [(title: String, isOverdue: Bool)]
    let calendarEventId: String
    let attendees: [String]
    /// Domain of the organiser (for company logo via favicon).
    let organizerDomain: String?
    /// Calendar source label (e.g. account email).
    let calendarSource: String
    
    var isHappeningNow: Bool {
        Date.now >= startDate && Date.now <= endDate
    }
    
    var formattedTime: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return "\(formatter.string(from: startDate)) – \(formatter.string(from: endDate))"
    }
    
    var organizerLogoURL: URL? {
        guard let domain = organizerDomain else { return nil }
        return URL(string: "https://www.google.com/s2/favicons?domain=\(domain)&sz=128")
    }
}

struct UnfinishedBusinessItem: Identifiable {
    let noteId: UUID
    let title: String
    let timeLabel: String
    let attendees: [String]
    let totalTodos: Int
    let completedTodos: Int
    let pendingTodos: Int
    let urgency: UrgencyLevel
    let todoItems: [UnfinishedTodoItem]
    
    var id: UUID { noteId }
    
    enum UrgencyLevel {
        case normal, nudge, overdue
    }
}

struct UnfinishedTodoItem: Identifiable {
    let id: UUID
    let title: String
    let isCompleted: Bool
    let isOverdue: Bool
}

struct InsightCard: Identifiable {
    let id: String
    let type: InsightType
    let title: String
    let subtitle: String
    let actionLabel: String
    let actionType: ActionType
    
    enum InsightType {
        case emailMeetingConvergence
        case staleCommitment
        case recurringMeetingDelta
        case crossTeamConvergence
    }
    
    enum ActionType {
        case navigateEmail
        case navigateNote
        case navigateTodos
    }
}
