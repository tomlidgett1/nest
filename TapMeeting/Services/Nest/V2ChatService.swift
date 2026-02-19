import Foundation
import Supabase

/// Service for the v2 agent chatbot.
/// Handles: sending messages to the v2-chat Edge Function, loading chat history,
/// and subscribing to Supabase Realtime for trigger-pushed messages.
final class V2ChatService: ObservableObject {

    // MARK: - Published State

    @Published var messages: [V2Message] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    // MARK: - Model

    struct V2Message: Identifiable, Equatable {
        let id: String
        let role: String      // "user", "assistant", "system"
        let content: String
        let createdAt: Date
        var style: MessageStyle = .standard

        enum MessageStyle: Equatable {
            case standard
            case status   // lightweight acknowledgement / thinking indicator
        }

        static func == (lhs: V2Message, rhs: V2Message) -> Bool {
            lhs.id == rhs.id
        }
    }

    // MARK: - Pipeline (injected by AppState)

    /// Central RAG pipeline — provides rich, grounded context from all user data.
    /// Injected after auth so the agent knows everything about the user.
    var pipeline: SearchQueryPipeline?
    
    /// Serialised email style context (StyleProfile + global instructions).
    /// Sent with every v2-chat request so the email agent drafts in the user's voice.
    /// Built by AppState from SwiftData StyleProfile + UserDefaults global instructions.
    var emailStyleContext: String?

    // MARK: - Private

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 180
        return URLSession(configuration: config)
    }()

    private var realtimeTask: Task<Void, Never>?
    private var hasSetupTriggers = false

    // MARK: - Init

    init() {}

    // MARK: - Load History

    /// Load chat history from Supabase on first open.
    @MainActor
    func loadHistory() async {
        guard let service = SupabaseService.shared else { return }

        do {
            let response: [ChatMessageRow] = try await service.client
                .from("v2_chat_messages")
                .select()
                .order("created_at", ascending: true)
                .limit(100)
                .execute()
                .value

            self.messages = response.map { row in
                V2Message(
                    id: row.id,
                    role: row.role,
                    content: row.content,
                    createdAt: row.created_at ?? .now
                )
            }
        } catch {
            print("[V2ChatService] Failed to load history: \(error.localizedDescription)")
        }
    }

    // MARK: - Send Message

    /// Send a message to the v2 agent system via the Edge Function.
    /// Delivers the response as a series of short messages to feel like texting.
    @MainActor
    func send(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        isLoading = true
        errorMessage = nil

        // 1. Show user message immediately
        appendMessage(role: "user", content: trimmed)

        // 2. Brief pause → conversational acknowledgement
        await typingPause(seconds: 0.5)
        appendMessage(role: "assistant", content: pickAcknowledgement(for: trimmed), style: .status)

        // 3. Show search status while pipeline runs
        await typingPause(seconds: 0.7)
        appendMessage(role: "assistant", content: searchStatusMessage(for: trimmed), style: .status)

        // 4. Run RAG pipeline (typing indicator stays visible during this)
        let evidenceContext = await gatherPipelineContext(for: trimmed)

        do {
            // 5. Call the Edge Function for the AI response
            let responseText = try await callV2Chat(message: trimmed, evidenceContext: evidenceContext)

            // 6. Split response into conversational chunks and deliver sequentially
            let chunks = splitResponseIntoMessages(responseText)
            for (i, chunk) in chunks.enumerated() {
                if i > 0 {
                    await typingPause(seconds: 0.4)
                }
                appendMessage(role: "assistant", content: chunk)
            }
        } catch {
            let msg = error.localizedDescription
            print("[V2ChatService] Send error: \(msg)")
            errorMessage = "Failed to get response. Please try again."

            appendMessage(role: "system", content: "Something went wrong — \(msg)")
        }

        isLoading = false
    }

    // MARK: - Realtime Subscription

    /// Subscribe to trigger-pushed messages (new email alerts, pre-meeting intel).
    func subscribeToTriggers() async {
        guard !hasSetupTriggers else { return }
        hasSetupTriggers = true

        guard let service = SupabaseService.shared else { return }

        realtimeTask = Task {
            let channel = service.client.realtimeV2.channel("v2-triggers")

            let _ = channel.onPostgresChange(
                InsertAction.self,
                schema: "public",
                table: "v2_chat_messages"
            ) { [weak self] action in
                guard let self else { return }

                let record = action.record

                // Only surface system messages from triggers
                guard let role = record["role"]?.stringValue,
                      role == "system",
                      let content = record["content"]?.stringValue else {
                    return
                }

                let id = record["id"]?.stringValue ?? UUID().uuidString

                Task { @MainActor in
                    // Avoid duplicates
                    guard !self.messages.contains(where: { $0.id == id }) else { return }

                    let msg = V2Message(
                        id: id,
                        role: "system",
                        content: content,
                        createdAt: .now
                    )
                    self.messages.append(msg)
                }
            }

            try? await channel.subscribe()

            // Keep the task alive while subscribed
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }

    /// Clean up realtime subscription.
    func unsubscribe() {
        realtimeTask?.cancel()
        realtimeTask = nil
        hasSetupTriggers = false
    }

    // MARK: - Default Triggers

    /// Create default triggers on first v2 setup.
    func createDefaultTriggersIfNeeded() async {
        guard let service = SupabaseService.shared else { return }

        // Check if triggers already exist
        let existing: [TriggerRow]? = try? await service.client
            .from("v2_triggers")
            .select("id")
            .limit(1)
            .execute()
            .value

        if (existing ?? []).isEmpty {
            // Create default email notification trigger
            try? await service.client
                .from("v2_triggers")
                .insert(NewEmailTrigger(
                    trigger_type: "new_email",
                    action_description: "Notify the user about this new email. Include sender, subject, and a one-line summary.",
                    active: true
                ))
                .execute()

            // Create default pre-meeting intelligence trigger
            try? await service.client
                .from("v2_triggers")
                .insert(NewCalendarTrigger(
                    trigger_type: "calendar_start",
                    minutes_before: 2,
                    action_description: "Surface relevant context from past meetings with these attendees.",
                    active: true
                ))
                .execute()

            print("[V2ChatService] Default triggers created")
        }
    }

    // MARK: - Clear History

    /// Clear all chat messages (for debugging / reset).
    @MainActor
    func clearHistory() async {
        guard let service = SupabaseService.shared else { return }

        do {
            try await service.client
                .from("v2_chat_messages")
                .delete()
                .neq("id", value: "00000000-0000-0000-0000-000000000000")
                .execute()

            messages.removeAll()
        } catch {
            print("[V2ChatService] Clear history error: \(error.localizedDescription)")
        }
    }

    // MARK: - Multi-Message Helpers

    /// Append a message to the local messages array.
    @MainActor
    private func appendMessage(role: String, content: String, style: V2Message.MessageStyle = .standard) {
        messages.append(V2Message(
            id: UUID().uuidString,
            role: role,
            content: content,
            createdAt: .now,
            style: style
        ))
    }

    /// Small delay to simulate the bot "typing" between messages.
    private func typingPause(seconds: Double) async {
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    /// Pick a natural-sounding acknowledgement based on the query topic.
    private func pickAcknowledgement(for query: String) -> String {
        let q = query.lowercased()

        if q.contains("email") || q.contains("draft") || q.contains("mail") {
            return ["Let me look through your emails…",
                    "Checking your email history…",
                    "Pulling up your emails…"].randomElement()!
        }
        if q.contains("meeting") || q.contains("1:1") || q.contains("call") || q.contains("sync") || q.contains("standup") {
            return ["Let me check your meeting notes…",
                    "Looking through your meetings…",
                    "Pulling up your meeting history…"].randomElement()!
        }
        if q.contains("summar") {
            return ["Let me put that summary together…",
                    "Working on that summary now…"].randomElement()!
        }
        return ["Let me check that for you…",
                "Looking into that now…",
                "Good question — let me find out…",
                "One sec, searching your data…",
                "Let me pull that up…"].randomElement()!
    }

    /// Context-aware search status message.
    private func searchStatusMessage(for query: String) -> String {
        let q = query.lowercased()
        if q.contains("email") || q.contains("mail") {
            return "Searching your emails and meeting notes…"
        }
        if q.contains("meeting") || q.contains("1:1") || q.contains("call") {
            return "Searching your meetings and transcripts…"
        }
        return "Searching your meetings and notes…"
    }

    /// Split a long AI response into shorter conversational chunks so the
    /// chat feels like texting rather than one big wall of text.
    private func splitResponseIntoMessages(_ text: String) -> [String] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [trimmed] }

        // Split by double newlines (paragraph breaks)
        let paragraphs = trimmed.components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        // Single short paragraph — send as one message
        guard paragraphs.count > 1 else { return [trimmed] }

        // Group small paragraphs together so we don't send dozens of tiny messages
        var chunks: [String] = []
        var buffer = ""

        for para in paragraphs {
            if buffer.isEmpty {
                buffer = para
            } else if buffer.count + para.count < 200 {
                buffer += "\n\n" + para
            } else {
                chunks.append(buffer)
                buffer = para
            }
        }
        if !buffer.isEmpty {
            chunks.append(buffer)
        }

        // If we'd send more than 5 chunks, fall back to a single message
        guard chunks.count <= 5 else { return [trimmed] }

        return chunks
    }

    // MARK: - Pipeline Context Gathering

    /// Run the full RAG pipeline on the user's query to gather rich evidence
    /// from meetings, notes, emails, calendar — everything the user has indexed.
    /// Returns a serialised context string the agent can reason over.
    private func gatherPipelineContext(for query: String) async -> String? {
        guard let pipeline else {
            print("[V2ChatService] No pipeline available — agent will use server-side search only")
            return nil
        }

        do {
            // Build conversation history from recent messages for coreference resolution
            let recentHistory = messages.suffix(10).compactMap { msg -> SemanticChatMessage? in
                guard let role = SemanticChatMessage.Role(rawValue: msg.role) else { return nil }
                return SemanticChatMessage(role: role, content: msg.content)
            }

            let options = SearchQueryPipeline.QueryOptions(
                conversationHistory: recentHistory,
                sourceFilters: SearchSourceType.allCases,
                maxEvidenceBlocks: 12,
                enableLLMRewrite: true,
                enableTemporalResolution: true,
                enableAgenticFallback: true
            )

            let result = try await pipeline.execute(query: query, options: options)

            guard !result.evidence.isEmpty else {
                print("[V2ChatService] Pipeline returned no evidence for: \(query.prefix(60))")
                return nil
            }

            // Serialise evidence blocks using the same structured format as the main Ask Nest search
            var contextParts: [String] = []
            contextParts.append("Cited context (from semantic search, ordered by relevance):\n")

            for (i, block) in result.evidence.enumerated() {
                let relevancePct = String(format: "%.0f%%", block.semanticScore * 100)
                let entry = """
                [\(i + 1)] \(block.title) — Relevance: \(relevancePct)
                Source: \(block.sourceType) | ID: \(block.sourceId)
                Details: \(block.text)
                """
                contextParts.append(entry)
            }

            // Temporal context if available
            if let temporal = result.metadata.temporalRange {
                contextParts.append("\nTemporal context: \(temporal.label)")
            }

            let context = contextParts.joined(separator: "\n")
            print("[V2ChatService] Pipeline gathered \(result.evidence.count) evidence blocks (\(context.count) chars)")
            return context
        } catch {
            print("[V2ChatService] Pipeline error (falling back to server-side search): \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Private Helpers

    /// Call the v2-chat Edge Function directly via HTTP (matches AIProxyClient pattern).
    private func callV2Chat(message: String, evidenceContext: String? = nil) async throws -> String {
        guard let service = SupabaseService.shared else {
            throw V2ChatError.notAuthenticated
        }

        guard let jwt = await service.supabaseAccessTokenForFunctionCall() else {
            throw V2ChatError.notAuthenticated
        }

        let url = URL(string: "\(Constants.Supabase.functionsBaseURL)/v2-chat-service")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
        request.setValue(Constants.Supabase.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = ["message": message]
        if let evidenceContext {
            body["evidence_context"] = evidenceContext
        }
        if let emailStyleContext {
            body["email_style_context"] = emailStyleContext
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let http = response as? HTTPURLResponse else {
            throw V2ChatError.invalidResponse
        }

        guard (200...299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            print("[V2ChatService] Edge Function error (\(http.statusCode)): \(body.prefix(300))")
            throw V2ChatError.serverError(http.statusCode, body.prefix(300).description)
        }

        guard let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let responseText = parsed["response"] as? String else {
            throw V2ChatError.invalidResponse
        }

        return responseText
    }
}

// MARK: - Error

enum V2ChatError: LocalizedError {
    case notAuthenticated
    case invalidResponse
    case serverError(Int, String)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "You must be signed in to use the agent."
        case .invalidResponse:
            return "Received an invalid response from the server."
        case .serverError(let code, let detail):
            return "Server error (\(code)): \(detail)"
        }
    }
}

// MARK: - Decodable Rows

private struct ChatMessageRow: Decodable {
    let id: String
    let role: String
    let content: String
    let created_at: Date?
    let agents_used: [String]?
}

private struct TriggerRow: Decodable {
    let id: String
}

private struct NewEmailTrigger: Encodable {
    let trigger_type: String
    let action_description: String
    let active: Bool
}

private struct NewCalendarTrigger: Encodable {
    let trigger_type: String
    let minutes_before: Int
    let action_description: String
    let active: Bool
}
