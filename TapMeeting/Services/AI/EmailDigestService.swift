import Foundation

/// AI-powered email digest and intelligence service.
///
/// Generates streaming summaries across four digest types:
///   - **Catch Me Up**: Overnight/absence catch-up grouped by urgency
///   - **Priority Review**: AI-triaged unread emails ranked by actionability
///   - **Awaiting Replies**: Threads where the user is waiting for a response
///   - **Weekly Patterns**: Volume trends, busiest senders, topic analysis
///
/// Leverages `SearchQueryPipeline` for semantic grounding — cross-references
/// emails with meetings, notes, calendar events, and transcripts.
/// All calls route through `AIProxyClient` → Anthropic Claude (streaming).
/// Results are cached for 3 hours to minimise API costs.
@Observable
final class EmailDigestService {

    // MARK: - Pipeline (Semantic Context)

    /// Central RAG pipeline — injected by AppState after auth.
    var pipeline: SearchQueryPipeline?

    // MARK: - Digest Types

    enum DigestType: String, CaseIterable, Identifiable {
        case catchUp = "catchup"
        case priorityReview = "priority"
        case awaitingReplies = "awaiting"
        case weeklyPatterns = "weekly"

        var id: String { rawValue }

        var label: String {
            switch self {
            case .catchUp: return "Catch Me Up"
            case .priorityReview: return "Priority Review"
            case .awaitingReplies: return "Awaiting Replies"
            case .weeklyPatterns: return "Weekly Patterns"
            }
        }

        var icon: String {
            switch self {
            case .catchUp: return "sunrise"
            case .priorityReview: return "flag"
            case .awaitingReplies: return "clock.arrow.circlepath"
            case .weeklyPatterns: return "chart.bar"
            }
        }

        var description: String {
            switch self {
            case .catchUp: return "What happened while you were away"
            case .priorityReview: return "Unread emails ranked by importance"
            case .awaitingReplies: return "Threads waiting for a response"
            case .weeklyPatterns: return "Your email activity this week"
            }
        }
    }

    // MARK: - Published State

    private(set) var catchUpDigest: String = ""
    private(set) var isCatchUpStreaming = false

    private(set) var priorityReview: String = ""
    private(set) var isPriorityStreaming = false

    private(set) var awaitingReplies: String = ""
    private(set) var isAwaitingStreaming = false

    private(set) var weeklyPatterns: String = ""
    private(set) var isWeeklyStreaming = false

    /// Currently active digest type (for UI tab highlight).
    private(set) var activeDigestType: DigestType?

    // MARK: - Cache

    private var cacheTimestamps: [DigestType: Date] = [:]
    private let cacheTTL: TimeInterval = 10800 // 3 hours

    /// Whether a given digest type has valid cached content.
    func isCached(_ type: DigestType) -> Bool {
        guard let ts = cacheTimestamps[type] else { return false }
        return Date.now.timeIntervalSince(ts) < cacheTTL && !content(for: type).isEmpty
    }

    /// Returns the content string for a given digest type.
    func content(for type: DigestType) -> String {
        switch type {
        case .catchUp: return catchUpDigest
        case .priorityReview: return priorityReview
        case .awaitingReplies: return awaitingReplies
        case .weeklyPatterns: return weeklyPatterns
        }
    }

    /// Invalidate all caches (e.g. when the account filter changes).
    func invalidateAllCaches() {
        cacheTimestamps.removeAll()
        catchUpDigest = ""
        priorityReview = ""
        awaitingReplies = ""
        weeklyPatterns = ""
    }

    /// Whether a given digest type is currently streaming.
    func isStreaming(for type: DigestType) -> Bool {
        switch type {
        case .catchUp: return isCatchUpStreaming
        case .priorityReview: return isPriorityStreaming
        case .awaitingReplies: return isAwaitingStreaming
        case .weeklyPatterns: return isWeeklyStreaming
        }
    }

    /// Force-refresh a digest (ignores cache).
    @MainActor
    func refresh(
        type: DigestType,
        threads: [GmailThread],
        userEmails: Set<String>,
        todayEvents: [CalendarEvent] = [],
        pendingTodos: [TodoItem] = []
    ) async {
        cacheTimestamps[type] = nil
        await generate(type: type, threads: threads, userEmails: userEmails,
                       todayEvents: todayEvents, pendingTodos: pendingTodos)
    }

    // MARK: - Main Generate Entry Point

    /// Generate a specific digest type. Uses cache if available.
    @MainActor
    func generate(
        type: DigestType,
        threads: [GmailThread],
        userEmails: Set<String>,
        todayEvents: [CalendarEvent] = [],
        pendingTodos: [TodoItem] = []
    ) async {
        // Return cached content if still valid
        if isCached(type) && !isStreaming(for: type) {
            activeDigestType = type
            return
        }

        activeDigestType = type

        switch type {
        case .catchUp:
            await generateCatchUp(threads: threads, userEmails: userEmails,
                                  todayEvents: todayEvents, pendingTodos: pendingTodos)
        case .priorityReview:
            await generatePriorityReview(threads: threads, userEmails: userEmails,
                                         todayEvents: todayEvents)
        case .awaitingReplies:
            await generateAwaitingReplies(threads: threads, userEmails: userEmails,
                                          todayEvents: todayEvents)
        case .weeklyPatterns:
            await generateWeeklyPatterns(threads: threads, userEmails: userEmails)
        }
    }

    // MARK: - Catch Me Up

    @MainActor
    private func generateCatchUp(
        threads: [GmailThread],
        userEmails: Set<String>,
        todayEvents: [CalendarEvent],
        pendingTodos: [TodoItem]
    ) async {
        isCatchUpStreaming = true
        catchUpDigest = ""

        let unreadThreads = threads.filter(\.isUnread)
        let needsAction = threads.filter { thread in
            guard let last = thread.latestMessage else { return false }
            return !userEmails.contains(last.fromEmail.lowercased()) && thread.isUnread
        }

        // Per-thread semantic enrichment — each email gets its own context from meetings/notes/calendar
        let enrichedEmails = await enrichThreadsWithSemanticContext(
            threads: Array(needsAction.prefix(20)),
            userEmails: userEmails,
            todayEvents: todayEvents
        )

        let calendarBlock = buildCalendarBlock(events: todayEvents)
        let todoBlock = buildTodoBlock(todos: pendingTodos)

        let dataPayload = """
        INBOX: \(threads.count) threads, \(unreadThreads.count) unread, \(needsAction.count) need action

        EMAILS (each includes inline CONTEXT from your meeting notes, past conversations, and calendar where relevant):
        \(enrichedEmails)

        TODAY'S CALENDAR:
        \(calendarBlock.isEmpty ? "No meetings scheduled." : calendarBlock)

        PENDING TO-DOS:
        \(todoBlock.isEmpty ? "No pending to-dos." : todoBlock)
        """

        let system = """
        You are a trusted chief of staff delivering a morning email brief.

        SILENTLY DISCARD all noise: automated notifications, system alerts, case/ticket \
        assignments, marketing, newsletters, receipts, shipping updates, no-reply senders, \
        bulk CCs, and anything machine-generated. Never mention discarded emails.

        Each email below may include CONTEXT lines from the user's meeting notes, past \
        conversations, and calendar. USE this context to make your brief specific — e.g. \
        "Russell emailed about the invoice you discussed in last week's ops review" or \
        "Christian's SSO issue relates to the rollout you planned with the team on Monday". \
        Emails tagged [MEETING WITH THIS PERSON SOON] are high priority — the user will \
        see them face-to-face imminently.

        Write a tight brief:

        1. Open with 1-2 sentences of prose — what's the headline? What needs attention?
        2. List only emails that genuinely require human attention. Format each as:
           - **Sender Name** — what they need, in one line
           - _Specific context connecting this to a meeting, project, or commitment if the \
             CONTEXT lines support it. Omit if nothing specific to add._
        3. Order by urgency. Use a ## header only when the tier changes (e.g. "## Needs Action" \
           then "## Worth Knowing"). Skip empty tiers.
        4. End with "## Start Here" — 2-3 specific actions.

        Rules:
        - Do NOT use emojis, priority tags, or index numbers
        - Do NOT show empty sections or mention filtered emails
        - If nothing important, say so in one warm sentence
        - Under 250 words. Australian English.
        """

        await streamCompletion(system: system, userContent: dataPayload, maxTokens: 1200) { [weak self] text in
            self?.catchUpDigest += text
        }

        isCatchUpStreaming = false
        cacheTimestamps[.catchUp] = .now
    }

    // MARK: - Priority Review

    @MainActor
    private func generatePriorityReview(
        threads: [GmailThread],
        userEmails: Set<String>,
        todayEvents: [CalendarEvent]
    ) async {
        isPriorityStreaming = true
        priorityReview = ""

        let unreadThreads = Array(threads.filter(\.isUnread).prefix(30))
        guard !unreadThreads.isEmpty else {
            priorityReview = "No unread emails — you're all caught up."
            isPriorityStreaming = false
            cacheTimestamps[.priorityReview] = .now
            return
        }

        // Per-thread semantic enrichment — each email gets inline context
        let enrichedEmails = await enrichThreadsWithSemanticContext(
            threads: unreadThreads,
            userEmails: userEmails,
            todayEvents: todayEvents,
            maxThreads: 20
        )

        let calendarBlock = buildCalendarBlock(events: todayEvents)

        let dataPayload = """
        UNREAD EMAILS (\(unreadThreads.count)):
        Each email includes inline CONTEXT from meetings, notes, and calendar where available.
        \(enrichedEmails)

        TODAY'S CALENDAR:
        \(calendarBlock.isEmpty ? "No meetings." : calendarBlock)
        """

        let system = """
        You are a sharp executive assistant triaging the user's unread emails.

        SILENTLY DISCARD all noise: automated notifications, system alerts, case/ticket \
        assignments, marketing, newsletters, receipts, shipping updates, no-reply senders, \
        bulk CCs, and anything machine-generated. Never mention discarded emails.

        Each email includes inline CONTEXT from the user's meeting notes, past conversations, \
        and calendar. USE this context to explain WHY an email matters — e.g. "This relates \
        to the budget review discussed in Tuesday's standup" or "You committed to sending \
        this in last week's 1:1". Emails tagged [MEETING WITH THIS PERSON SOON] are high \
        priority — surface the connection.

        Produce a clean ranked list — most important first:
        - **Sender Name** — what they need, in one line
        - _Specific context from meetings/notes/calendar if the CONTEXT lines support it._

        Use ## headers only when the tier changes ("## Needs Your Reply", "## Worth Reading"). \
        Skip empty tiers.

        Rules:
        - [FROM ME] = low priority, ball is in their court
        - [MEETING WITH THIS PERSON SOON] = rank higher, mention the upcoming meeting
        - If 0 meaningful emails after filtering: "Nothing requiring your attention right now."
        - No emojis, numbered lists, priority tags, or index numbers
        - Do NOT mention filtered emails. Under 200 words. Australian English.
        """

        await streamCompletion(system: system, userContent: dataPayload, maxTokens: 1200) { [weak self] text in
            self?.priorityReview += text
        }

        isPriorityStreaming = false
        cacheTimestamps[.priorityReview] = .now
    }

    // MARK: - Awaiting Replies

    @MainActor
    private func generateAwaitingReplies(
        threads: [GmailThread],
        userEmails: Set<String>,
        todayEvents: [CalendarEvent]
    ) async {
        isAwaitingStreaming = true
        awaitingReplies = ""

        // Find threads where the user sent the last message
        let awaitingThreads = Array(threads.filter { thread in
            guard let latest = thread.latestMessage else { return false }
            return userEmails.contains(latest.fromEmail.lowercased())
        }.prefix(25))

        guard !awaitingThreads.isEmpty else {
            awaitingReplies = "No threads awaiting replies — everyone's responded."
            isAwaitingStreaming = false
            cacheTimestamps[.awaitingReplies] = .now
            return
        }

        // Build thread data with response pattern analysis
        let threadSummaries = awaitingThreads.enumerated().compactMap { index, thread -> String? in
            guard let latest = thread.latestMessage else { return nil }
            let recipients = thread.participants.filter { !userEmails.contains($0.lowercased()) }
            let daysSinceSent = Calendar.current.dateComponents([.day], from: latest.date, to: .now).day ?? 0
            let otherMessages = thread.messages.filter { !userEmails.contains($0.fromEmail.lowercased()) }
            let avgResponseDays: String
            if otherMessages.count >= 2 {
                let gaps = zip(otherMessages.dropLast(), otherMessages.dropFirst()).map {
                    Calendar.current.dateComponents([.hour], from: $0.date, to: $1.date).hour ?? 0
                }
                let avgHours = gaps.isEmpty ? 0 : gaps.reduce(0, +) / gaps.count
                avgResponseDays = avgHours < 24 ? "usually replies within hours" : "usually replies in ~\(avgHours / 24) days"
            } else {
                avgResponseDays = "response pattern unknown"
            }

            return """
            Waiting on: \(recipients.joined(separator: ", "))
            You sent: \(latest.date.formatted(.relative(presentation: .named))) (\(daysSinceSent) days ago)
            Thread length: \(thread.messageCount) messages
            Response pattern: \(avgResponseDays)
            """
        }.joined(separator: "\n---\n")

        // Per-thread semantic enrichment — find commitments, deadlines, meeting references
        let enrichedEmails = await enrichThreadsWithSemanticContext(
            threads: awaitingThreads,
            userEmails: userEmails,
            todayEvents: todayEvents,
            maxThreads: 15
        )

        let calendarBlock = buildCalendarBlock(events: todayEvents)

        let dataPayload = """
        THREADS AWAITING REPLIES (\(awaitingThreads.count)):
        (Each includes inline CONTEXT from meetings, notes, and calendar)
        \(enrichedEmails)

        RESPONSE PATTERNS:
        \(threadSummaries)

        UPCOMING CALENDAR:
        \(calendarBlock.isEmpty ? "No meetings." : calendarBlock)
        """

        let system = """
        You are tracking the user's sent emails that haven't received a response.

        SILENTLY SKIP any automated/transactional threads (support tickets, no-reply addresses, \
        system notifications, receipts). Never mention what you skipped.

        Each email includes inline CONTEXT from the user's meeting notes, transcripts, and \
        calendar. USE this context to make smart follow-up recommendations — e.g. "You \
        committed to this deliverable in Friday's standup — follow up today" or "You're \
        meeting Sarah tomorrow — raise it in person instead of chasing by email". \
        Emails tagged [MEETING WITH THIS PERSON SOON] are prime follow-up opportunities.

        Produce a clean list ordered by follow-up urgency:
        - **Person** — topic, sent X days ago
        - _Assessment: should you follow up? When? Connect to the inline CONTEXT._

        Use ## headers only when the tier changes ("## Chase These Up", "## Give It Time"). \
        Skip empty tiers.

        If there's a natural face-to-face moment coming (meeting, 1:1), say "raise in person" \
        instead of suggesting another email.

        Rules:
        - No emojis, index numbers, or priority tags
        - No empty sections. No mention of filtered threads.
        - If nothing meaningful: one sentence.
        - Under 200 words. Australian English.
        """

        await streamCompletion(system: system, userContent: dataPayload, maxTokens: 1200) { [weak self] text in
            self?.awaitingReplies += text
        }

        isAwaitingStreaming = false
        cacheTimestamps[.awaitingReplies] = .now
    }

    // MARK: - Weekly Patterns

    @MainActor
    private func generateWeeklyPatterns(
        threads: [GmailThread],
        userEmails: Set<String>
    ) async {
        isWeeklyStreaming = true
        weeklyPatterns = ""

        let cal = Calendar.current
        let startOfWeek = cal.dateInterval(of: .weekOfYear, for: .now)?.start ?? .now
        let thisWeekThreads = threads.filter { $0.date >= startOfWeek }

        // Compute stats
        let totalReceived = thisWeekThreads.count
        let unread = thisWeekThreads.filter(\.isUnread).count
        let fromMe = thisWeekThreads.filter { thread in
            guard let latest = thread.latestMessage else { return false }
            return userEmails.contains(latest.fromEmail.lowercased())
        }.count

        // Sender frequency
        let senderCounts = Dictionary(grouping: thisWeekThreads.compactMap { $0.latestMessage?.from }) { $0 }
            .mapValues(\.count)
            .sorted { $0.value > $1.value }
        let topSenders = senderCounts.prefix(8).map { "\($0.key) (\($0.value))" }.joined(separator: ", ")

        // Daily volume
        let dailyCounts = Dictionary(grouping: thisWeekThreads) { thread -> String in
            thread.date.formatted(.dateTime.weekday(.wide))
        }.mapValues(\.count)
        let dailyBreakdown = dailyCounts.sorted { $0.key < $1.key }
            .map { "\($0.key): \($0.value)" }.joined(separator: ", ")

        // Subject keywords (simple frequency)
        let subjectWords = thisWeekThreads.compactMap { $0.latestMessage?.subject }
            .flatMap { $0.lowercased().split(separator: " ").map(String.init) }
            .filter { $0.count > 3 }
        let wordCounts = Dictionary(grouping: subjectWords) { $0 }
            .mapValues(\.count)
            .sorted { $0.value > $1.value }
        let topTopics = wordCounts.prefix(10)
            .filter { $0.value > 1 }
            .map { "\($0.key) (\($0.value))" }.joined(separator: ", ")

        // Semantic enrichment — per-sender queries for the top 5 senders
        let topSenderNames = senderCounts.prefix(5).map { $0.key }
        let senderContexts: [String] = await withTaskGroup(
            of: String.self,
            returning: [String].self
        ) { [weak self] group in
            for sender in topSenderNames {
                group.addTask {
                    guard let self else { return "" }
                    return await self.fetchSemanticContext(
                        query: "What have I discussed with \(sender) this week? Key decisions and commitments.",
                        sourceFilters: [.noteChunk, .utteranceChunk, .calendarSummary],
                        maxBlocks: 2,
                        maxTotalChars: 400
                    )
                }
            }
            var results: [String] = []
            for await result in group {
                if !result.isEmpty { results.append(result) }
            }
            return results
        }

        // Also query broad themes
        let themeContext = await fetchSemanticContext(
            query: "What were the key decisions, commitments, and action items this week?",
            sourceFilters: [.noteChunk, .utteranceChunk],
            maxBlocks: 4,
            maxTotalChars: 1200
        )

        let dataPayload = """
        WEEKLY EMAIL STATS (since \(startOfWeek.formatted(date: .abbreviated, time: .omitted))):
        Total threads: \(totalReceived)
        Unread: \(unread)
        Threads where I sent last: \(fromMe)

        DAILY BREAKDOWN:
        \(dailyBreakdown.isEmpty ? "No data yet." : dailyBreakdown)

        TOP SENDERS:
        \(topSenders.isEmpty ? "No data yet." : topSenders)

        SUBJECT KEYWORDS:
        \(topTopics.isEmpty ? "Not enough data." : topTopics)

        PER-SENDER CONTEXT (from meeting notes, transcripts, and calendar):
        \(senderContexts.isEmpty ? "No semantic context available." : senderContexts.joined(separator: "\n"))
        \(themeContext)
        """

        let system = """
        You are summarising the user's email week — focus on real human communication only. \
        Ignore automated notifications, newsletters, marketing, and system-generated messages \
        in your analysis. Never mention what you excluded.

        You have per-sender context from the user's meeting notes, transcripts, and calendar. \
        USE this context to connect email patterns to real-world activities — e.g. "Your 6 \
        emails with Sarah this week all trace back to the product launch discussed in Monday's \
        standup" or "James keeps emailing about the API timeline — you committed to a Thursday \
        deadline in your 1:1".

        Write a concise weekly digest:

        ## This Week
        2-3 sentences of prose: how busy was the week, what dominated? Be specific — reference \
        actual people, projects, and commitments from the context.

        ## Key Conversations
        3-5 most significant threads or relationships. For each:
        **Person/Topic** — what happened or what's pending, grounded in meeting/project context.

        ## One Thing to Know
        A single actionable insight the user might have missed. Draw from the data:
        unreplied threads, dominant senders, patterns, upcoming meetings that relate to \
        this week's email threads.

        Rules:
        - No emojis. No generic observations — every line must be specific.
        - No mention of filtered emails. Under 200 words. Australian English.
        """

        await streamCompletion(system: system, userContent: dataPayload, maxTokens: 1000) { [weak self] text in
            self?.weeklyPatterns += text
        }

        isWeeklyStreaming = false
        cacheTimestamps[.weeklyPatterns] = .now
    }

    // MARK: - Streaming Helper

    private func streamCompletion(
        system: String,
        userContent: String,
        maxTokens: Int,
        onToken: @escaping @MainActor (String) -> Void
    ) async {
        do {
            let body: [String: Any] = [
                "model": Constants.AI.anthropicSonnetModel,
                "max_tokens": maxTokens,
                "system": system,
                "messages": [
                    ["role": "user", "content": userContent]
                ],
                "stream": true
            ]

            let (bytes, _) = try await AIProxyClient.shared.stream(
                provider: .anthropic,
                endpoint: "/v1/messages",
                body: body
            )

            for try await line in bytes.lines {
                guard line.hasPrefix("data: ") else { continue }
                let json = String(line.dropFirst(6))
                guard json != "[DONE]" else { break }

                if let data = json.data(using: .utf8),
                   let event = try? JSONDecoder().decode(DigestStreamEvent.self, from: data) {
                    if event.type == "content_block_delta",
                       let delta = event.delta,
                       let text = delta.text {
                        await onToken(text)
                    }
                }
            }
        } catch {
            print("[EmailDigest] Streaming failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Context Builders

    private func buildCalendarBlock(events: [CalendarEvent]) -> String {
        events.filter { !$0.isAllDay }.map { event in
            let time = event.startDate.formatted(date: .omitted, time: .shortened)
            let end = event.endDate.formatted(date: .omitted, time: .shortened)
            let attendees = event.attendeeNames.isEmpty ? "" : " with \(event.attendeeNames.joined(separator: ", "))"
            let status = event.endDate < .now ? " [DONE]" : (event.isHappeningNow ? " [NOW]" : "")
            return "- \(time)–\(end): \(event.title)\(attendees)\(status)"
        }.joined(separator: "\n")
    }

    private func buildTodoBlock(todos: [TodoItem]) -> String {
        guard !todos.isEmpty else { return "" }
        let overdue = todos.filter(\.isOverdue)
        let dueToday = todos.filter { $0.dueDate.map { Calendar.current.isDateInToday($0) } ?? false }

        var lines: [String] = []
        lines.append("Pending: \(todos.count) (\(overdue.count) overdue, \(dueToday.count) due today)")
        for todo in overdue.prefix(3) {
            lines.append("- OVERDUE: \(todo.title) (from: \(todo.sourceTitle ?? "unknown"))")
        }
        for todo in dueToday.prefix(3) {
            lines.append("- Due today: \(todo.title)")
        }
        return lines.joined(separator: "\n")
    }

    // MARK: - Semantic Context Helpers

    /// Per-thread semantic enrichment. Runs a targeted pipeline query for each thread
    /// (sender + subject) in parallel, then injects the context inline alongside the
    /// email data. This gives the LLM specific, per-email context instead of a generic blob.
    private func enrichThreadsWithSemanticContext(
        threads: [GmailThread],
        userEmails: Set<String>,
        todayEvents: [CalendarEvent],
        maxThreads: Int = 15
    ) async -> String {
        let threadsToEnrich = Array(threads.prefix(maxThreads))
        guard !threadsToEnrich.isEmpty else { return "No emails to analyse." }

        // Build upcoming meeting attendee set (next 3 days, not just today)
        let cal = Calendar.current
        let threeDaysOut = cal.date(byAdding: .day, value: 3, to: .now) ?? .now
        var upcomingEvents = todayEvents

        // Fetch future events via range provider or fall back to live provider
        if let rangeProvider = pipeline?.liveCalendarRangeProvider {
            let futureEvents = await rangeProvider(.now, threeDaysOut)
            let existingIDs = Set(upcomingEvents.map(\.id))
            upcomingEvents += futureEvents.filter { !existingIDs.contains($0.id) && !$0.isAllDay }
        } else if let provider = pipeline?.liveCalendarProvider {
            let allCached = provider()
            let existingIDs = Set(upcomingEvents.map(\.id))
            upcomingEvents += allCached.filter {
                !existingIDs.contains($0.id) && $0.startDate > .now && $0.startDate <= threeDaysOut && !$0.isAllDay
            }
        }

        let upcomingAttendeeEmails = Set(upcomingEvents.flatMap(\.attendeeEmails).map { $0.lowercased() })
        let upcomingAttendeeNames = Set(upcomingEvents.flatMap(\.attendeeNames).map { $0.lowercased() })

        // Run per-thread semantic queries in parallel
        let enrichments: [(index: Int, context: String)] = await withTaskGroup(
            of: (Int, String).self,
            returning: [(Int, String)].self
        ) { group in
            for (i, thread) in threadsToEnrich.enumerated() {
                guard let m = thread.latestMessage else { continue }
                let senderName = m.from
                let subject = m.subject

                group.addTask { [weak self] in
                    guard let self, let pipeline = self.pipeline else { return (i, "") }
                    let query = "\(senderName) \(subject)"
                    guard let result = try? await pipeline.execute(
                        query: query,
                        options: .init(
                            sourceFilters: [.noteChunk, .utteranceChunk, .emailChunk, .calendarSummary],
                            maxEvidenceBlocks: 2,
                            enableLLMRewrite: true,
                            enableTemporalResolution: false,
                            enableAgenticFallback: false
                        )
                    ) else { return (i, "") }

                    let topEvidence = result.evidence.prefix(2)
                    guard !topEvidence.isEmpty else { return (i, "") }

                    let lines = topEvidence.map { block in
                        "  CONTEXT: \(block.title) — \(String(block.text.prefix(200)))"
                    }.joined(separator: "\n")
                    return (i, lines)
                }
            }

            var results: [(Int, String)] = []
            for await result in group {
                results.append(result)
            }
            return results
        }

        let contextMap = Dictionary(uniqueKeysWithValues: enrichments)

        // Build enriched thread list
        return threadsToEnrich.enumerated().compactMap { index, thread -> String? in
            guard let m = thread.latestMessage else { return nil }
            let fromMe = userEmails.contains(m.fromEmail.lowercased())
            let age = m.date.formatted(.relative(presentation: .named))
            let body = String(m.bodyPlain.prefix(350))

            // Meeting cross-reference (next 3 days, not just today)
            let senderInUpcoming = upcomingAttendeeEmails.contains(m.fromEmail.lowercased())
                || upcomingAttendeeNames.contains(m.from.lowercased())
            let meetingNote = senderInUpcoming ? " [MEETING WITH THIS PERSON SOON]" : ""

            var entry = """
            [\(index + 1)] \(m.from) — "\(m.subject)" (\(age))\(fromMe ? " [FROM ME]" : "")\(meetingNote)
            \(thread.messageCount) messages, \(thread.isUnread ? "UNREAD" : "read")
            Preview: \(body)
            """

            if let ctx = contextMap[index], !ctx.isEmpty {
                entry += "\n\(ctx)"
            }

            return entry
        }.joined(separator: "\n---\n")
    }

    /// Single targeted semantic query — used when a broad thematic query is needed.
    private func fetchSemanticContext(
        query: String,
        sourceFilters: [SearchSourceType] = SearchSourceType.allCases,
        maxBlocks: Int = 6,
        maxTotalChars: Int = 2500
    ) async -> String {
        guard let pipeline else { return "" }

        do {
            let result = try await pipeline.execute(
                query: query,
                options: .init(
                    sourceFilters: sourceFilters,
                    maxEvidenceBlocks: maxBlocks,
                    enableLLMRewrite: true,
                    enableTemporalResolution: false,
                    enableAgenticFallback: true
                )
            )

            guard !result.evidence.isEmpty else { return "" }

            var chars = 0
            var lines: [String] = []
            for (i, block) in result.evidence.enumerated() {
                let entry = "[\(i + 1)] \(block.title) — \(block.sourceType)\n\(block.text)"
                if chars + entry.count > maxTotalChars { break }
                lines.append(entry)
                chars += entry.count
            }

            guard !lines.isEmpty else { return "" }

            return """

            SEMANTIC CONTEXT (from your indexed history — meetings, emails, transcripts, notes):
            \(lines.joined(separator: "\n\n"))
            """
        } catch {
            print("[EmailDigest] Semantic context fetch failed: \(error.localizedDescription)")
            return ""
        }
    }
}

// MARK: - Stream Event Model

private struct DigestStreamEvent: Decodable {
    let type: String
    let delta: DeltaContent?

    struct DeltaContent: Decodable {
        let type: String?
        let text: String?
    }
}
