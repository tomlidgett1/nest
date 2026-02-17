import Foundation

/// AI-powered intelligence layer for the Nest Home tab.
/// Handles morning briefings, email triage classification, meeting prep briefs,
/// and contextual action item explanations.
///
/// All calls route through `AIProxyClient` → Supabase Edge Function → Claude.
/// Results are cached aggressively to minimise API costs.
@Observable
final class NestAIService {
    
    // MARK: - Published State
    
    /// Morning briefing text (streams in token-by-token).
    private(set) var morningBriefing: String = ""
    private(set) var isBriefingStreaming = false
    private(set) var hasBriefingLoaded = false
    
    /// Per-meeting AI briefs (keyed by calendar event ID).
    private(set) var meetingBriefs: [String: String] = [:]
    private(set) var streamingMeetingBriefId: String?
    
    /// AI-generated context lines for top action items (keyed by todo UUID).
    private(set) var actionContexts: [String: String] = [:]
    
    /// AI email triage results (keyed by thread ID). Score 0-100.
    private(set) var emailTriageScores: [String: EmailTriageResult] = [:]
    private(set) var isTriaging = false
    
    /// Whether the initial AI features have been triggered this session.
    private(set) var hasTriggeredInitialAI = false
    
    /// Mark initial AI features as triggered.
    func markInitialAITriggered() { hasTriggeredInitialAI = true }
    
    // MARK: - Cache
    
    private var briefingCacheDate: Date?
    private var triageCacheDate: Date?
    private var triagedMessageIds: Set<String> = []
    private var actionContextCacheDate: Date?
    
    // MARK: - Morning Briefing
    
    /// Generate a warm, conversational morning briefing from today's data.
    /// Streams token-by-token into `morningBriefing`. Cached for 3 hours.
    ///
    /// Trigger: first open of the day, or after 4+ hour absence.
    @MainActor
    func generateMorningBriefing(
        todayEvents: [CalendarEvent],
        pendingTodos: [TodoItem],
        completedTodosToday: [TodoItem],
        unreadEmails: [(sender: String, subject: String)],
        yesterdayMeetings: [(title: String, attendees: [String], actionItems: Int, completed: Int)]
    ) async {
        // Check cache — don't regenerate within 3 hours
        if let cached = briefingCacheDate, Date.now.timeIntervalSince(cached) < 10800, !morningBriefing.isEmpty {
            return
        }
        
        // Check if we should show a briefing at all
        let hour = Calendar.current.component(.hour, from: .now)
        let lastBriefingDate = UserDefaults.standard.object(forKey: "nest_lastMorningBriefingDate") as? Date
        let isNewDay = lastBriefingDate == nil || !Calendar.current.isDateInToday(lastBriefingDate!)
        let lastOpen = UserDefaults.standard.object(forKey: "nest_lastHomeOpenTimestamp") as? Date
        let longAbsence = lastOpen != nil && Date.now.timeIntervalSince(lastOpen!) > 4 * 3600
        
        guard (isNewDay || longAbsence) && hour >= 5 && hour < 14 else { return }
        guard !todayEvents.isEmpty || !pendingTodos.isEmpty || !unreadEmails.isEmpty else { return }
        
        isBriefingStreaming = true
        morningBriefing = ""
        
        // Build structured data for the prompt
        let calendarBlock = todayEvents.filter { !$0.isAllDay }.map { event in
            let time = event.startDate.formatted(date: .omitted, time: .shortened)
            let end = event.endDate.formatted(date: .omitted, time: .shortened)
            let attendees = event.attendeeNames.isEmpty ? "" : " (\(event.attendeeNames.joined(separator: ", ")))"
            let platform = event.meetingPlatform ?? ""
            return "- \(time)–\(end): \(event.title)\(attendees) \(platform)"
        }.joined(separator: "\n")
        
        let overdueTodos = pendingTodos.filter(\.isOverdue)
        let dueTodayTodos = pendingTodos.filter { todo in
            guard let due = todo.dueDate else { return false }
            return Calendar.current.isDateInToday(due)
        }
        let todoBlock = ([
            overdueTodos.isEmpty ? nil : "Overdue (\(overdueTodos.count)):\n" + overdueTodos.prefix(3).map { "- OVERDUE: \($0.title) (from: \($0.sourceTitle ?? "unknown"))" }.joined(separator: "\n"),
            dueTodayTodos.isEmpty ? nil : "Due today (\(dueTodayTodos.count)):\n" + dueTodayTodos.prefix(3).map { "- \($0.title)" }.joined(separator: "\n"),
            "Total pending: \(pendingTodos.count)"
        ] as [String?]).compactMap { $0 }.joined(separator: "\n")
        
        let emailBlock: String
        if unreadEmails.isEmpty {
            emailBlock = "No new unread emails."
        } else {
            let senderCounts = Dictionary(grouping: unreadEmails, by: \.sender).mapValues(\.count)
            let topSenders = senderCounts.sorted { $0.value > $1.value }.prefix(5)
            emailBlock = "\(unreadEmails.count) unread emails.\nKey senders: \(topSenders.map { "\($0.key) (\($0.value))" }.joined(separator: ", "))"
        }
        
        let yesterdayBlock: String
        if yesterdayMeetings.isEmpty {
            yesterdayBlock = "No meetings yesterday."
        } else {
            yesterdayBlock = yesterdayMeetings.map { m in
                "- \"\(m.title)\" with \(m.attendees.prefix(3).joined(separator: ", ")) — \(m.actionItems) action items, \(m.completed) completed"
            }.joined(separator: "\n")
        }
        
        let dataPayload = """
        Today's Calendar:
        \(calendarBlock.isEmpty ? "No meetings today." : calendarBlock)
        
        Pending To-Dos:
        \(todoBlock)
        
        Unread Emails:
        \(emailBlock)
        
        Yesterday's Meetings:
        \(yesterdayBlock)
        
        Completed today so far: \(completedTodosToday.count) items
        """
        
        let system = """
        You are Nest, an intelligent meeting and productivity assistant. Generate a warm, concise \
        morning briefing for the user based on the data below. Write in second person ("you"), \
        conversational tone, 4-8 sentences. Prioritise: (1) the most important meeting today and \
        any prep needed, (2) overdue commitments that need urgent attention, (3) notable emails \
        from key people. Do not list everything — highlight what matters most and why. End with \
        one forward-looking sentence about the day ahead. Use Australian English spelling. \
        Do NOT use markdown formatting, bullet points, or headers — write as flowing prose, like \
        a note from a personal assistant.
        """
        
        do {
            let body: [String: Any] = [
                "model": Constants.AI.anthropicSonnetModel,
                "max_tokens": 600,
                "system": system,
                "messages": [
                    ["role": "user", "content": dataPayload]
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
                   let event = try? JSONDecoder().decode(StreamEvent.self, from: data) {
                    if event.type == "content_block_delta",
                       let delta = event.delta,
                       let text = delta.text {
                        await MainActor.run {
                            morningBriefing += text
                        }
                    }
                }
            }
            
            await MainActor.run {
                isBriefingStreaming = false
                hasBriefingLoaded = true
                briefingCacheDate = .now
                UserDefaults.standard.set(Date.now, forKey: "nest_lastMorningBriefingDate")
            }
            
        } catch {
            print("[NestAI] Morning briefing failed: \(error.localizedDescription)")
            await MainActor.run {
                isBriefingStreaming = false
            }
        }
    }
    
    /// Dismiss the morning briefing for today.
    func dismissBriefing() {
        morningBriefing = ""
        hasBriefingLoaded = false
        UserDefaults.standard.set(Date.now, forKey: "nest_lastMorningBriefingDate")
    }
    
    // MARK: - Email Triage
    
    /// Batch-classify unread emails using AI to determine genuine actionability.
    /// Runs once per session (or when new emails arrive). Results cached by message ID.
    @MainActor
    func triageEmails(
        threads: [GmailThread],
        userEmails: Set<String>,
        todayAttendeeEmails: Set<String>
    ) async {
        // Only triage emails we haven't seen before
        let newThreads = threads.filter { thread in
            guard let latest = thread.latestMessage else { return false }
            return !triagedMessageIds.contains(latest.id)
        }
        
        guard !newThreads.isEmpty else { return }
        
        // Batch up to 15 emails per AI call
        let batch = Array(newThreads.prefix(15))
        isTriaging = true
        
        let emailSummaries = batch.enumerated().compactMap { index, thread -> String? in
            guard let latest = thread.latestMessage else { return nil }
            let fromMe = userEmails.contains(latest.fromEmail.lowercased())
            let imInTo = latest.to.contains(where: { userEmails.contains($0.lowercased()) })
            let recipientCount = latest.to.count + latest.cc.count
            let body = String(latest.bodyPlain.prefix(500))
            let inMeeting = todayAttendeeEmails.contains(latest.fromEmail.lowercased())
            
            return """
            [\(index + 1)]
            From: \(latest.from) <\(latest.fromEmail)>\(fromMe ? " [THIS IS FROM ME]" : "")
            To count: \(recipientCount), I'm in TO: \(imInTo)
            Subject: \(latest.subject)
            Sender in today's meetings: \(inMeeting)
            Thread messages: \(thread.messageCount)
            Body preview: \(body)
            """
        }.joined(separator: "\n---\n")
        
        let system = """
        You are an email triage assistant. For each email below, determine if the user genuinely \
        needs to take action on it. Score each email 0-100 and provide a brief reason.
        
        High scores (70-100): Direct questions to the user, requests for deliverables, decisions \
        needed, deadline-related, important people asking for something specific.
        
        Medium scores (30-69): Informational but relevant, FYI from important contacts, threads \
        the user is part of but doesn't need to act on immediately.
        
        Low scores (0-29): Mass CCs, automated but passed filters, newsletters that slipped \
        through, informational-only, the user sent the last message (ball in other's court).
        
        CRITICAL: If the email is FROM the user (marked [THIS IS FROM ME]), score it 0 — the \
        ball is in the other person's court.
        
        Respond ONLY as a JSON array with objects: {"index": 1, "score": 85, "reason": "..."} \
        No other text. The "reason" should be 5-10 words explaining why the user needs to act \
        (or why they don't).
        """
        
        do {
            let body: [String: Any] = [
                "model": Constants.AI.anthropicSonnetModel,
                "max_tokens": 1024,
                "system": system,
                "messages": [
                    ["role": "user", "content": emailSummaries]
                ]
            ]
            
            let data = try await AIProxyClient.shared.request(
                provider: .anthropic,
                endpoint: "/v1/messages",
                body: body
            )
            
            let response = try JSONDecoder().decode(AnthropicResponse.self, from: data)
            guard let text = response.content.first?.text else { return }
            
            // Parse the JSON array
            if let jsonData = text.data(using: .utf8),
               let results = try? JSONDecoder().decode([EmailTriageRaw].self, from: jsonData) {
                for result in results {
                    let idx = result.index - 1
                    guard idx >= 0, idx < batch.count else { continue }
                    let thread = batch[idx]
                    guard let latest = thread.latestMessage else { continue }
                    
                    emailTriageScores[thread.id] = EmailTriageResult(
                        score: result.score,
                        reason: result.reason
                    )
                    triagedMessageIds.insert(latest.id)
                }
            }
            
            triageCacheDate = .now
            isTriaging = false
            print("[NestAI] Triaged \(batch.count) emails")
            
        } catch {
            print("[NestAI] Email triage failed: \(error.localizedDescription)")
            isTriaging = false
        }
    }
    
    // MARK: - Meeting AI Brief
    
    /// Generate an AI-powered preparation brief for an upcoming meeting.
    /// Streams into `meetingBriefs[eventId]`.
    @MainActor
    func generateMeetingBrief(
        eventId: String,
        title: String,
        attendeeNames: [String],
        priorMeetingNotes: [String],
        emailSubjects: [(sender: String, subject: String)],
        openItems: [(title: String, isOverdue: Bool)]
    ) async {
        // Return cached
        if meetingBriefs[eventId] != nil { return }
        
        streamingMeetingBriefId = eventId
        meetingBriefs[eventId] = ""
        
        let notesBlock = priorMeetingNotes.isEmpty ? "No prior meetings in Nest." :
            priorMeetingNotes.enumerated().map { i, notes in
                "Meeting \(i + 1):\n\(String(notes.prefix(800)))"
            }.joined(separator: "\n---\n")
        
        let emailBlock = emailSubjects.isEmpty ? "No recent emails with these attendees." :
            emailSubjects.map { "- \($0.sender): \($0.subject)" }.joined(separator: "\n")
        
        let todosBlock = openItems.isEmpty ? "No open commitments." :
            openItems.map { "\($0.isOverdue ? "OVERDUE: " : "- ")\($0.title)" }.joined(separator: "\n")
        
        let dataPayload = """
        Meeting: \(title)
        Attendees: \(attendeeNames.joined(separator: ", "))
        
        Prior meeting notes with these people:
        \(notesBlock)
        
        Recent email threads with attendees:
        \(emailBlock)
        
        Open commitments related to these people:
        \(todosBlock)
        """
        
        let system = """
        You are Nest, an intelligent meeting preparation assistant. Summarise the user's complete \
        history with the meeting attendees and prepare them for the upcoming meeting. Write 4-8 \
        sentences in second person ("you"), conversational tone. Cover: (1) what was discussed \
        last time, (2) any commitments that are still open (especially overdue ones — flag these), \
        (3) notable emails since the last meeting, (4) what to focus on in today's meeting. \
        Be specific — use names, dates, and details from the data. Use Australian English. \
        Do NOT use markdown formatting or bullet points — write as flowing prose.
        """
        
        do {
            let body: [String: Any] = [
                "model": Constants.AI.anthropicSonnetModel,
                "max_tokens": 600,
                "system": system,
                "messages": [
                    ["role": "user", "content": dataPayload]
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
                   let event = try? JSONDecoder().decode(StreamEvent.self, from: data) {
                    if event.type == "content_block_delta",
                       let delta = event.delta,
                       let text = delta.text {
                        await MainActor.run {
                            meetingBriefs[eventId, default: ""] += text
                        }
                    }
                }
            }
            
            await MainActor.run {
                streamingMeetingBriefId = nil
            }
            
        } catch {
            print("[NestAI] Meeting brief failed: \(error.localizedDescription)")
            await MainActor.run {
                streamingMeetingBriefId = nil
                meetingBriefs[eventId] = nil
            }
        }
    }
    
    // MARK: - On-Demand Summaries
    
    /// The currently active summary text (streams in token-by-token).
    private(set) var activeSummary: String = ""
    private(set) var isSummaryStreaming = false
    private(set) var activeSummaryType: SummaryType?
    
    enum SummaryType: String, CaseIterable {
        case dayAtAGlance = "day"
        case nextMeetingPrep = "meeting"
        case tomorrow = "tomorrow"
        case endOfDay = "eod"
        case catchUp = "catchup"
        
        var label: String {
            switch self {
            case .dayAtAGlance: return "Day at a glance"
            case .nextMeetingPrep: return "Prepare for next meeting"
            case .tomorrow: return "Tomorrow's outlook"
            case .endOfDay: return "End of day recap"
            case .catchUp: return "What did I miss?"
            }
        }
        
        var icon: String {
            switch self {
            case .dayAtAGlance: return "sun.max"
            case .nextMeetingPrep: return "person.2"
            case .tomorrow: return "calendar.badge.clock"
            case .endOfDay: return "moon.stars"
            case .catchUp: return "arrow.counterclockwise"
            }
        }
    }
    
    /// Generate an on-demand summary. Streams into `activeSummary`.
    @MainActor
    func generateSummary(
        type: SummaryType,
        todayEvents: [CalendarEvent],
        tomorrowEvents: [CalendarEvent] = [],
        pendingTodos: [TodoItem],
        completedTodosToday: [TodoItem],
        recentNotes: [Note],
        inboxThreads: [GmailThread],
        userEmails: Set<String>
    ) async {
        // If same summary is already loaded, toggle it off
        if activeSummaryType == type && !activeSummary.isEmpty && !isSummaryStreaming {
            dismissSummary()
            return
        }
        
        activeSummaryType = type
        activeSummary = ""
        isSummaryStreaming = true
        
        let cal = Calendar.current
        let hour = cal.component(.hour, from: .now)
        
        // Build context blocks
        let calendarBlock = todayEvents.filter { !$0.isAllDay }.map { event in
            let time = event.startDate.formatted(date: .omitted, time: .shortened)
            let end = event.endDate.formatted(date: .omitted, time: .shortened)
            let attendees = event.attendeeNames.isEmpty ? "" : " with \(event.attendeeNames.joined(separator: ", "))"
            let done = event.endDate < .now ? " [DONE]" : (event.isHappeningNow ? " [NOW]" : "")
            return "- \(time)–\(end): \(event.title)\(attendees)\(done)"
        }.joined(separator: "\n")
        
        let overdueTodos = pendingTodos.filter(\.isOverdue)
        let dueTodayTodos = pendingTodos.filter { $0.dueDate.map { cal.isDateInToday($0) } ?? false }
        let todoBlock = """
        Pending: \(pendingTodos.count) (\(overdueTodos.count) overdue, \(dueTodayTodos.count) due today)
        Completed today: \(completedTodosToday.count)
        \(overdueTodos.prefix(3).map { "- OVERDUE: \($0.title) (from: \($0.sourceTitle ?? "unknown"))" }.joined(separator: "\n"))
        \(dueTodayTodos.prefix(3).map { "- Due today: \($0.title)" }.joined(separator: "\n"))
        """
        
        let recentInbox = inboxThreads.prefix(20)
        let unreadCount = recentInbox.filter(\.isUnread).count
        let needsAction = recentInbox.filter { thread in
            guard let last = thread.latestMessage else { return false }
            return !userEmails.contains(last.fromEmail.lowercased())
        }
        let emailBlock = """
        Inbox: \(inboxThreads.count) threads, \(unreadCount) unread, \(needsAction.count) awaiting your reply
        Key threads:
        \(needsAction.prefix(5).compactMap { thread -> String? in
            guard let m = thread.latestMessage else { return nil }
            return "- \(m.from): \"\(m.subject)\" (\(thread.isUnread ? "unread" : "read"))"
        }.joined(separator: "\n"))
        """
        
        // Gather relevant attendee names for context-aware note matching
        let relevantEvents: [CalendarEvent]
        switch type {
        case .tomorrow:
            relevantEvents = tomorrowEvents
        case .nextMeetingPrep:
            if let next = todayEvents.filter({ !$0.isAllDay && $0.startDate > .now }).first {
                relevantEvents = [next]
            } else {
                relevantEvents = []
            }
        default:
            relevantEvents = todayEvents
        }
        let relevantAttendees = Set(relevantEvents.flatMap(\.attendeeNames).map { $0.lowercased() })
        
        let allMeetingNotes = recentNotes.filter { $0.noteType == .meeting }
            .sorted { $0.createdAt > $1.createdAt }
        
        // Notes with people the user is meeting (most valuable context)
        let attendeeNotes = allMeetingNotes.filter { note in
            let noteAttendees = Set(note.attendees.map { $0.lowercased() })
            return !noteAttendees.intersection(relevantAttendees).isEmpty
        }.prefix(5)
        
        // Fill remaining slots with general recent notes
        let attendeeNoteIds = Set(attendeeNotes.map(\.id))
        let otherNotes = allMeetingNotes.filter { !attendeeNoteIds.contains($0.id) }.prefix(max(0, 3 - attendeeNotes.count))
        
        let combinedNotes = (Array(attendeeNotes) + Array(otherNotes)).sorted { $0.createdAt > $1.createdAt }
        
        let meetingNotesBlock = combinedNotes.map { note in
            let content = (note.enhancedNotes ?? note.rawNotes)
            let people = note.attendees.isEmpty ? "" : " [attendees: \(note.attendees.joined(separator: ", "))]"
            return "- \"\(note.title)\" (\(note.createdAt.formatted(date: .abbreviated, time: .omitted)))\(people): \(String(content.prefix(400)))"
        }.joined(separator: "\n")
        
        let tomorrowBlock = tomorrowEvents.filter { !$0.isAllDay }.map { event in
            let time = event.startDate.formatted(date: .omitted, time: .shortened)
            let end = event.endDate.formatted(date: .omitted, time: .shortened)
            let attendees = event.attendeeNames.isEmpty ? "" : " with \(event.attendeeNames.joined(separator: ", "))"
            return "- \(time)–\(end): \(event.title)\(attendees)"
        }.joined(separator: "\n")
        
        let dataPayload = """
        Current time: \(Date.now.formatted(date: .complete, time: .shortened))
        
        Today's Calendar:
        \(calendarBlock.isEmpty ? "No meetings today." : calendarBlock)
        
        Tomorrow's Calendar:
        \(tomorrowBlock.isEmpty ? "No meetings tomorrow." : tomorrowBlock)
        
        To-Dos:
        \(todoBlock)
        
        Email:
        \(emailBlock)
        
        Relevant Meeting Notes (prioritised by attendee overlap with upcoming meetings):
        \(meetingNotesBlock.isEmpty ? "None." : meetingNotesBlock)
        """
        
        let markdownInstructions = """
        
        FORMAT RULES — you MUST follow these exactly:
        - Use ### for section headings (e.g. ### Meetings, ### Action Items)
        - Use **bold** for people's names, meeting titles, and key items
        - Use bullet points (- ) for lists
        - Keep each bullet to one concise line
        - Write a short introductory sentence before each section
        - Use Australian English spelling
        - 2-4 sections, each with 2-5 bullets maximum
        - Be specific — use real names, times, and details from the data
        - Second person ("you"), warm but efficient tone
        """
        
        let system: String
        switch type {
        case .dayAtAGlance:
            system = """
            You are Nest, an intelligent productivity assistant. Give the user a structured, \
            scannable snapshot of their day. Cover: meetings (done vs remaining), progress \
            (what's been accomplished), attention needed (overdue items, important emails), \
            and a clear next step.\(markdownInstructions)
            """
        case .nextMeetingPrep:
            let nextMeeting = todayEvents.filter { !$0.isAllDay && $0.startDate > .now }.first
            let meetingContext = nextMeeting.map { event in
                """
                \nNEXT MEETING: \(event.title) at \(event.startDate.formatted(date: .omitted, time: .shortened))
                Attendees: \(event.attendeeNames.joined(separator: ", "))
                """
            } ?? "\nNo upcoming meetings today."
            system = """
            You are Nest, an intelligent meeting preparation assistant. Prepare the user for \
            their next meeting with structured context: who they're meeting, relevant history, \
            open commitments with those people, and what to focus on. If no meetings remain, \
            suggest what to focus on instead.\(markdownInstructions)\(meetingContext)
            """
        case .tomorrow:
            let dueTomorrow = pendingTodos.filter { todo in
                guard let due = todo.dueDate else { return false }
                return Calendar.current.isDateInTomorrow(due)
            }
            let dueTomorrowBlock = dueTomorrow.isEmpty ? "" :
                "\nTo-dos due tomorrow:\n" + dueTomorrow.prefix(5).map { "- \($0.title) (from: \($0.sourceTitle ?? "unknown"))" }.joined(separator: "\n")
            system = """
            You are Nest, an intelligent productivity assistant. Give the user a clear outlook \
            for tomorrow. Cover: what meetings are scheduled (with who and when), any to-dos due \
            tomorrow or overdue items that will carry over, people they'll be meeting who they \
            have open commitments with, and anything they should prepare tonight. Cross-reference \
            tomorrow's attendees with recent meeting notes and emails to surface key insights \
            (e.g. "You last met with X on [date] — the open item from that was Y"). End with a \
            practical suggestion for how to prepare.\(markdownInstructions)\(dueTomorrowBlock)
            """
        case .endOfDay:
            system = """
            You are Nest, an intelligent productivity assistant. Generate a structured end-of-day \
            recap: meetings that happened, what was accomplished, what carries over to tomorrow, \
            and any emails still needing replies. End with one sentence about tomorrow.\(markdownInstructions)
            """
        case .catchUp:
            system = """
            You are Nest, an intelligent productivity assistant. The user has been away and wants \
            to catch up quickly. Summarise with clear sections: meetings that happened, important \
            emails (especially those needing action), overdue items, and anything time-sensitive \
            coming up. Prioritise by urgency.\(markdownInstructions)
            """
        }
        
        do {
            let body: [String: Any] = [
                "model": Constants.AI.anthropicSonnetModel,
                "max_tokens": 900,
                "system": system,
                "messages": [
                    ["role": "user", "content": dataPayload]
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
                   let event = try? JSONDecoder().decode(StreamEvent.self, from: data) {
                    if event.type == "content_block_delta",
                       let delta = event.delta,
                       let text = delta.text {
                        await MainActor.run {
                            activeSummary += text
                        }
                    }
                }
            }
            
            await MainActor.run {
                isSummaryStreaming = false
            }
            
        } catch {
            print("[NestAI] Summary generation failed: \(error.localizedDescription)")
            await MainActor.run {
                isSummaryStreaming = false
                if activeSummary.isEmpty {
                    activeSummary = ""
                    activeSummaryType = nil
                }
            }
        }
    }
    
    /// Dismiss the active summary.
    @MainActor
    func dismissSummary() {
        activeSummary = ""
        activeSummaryType = nil
        isSummaryStreaming = false
    }
    
    // MARK: - Action Item Context
    
    /// Generate brief AI context for the top action items explaining WHY they matter right now.
    @MainActor
    func generateActionContexts(
        topTodos: [TodoItem],
        todayEvents: [CalendarEvent],
        recentNotes: [Note]
    ) async {
        // Cache for 30 minutes
        if let cached = actionContextCacheDate, Date.now.timeIntervalSince(cached) < 1800, !actionContexts.isEmpty {
            return
        }
        
        guard !topTodos.isEmpty else { return }
        
        let todoSummaries = topTodos.prefix(5).enumerated().map { index, todo in
            let overdue = todo.isOverdue ? " [OVERDUE]" : ""
            let due = todo.dueDate?.formatted(date: .abbreviated, time: .omitted) ?? "no due date"
            let source = todo.sourceTitle ?? "unknown source"
            
            // Find related meeting attendees
            var relatedPeople: [String] = []
            if let sourceId = todo.sourceId, let note = recentNotes.first(where: { $0.id.uuidString == sourceId }) {
                relatedPeople = note.attendees
            }
            
            // Check if related people are in today's meetings
            let inMeetingToday = todayEvents.contains { event in
                !Set(event.attendeeNames).intersection(Set(relatedPeople)).isEmpty
            }
            
            return """
            [\(index + 1)] "\(todo.title)"
            Source: \(source), Due: \(due)\(overdue)
            Related people: \(relatedPeople.isEmpty ? "none" : relatedPeople.joined(separator: ", "))
            Related people in today's meetings: \(inMeetingToday)
            Priority: \(todo.priority.label)
            """
        }.joined(separator: "\n---\n")
        
        let calendarContext = todayEvents.filter({ !$0.isAllDay }).prefix(5).map { event in
            "\(event.startDate.formatted(date: .omitted, time: .shortened)): \(event.title) with \(event.attendeeNames.joined(separator: ", "))"
        }.joined(separator: "\n")
        
        let system = """
        For each to-do item below, write a single SHORT sentence (max 12 words) explaining why \
        it matters RIGHT NOW in the context of today's calendar. Focus on social pressure ("Tom \
        will ask about this at 2pm"), time pressure ("3 days overdue"), or opportunity ("good \
        time to close this before the meeting"). If there's no particular urgency, say why it's \
        still worth doing today. Respond ONLY as a JSON array: [{"index": 1, "context": "..."}]. \
        No other text.
        """
        
        do {
            let body: [String: Any] = [
                "model": Constants.AI.anthropicSonnetModel,
                "max_tokens": 512,
                "system": system,
                "messages": [
                    ["role": "user", "content": "To-dos:\n\(todoSummaries)\n\nToday's calendar:\n\(calendarContext)"]
                ]
            ]
            
            let data = try await AIProxyClient.shared.request(
                provider: .anthropic,
                endpoint: "/v1/messages",
                body: body
            )
            
            let response = try JSONDecoder().decode(AnthropicResponse.self, from: data)
            guard let text = response.content.first?.text else { return }
            
            if let jsonData = text.data(using: .utf8),
               let results = try? JSONDecoder().decode([ActionContextRaw].self, from: jsonData) {
                let todoArray = Array(topTodos.prefix(5))
                for result in results {
                    let idx = result.index - 1
                    guard idx >= 0, idx < todoArray.count else { continue }
                    actionContexts[todoArray[idx].id.uuidString] = result.context
                }
            }
            
            actionContextCacheDate = .now
            print("[NestAI] Generated \(actionContexts.count) action contexts")
            
        } catch {
            print("[NestAI] Action context generation failed: \(error.localizedDescription)")
        }
    }
}

// MARK: - Response Models

struct EmailTriageResult {
    let score: Int
    let reason: String
}

private struct EmailTriageRaw: Decodable {
    let index: Int
    let score: Int
    let reason: String
}

private struct ActionContextRaw: Decodable {
    let index: Int
    let context: String
}

/// Anthropic SSE stream event for content_block_delta.
private struct StreamEvent: Decodable {
    let type: String
    let delta: DeltaContent?
    
    struct DeltaContent: Decodable {
        let type: String?
        let text: String?
    }
}
