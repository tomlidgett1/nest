import Foundation

/// AI service for extracting actionable to-do items from meeting notes and emails.
///
/// Uses the Anthropic Messages API (Claude) via server-side proxy.
/// Extracts only tasks assigned to / expected of the user.
final class TodoExtractionService {
    
    // MARK: - Extract from Meeting Notes
    
    /// Extract to-do items from AI-enhanced meeting notes.
    /// Only extracts tasks that are assigned to or expected of the user.
    func extractFromMeetingNotes(
        enhancedNotes: String,
        noteTitle: String,
        noteId: UUID
    ) async throws -> [TodoItem] {
        let systemPrompt = """
        You are a task extraction assistant. Analyse the meeting notes below and extract actionable to-do items that are assigned to or expected of the user (the person who recorded these notes).

        Rules:
        - Only extract tasks for the user — NOT tasks assigned to other attendees.
        - If a task owner is unclear or ambiguous, skip it.
        - Look for explicit action items (## Next Steps, ## Action Items sections) AND implicit commitments in the body (e.g. "I'll send the deck", "I need to review").
        - Each to-do should be a clear, actionable task — not a vague note.
        - Extract deadlines when mentioned (convert relative dates like "by Friday" to ISO 8601 using today's date).
        - Assign priority: "high" for urgent/deadline-driven tasks, "low" for nice-to-haves, "medium" for everything else.
        - If no actionable items exist for the user, return an empty array.
        - Use Australian English spelling.

        Return ONLY a JSON array of objects. Each object must have:
        - "title": string — short task description (imperative voice, e.g. "Send budget spreadsheet to Sarah")
        - "details": string or null — additional context
        - "dueDate": string (ISO 8601) or null — extracted deadline
        - "priority": "high" | "medium" | "low"
        - "sourceSnippet": string — brief excerpt (1-2 sentences) from the notes showing where this to-do came from

        Return valid JSON array only, no markdown fences.
        """
        
        let userContent = """
        Meeting: \(noteTitle)
        Today's date: \(todayISO())

        --- Enhanced Notes ---
        \(enhancedNotes.prefix(12000))
        --- End of Notes ---

        Extract to-do items for the user.
        """
        
        let response = try await callAnthropic(
            system: systemPrompt,
            userContent: userContent,
            maxTokens: Constants.AI.maxTodoExtractionTokens
        )
        
        return parseTodoItems(
            from: response,
            sourceType: .meeting,
            sourceId: noteId.uuidString,
            sourceTitle: noteTitle
        )
    }
    
    // MARK: - Extract from Email
    
    /// Extract to-do items from an email message.
    /// Only extracts tasks that require the user's action.
    /// Returns an empty array for newsletters, marketing, notifications, etc.
    func extractFromEmail(
        message: GmailMessage,
        threadId: String,
        userEmail: String,
        existingTodoTitles: [String] = [],
        excludedCategories: Set<EmailCategory> = []
    ) async throws -> [TodoItem] {
        let existingTodosContext: String
        if existingTodoTitles.isEmpty {
            existingTodosContext = ""
        } else {
            let list = existingTodoTitles.enumerated()
                .map { "  \($0.offset + 1). \($0.element)" }
                .joined(separator: "\n")
            existingTodosContext = """

            ## Already-Tracked To-Dos for This Thread
            The following tasks have ALREADY been extracted from earlier messages in this thread. Do NOT create duplicates of these — even if they are rephrased or referenced again in the new message. Only extract genuinely NEW tasks.
            \(list)
            """
        }
        
        let userLower = userEmail.lowercased()
        let isDirectRecipient = message.to.contains { $0.lowercased() == userLower }
        let isCCRecipient = message.cc.contains { $0.lowercased() == userLower }
        let isSender = message.fromEmail.lowercased() == userLower
        
        let recipientContext: String
        if isSender {
            recipientContext = """

            ## Recipient Context
            The user SENT this email. Only extract to-dos if the user committed to doing something themselves (e.g. "I'll send this over", "Let me check and get back to you"). Do NOT extract tasks that the user is asking someone else to do.
            """
        } else if isCCRecipient && !isDirectRecipient {
            recipientContext = """

            ## Recipient Context
            IMPORTANT: The user is only CC'd on this email — they are NOT a direct recipient. The email is addressed to: \(message.to.joined(separator: ", ")).
            Only extract a to-do if the email EXPLICITLY asks the user by name/email to do something, or if it says "all" / "everyone" should do something.
            If the request is directed at the To recipients and the user is just being kept in the loop, return an empty array [].
            Most CC'd emails require NO action from the user — when in doubt, return [].
            """
        } else {
            recipientContext = """

            ## Recipient Context
            The user is a direct recipient (in the To field) of this email.
            """
        }
        
        let excludedCategoriesContext: String
        if excludedCategories.isEmpty {
            excludedCategoriesContext = ""
        } else {
            let labels = excludedCategories.map(\.label).sorted().joined(separator: ", ")
            excludedCategoriesContext = """

            ## Excluded Email Categories
            The user has explicitly excluded the following email categories from to-do extraction: \(labels).
            If this email falls into any of those categories, return an empty array [] — even if the email contains actionable content.
            For example: if "Meeting Invites" is excluded, do NOT extract to-dos from calendar invitations, event RSVPs, or meeting scheduling emails.
            """
        }
        
        let systemPrompt = """
        You are an extremely strict task extraction assistant. You ONLY extract tasks when a real human has personally and explicitly asked the user to do something specific. You are skeptical by default — when in doubt, return [].

        The user's email address is: \(userEmail)

        ## CRITICAL: What is NOT a to-do (return [] for ALL of these)
        - Marketing emails, promotions, feature announcements ("Try our new feature", "Check out what's new")
        - Newsletters, digests, roundups, blog post notifications
        - Automated notifications (verification codes, OTPs, password resets, sign-in alerts, security alerts)
        - Receipts, invoices, order confirmations, shipping updates, delivery notifications
        - Subscription confirmations or cancellations
        - Social media notifications (likes, comments, follows, connection requests)
        - Calendar invitations or event reminders (these are handled by the calendar, not to-dos)
        - System alerts, server notifications, CI/CD notifications, build reports
        - Bank statements, account alerts, transaction notifications, financial summaries
        - App notifications (Slack digests, Jira updates, GitHub notifications, etc.)
        - Emails from a "noreply@" or "no-reply@" address
        - Emails that simply share information, news, or updates without asking the user to do anything
        - Emails that say "FYI", "for your information", "just letting you know", "heads up"
        - Generic CTAs like "Click here", "Learn more", "View details", "Update your preferences"
        - Emails with unsubscribe links in the footer (strong signal it's marketing/automated)

        ## What IS a to-do (only these qualify)
        A to-do MUST meet ALL of these criteria:
        1. A specific real person (not an automated system) has written to the user
        2. They are explicitly asking the user to perform a concrete action
        3. The request requires the user's conscious effort, judgement, or time to complete
        4. NOT responding would have real consequences (missed deadline, broken commitment, blocked colleague)

        Examples of genuine to-dos:
        - "Can you review this proposal and send feedback by Friday?"
        - "Please send me the Q4 report"
        - "We need you to approve the budget before we can proceed"
        - "Could you hop on a call tomorrow to discuss the project?"

        Examples that are NOT to-dos (return []):
        - "Your verification code is 123456" → NOT a to-do
        - "Try our exciting new feature!" → NOT a to-do
        - "Your monthly statement is ready" → NOT a to-do
        - "Here's a summary of your recent activity" → NOT a to-do
        - "Your order has shipped" → NOT a to-do
        - "Reminder: your subscription renews tomorrow" → NOT a to-do
        - "John mentioned you in a comment" → NOT a to-do

        ## Additional rules
        - Only extract from the LATEST message content — ignore quoted/forwarded text (lines starting with ">", "On ... wrote:", or indented replies).
        - Only extract tasks directed at the USER personally. If the request is for someone else, return [].
        - Do NOT duplicate tasks that already exist (see below if present).
        - Assign priority: "high" for urgent requests with deadlines, "low" for nice-to-have, "medium" for standard requests.
        - Use Australian English spelling.
        - When in doubt, return []. It is FAR better to miss a to-do than to create a false one.
        \(recipientContext)\(existingTodosContext)\(excludedCategoriesContext)

        Return ONLY a JSON array of objects. Each object must have:
        - "title": string — short task description (imperative voice)
        - "details": string or null — additional context
        - "dueDate": string (ISO 8601) or null
        - "priority": "high" | "medium" | "low"
        - "sourceSnippet": string — brief excerpt showing the SPECIFIC request from a real person

        Return valid JSON array only, no markdown fences. Return [] if no genuine to-dos.
        """
        
        let bodyText = message.bodyPlain.isEmpty ? message.snippet : message.bodyPlain
        
        let userContent = """
        From: \(message.from) <\(message.fromEmail)>
        To: \(message.to.joined(separator: ", "))
        CC: \(message.cc.isEmpty ? "(none)" : message.cc.joined(separator: ", "))
        Subject: \(message.subject)
        Date: \(formattedDate(message.date))
        Today's date: \(todayISO())

        --- NEW MESSAGE CONTENT (extract tasks ONLY from this) ---
        \(String(bodyText.prefix(6000)))
        --- END OF NEW MESSAGE ---
        """
        
        let response = try await callAnthropic(
            system: systemPrompt,
            userContent: userContent,
            maxTokens: Constants.AI.maxTodoExtractionTokens
        )
        
        return parseTodoItems(
            from: response,
            sourceType: .email,
            sourceId: threadId,
            sourceTitle: message.subject,
            senderEmail: message.fromEmail
        )
    }
    
    // MARK: - Batch Extract from Emails
    
    /// Extract to-dos from multiple email messages, with deduplication awareness.
    func extractFromEmails(
        _ messages: [(message: GmailMessage, threadId: String, userEmail: String)],
        existingTodosByThread: [String: [String]] = [:],
        excludedCategories: Set<EmailCategory> = []
    ) async -> [TodoItem] {
        var allTodos: [TodoItem] = []
        
        await withTaskGroup(of: [TodoItem].self) { group in
            for (index, item) in messages.enumerated() {
                if index >= 3 {
                    if let result = await group.next() {
                        allTodos.append(contentsOf: result)
                    }
                }
                
                let existingTitles = existingTodosByThread[item.threadId] ?? []
                
                group.addTask {
                    do {
                        return try await self.extractFromEmail(
                            message: item.message,
                            threadId: item.threadId,
                            userEmail: item.userEmail,
                            existingTodoTitles: existingTitles,
                            excludedCategories: excludedCategories
                        )
                    } catch {
                        print("[TodoExtraction] Email extraction failed for '\(item.message.subject)': \(error.localizedDescription)")
                        return []
                    }
                }
            }
            
            for await result in group {
                allTodos.append(contentsOf: result)
            }
        }
        
        return allTodos
    }
    
    // MARK: - Anthropic API via Proxy
    
    private func callAnthropic(system: String, userContent: String, maxTokens: Int) async throws -> String {
        let body: [String: Any] = [
            "model": Constants.AI.anthropicModel,
            "max_tokens": maxTokens,
            "system": system,
            "messages": [
                ["role": "user", "content": userContent]
            ]
        ]
        
        let data = try await AIProxyClient.shared.request(
            provider: .anthropic,
            endpoint: "/v1/messages",
            body: body
        )
        
        let apiResponse = try JSONDecoder().decode(AnthropicResponse.self, from: data)
        
        guard let text = apiResponse.content.first(where: { $0.type == "text" })?.text?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else {
            throw AIProxyError.emptyResponse
        }
        
        return text
    }
    
    // MARK: - Response Parser
    
    private func parseTodoItems(
        from response: String,
        sourceType: TodoItem.SourceType,
        sourceId: String,
        sourceTitle: String,
        senderEmail: String? = nil
    ) -> [TodoItem] {
        let cleaned = response
            .replacingOccurrences(of: "```json", with: "")
            .replacingOccurrences(of: "```", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        
        guard let data = cleaned.data(using: .utf8),
              let array = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            print("[TodoExtraction] Failed to parse JSON response")
            return []
        }
        
        return array.compactMap { item in
            guard let title = item["title"] as? String, !title.isEmpty else { return nil }
            
            let details = item["details"] as? String
            let priorityStr = item["priority"] as? String ?? "medium"
            let priority = TodoItem.Priority(rawValue: priorityStr) ?? .medium
            let sourceSnippet = item["sourceSnippet"] as? String
            
            var dueDate: Date?
            if let dueDateStr = item["dueDate"] as? String, !dueDateStr.isEmpty {
                dueDate = parseISO8601Date(dueDateStr)
            }
            
            return TodoItem(
                title: title,
                details: details,
                dueDate: dueDate,
                priority: priority,
                sourceType: sourceType,
                sourceId: sourceId,
                sourceTitle: sourceTitle,
                sourceSnippet: sourceSnippet,
                senderEmail: senderEmail
            )
        }
    }
    
    // MARK: - Helpers
    
    private func todayISO() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return formatter.string(from: Date.now)
    }
    
    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMM yyyy, h:mm a"
        return formatter.string(from: date)
    }
    
    private func parseISO8601Date(_ string: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: string) { return date }
        
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: string) { return date }
        
        formatter.formatOptions = [.withFullDate]
        return formatter.date(from: string)
    }
}

// MARK: - Anthropic Response Type (shared across Anthropic services)

struct AnthropicResponse: Decodable {
    let content: [ContentBlock]
    
    struct ContentBlock: Decodable {
        let type: String
        let text: String?
    }
}
