import Foundation

/// AI service for extracting actionable to-do items from meeting notes and emails.
///
/// Uses the Anthropic Messages API (Claude) — same provider as EmailAIService.
/// Extracts only tasks assigned to / expected of the user.
final class TodoExtractionService {
    
    // MARK: - Networking
    
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 120
        config.waitsForConnectivity = true
        return URLSession(configuration: config)
    }()
    
    private let maxRetries = 2
    
    // MARK: - Extract from Meeting Notes
    
    /// Extract to-do items from AI-enhanced meeting notes.
    /// Only extracts tasks that are assigned to or expected of the user.
    func extractFromMeetingNotes(
        enhancedNotes: String,
        noteTitle: String,
        noteId: UUID
    ) async throws -> [TodoItem] {
        let apiKey = try getAPIKey()
        
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
        
        let request = try buildAnthropicRequest(
            apiKey: apiKey,
            system: systemPrompt,
            userContent: userContent,
            maxTokens: Constants.AI.maxTodoExtractionTokens
        )
        
        let response = try await executeRequest(request)
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
    ///
    /// - Parameters:
    ///   - message: The specific new email message to analyse.
    ///   - threadId: The Gmail thread ID (used as `sourceId`).
    ///   - userEmail: The user's own email address, so the AI can determine
    ///     whether requests are directed at the user or at other recipients.
    ///   - existingTodoTitles: Titles of to-dos already created for this thread.
    ///     Passed to the AI so it can avoid extracting duplicate tasks.
    func extractFromEmail(
        message: GmailMessage,
        threadId: String,
        userEmail: String,
        existingTodoTitles: [String] = []
    ) async throws -> [TodoItem] {
        let apiKey = try getAPIKey()
        
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
        
        // Determine if the user is a direct recipient (To) or just CC'd
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
        
        let systemPrompt = """
        You are a task extraction assistant. Analyse the email below and extract actionable to-do items that require the USER's action.

        The user's email address is: \(userEmail)

        Rules:
        - Only extract NEW tasks from the LATEST message content — ignore quoted/forwarded text (lines starting with ">", "On ... wrote:", or indented replies).
        - Only extract tasks that the USER (identified above) personally needs to do.
        - Do NOT extract tasks that are directed at other recipients. Pay close attention to the To and CC fields — if the user is CC'd and the request is for someone else, return [].
        - If the email asks "someone" or a specific other person to do something, that is NOT the user's to-do.
        - If this is a newsletter, marketing email, automated notification, receipt, or non-actionable message, return an empty array [].
        - Do NOT duplicate tasks that already exist (see "Already-Tracked To-Dos" section below, if present). A task is a duplicate if it refers to the same underlying request, even if worded differently.
        - Each to-do should be a clear, actionable task.
        - Extract deadlines when mentioned.
        - Assign priority: "high" for urgent requests, "low" for FYI/optional, "medium" for standard requests.
        - Use Australian English spelling.
        \(recipientContext)\(existingTodosContext)

        Return ONLY a JSON array of objects. Each object must have:
        - "title": string — short task description (imperative voice)
        - "details": string or null — additional context
        - "dueDate": string (ISO 8601) or null
        - "priority": "high" | "medium" | "low"
        - "sourceSnippet": string — brief excerpt from the NEW message content showing the request

        Return valid JSON array only, no markdown fences. Return [] if no NEW actionable items for the user.
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
        
        let request = try buildAnthropicRequest(
            apiKey: apiKey,
            system: systemPrompt,
            userContent: userContent,
            maxTokens: Constants.AI.maxTodoExtractionTokens
        )
        
        let response = try await executeRequest(request)
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
    /// Looks up existing to-do titles per thread so the AI avoids duplicates.
    ///
    /// - Parameters:
    ///   - messages: Array of (message, threadId, userEmail) tuples to process.
    ///   - existingTodosByThread: Dictionary mapping threadId → list of existing to-do titles.
    func extractFromEmails(
        _ messages: [(message: GmailMessage, threadId: String, userEmail: String)],
        existingTodosByThread: [String: [String]] = [:]
    ) async -> [TodoItem] {
        var allTodos: [TodoItem] = []
        
        // Process in parallel with a concurrency limit of 3
        await withTaskGroup(of: [TodoItem].self) { group in
            for (index, item) in messages.enumerated() {
                // Limit concurrent extractions
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
                            existingTodoTitles: existingTitles
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
    
    // MARK: - Anthropic API
    
    private func getAPIKey() throws -> String {
        let apiKey = KeychainHelper.get(key: Constants.Keychain.anthropicAPIKey) ?? ""
        guard !apiKey.isEmpty else {
            throw TodoExtractionError.missingAPIKey
        }
        return apiKey
    }
    
    private func buildAnthropicRequest(
        apiKey: String,
        system: String,
        userContent: String,
        maxTokens: Int
    ) throws -> URLRequest {
        let url = URL(string: Constants.AI.anthropicEndpoint)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(Constants.AI.anthropicVersion, forHTTPHeaderField: "anthropic-version")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = AnthropicRequest(
            model: Constants.AI.anthropicModel,
            max_tokens: maxTokens,
            system: system,
            messages: [AnthropicMessage(role: "user", content: userContent)]
        )
        
        request.httpBody = try JSONEncoder().encode(body)
        return request
    }
    
    private func executeRequest(_ request: URLRequest) async throws -> String {
        let (data, _) = try await performRequest(request)
        let apiResponse = try JSONDecoder().decode(AnthropicResponse.self, from: data)
        
        guard let text = apiResponse.content.first(where: { $0.type == "text" })?.text?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else {
            throw TodoExtractionError.emptyResponse
        }
        
        return text
    }
    
    private func performRequest(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        var lastError: Error?
        
        for attempt in 0...maxRetries {
            do {
                let (data, response) = try await session.data(for: request)
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw TodoExtractionError.apiError("Invalid response from server")
                }
                
                if (400...499).contains(httpResponse.statusCode) {
                    let body = String(data: data, encoding: .utf8) ?? ""
                    throw TodoExtractionError.apiError("Request rejected (\(httpResponse.statusCode)): \(body)")
                }
                
                guard (200...299).contains(httpResponse.statusCode) else {
                    throw TodoExtractionError.apiError("Server error (\(httpResponse.statusCode))")
                }
                
                return (data, httpResponse)
                
            } catch let error as TodoExtractionError {
                throw error
            } catch {
                lastError = error
                if attempt < maxRetries {
                    let delay = UInt64(pow(2.0, Double(attempt))) * 1_000_000_000
                    try await Task.sleep(nanoseconds: delay)
                }
            }
        }
        
        throw TodoExtractionError.networkError(lastError)
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

// MARK: - Anthropic API Types (private to this service)

private struct AnthropicRequest: Encodable {
    let model: String
    let max_tokens: Int
    let system: String
    let messages: [AnthropicMessage]
}

private struct AnthropicMessage: Encodable {
    let role: String
    let content: String
}

private struct AnthropicResponse: Decodable {
    let content: [ContentBlock]
    
    struct ContentBlock: Decodable {
        let type: String
        let text: String?
    }
}

// MARK: - Errors

enum TodoExtractionError: LocalizedError {
    case missingAPIKey
    case apiError(String)
    case emptyResponse
    case networkError(Error?)
    
    var errorDescription: String? {
        switch self {
        case .missingAPIKey:
            return "Anthropic API key not configured."
        case .apiError(let message):
            return "To-do extraction failed: \(message)"
        case .emptyResponse:
            return "AI returned an empty response."
        case .networkError(let underlying):
            let detail = underlying?.localizedDescription ?? "Unknown error"
            return "Network error: \(detail)"
        }
    }
}
