import Foundation
import SwiftData

/// AI service for all email intelligence tasks.
///
/// Uses the Anthropic Messages API (Claude) via server-side proxy.
/// Handles: reply, compose, summarise, classify, style analysis, and meeting follow-up.
///
/// When initialised with a `SearchQueryPipeline`, every AI feature gains grounded,
/// context-aware intelligence from the user's indexed meetings, notes, calendar,
/// and email history. Without the pipeline, behaviour is unchanged (backward-compatible).
final class EmailAIService {
    
    // MARK: - Pipeline (Semantic Context)
    
    private let pipeline: SearchQueryPipeline?
    
    init(pipeline: SearchQueryPipeline? = nil) {
        self.pipeline = pipeline
    }
    
    // MARK: - Debug Info
    
    /// Diagnostic snapshot captured after each AI operation for UI debugging.
    struct DebugInfo {
        let pipelineAvailable: Bool
        let searchQuery: String
        let evidenceCount: Int
        let evidenceTitles: [String]
        let temporalLabel: String?
        let anthropicResponsePreview: String
        let error: String?
    }
    
    /// Last debug snapshot — read by views to show a debug panel.
    /// Updated on the calling task so it's available immediately after the call.
    private(set) var lastDebugInfo: DebugInfo?
    
    /// Capture a debug snapshot from a pipeline fetch and LLM response.
    private func captureDebugInfo(fetchResult: SemanticFetchResult, responsePreview: String) {
        lastDebugInfo = DebugInfo(
            pipelineAvailable: pipeline != nil,
            searchQuery: fetchResult.searchQuery,
            evidenceCount: fetchResult.evidenceCount,
            evidenceTitles: fetchResult.evidenceTitles,
            temporalLabel: fetchResult.temporalLabel,
            anthropicResponsePreview: String(responsePreview.prefix(300)),
            error: fetchResult.error
        )
    }
    
    // MARK: - Task Types
    
    enum EmailAITask {
        case reply(thread: [GmailMessage], replyToIndex: Int)
        case compose(prompt: String)
        case summarise(thread: [GmailMessage])
        case classify(message: GmailMessage)
        case analyseStyle(sentEmails: [GmailMessage])
        case meetingFollowUp(noteTitle: String, enhancedNotes: String, attendees: [String])
    }
    
    /// Variant for multi-draft generation.
    enum DraftVariant: String, CaseIterable, Identifiable {
        case concise = "Concise"
        case standard = "Standard"
        case detailed = "Detailed"
        
        var id: String { rawValue }
        
        var guidance: String {
            switch self {
            case .concise:
                return "Write the shortest reasonable reply — 1-3 sentences. Get straight to the point. No filler."
            case .standard:
                return "Write a natural-length reply matching the user's typical style. Usually 2-5 sentences."
            case .detailed:
                return "Write a thorough response that addresses all points raised. Use paragraphs or bullet points as appropriate. 5-10 sentences."
            }
        }
    }
    
    /// Result of a multi-draft generation.
    struct MultiDraftResult {
        var concise: String = ""
        var standard: String = ""
        var detailed: String = ""
        
        func draft(for variant: DraftVariant) -> String {
            switch variant {
            case .concise: return concise
            case .standard: return standard
            case .detailed: return detailed
            }
        }
        
        mutating func set(_ text: String, for variant: DraftVariant) {
            switch variant {
            case .concise: concise = text
            case .standard: standard = text
            case .detailed: detailed = text
            }
        }
    }
    
    /// Suggested quick action for an email.
    struct SuggestedAction: Identifiable {
        let id = UUID()
        let label: String
        let icon: String
        let instruction: String
    }
    
    // MARK: - Anthropic API via Proxy
    
    private func callAnthropic(system: String, userContent: String, maxTokens: Int) async throws -> String {
        let systemCharCount = system.count
        let userCharCount = userContent.count
        print("[EmailAIService] Calling Anthropic — system: \(systemCharCount) chars, user: \(userCharCount) chars, maxTokens: \(maxTokens)")
        
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
            print("[EmailAIService] Anthropic returned empty response")
            throw AIProxyError.emptyResponse
        }
        
        print("[EmailAIService] Anthropic responded — \(text.count) chars: \(text.prefix(120))…")
        return text
    }
    
    // MARK: - Generate Reply (Single Variant)
    
    /// Generate a single AI draft reply to an email thread.
    ///
    /// When a `SearchQueryPipeline` is available, fetches grounded evidence from meetings,
    /// notes, calendar, and prior email threads to produce context-aware replies.
    /// The user's one-off instructions are included in the pipeline query so temporal
    /// references (e.g. "tomorrow", "this week") and topical keywords trigger the
    /// correct retrieval (calendar injection, related notes, etc.).
    func generateReply(
        thread: [GmailMessage],
        replyToIndex: Int? = nil,
        variant: DraftVariant = .standard,
        styleProfile: StyleProfile? = nil,
        globalInstructions: String? = nil,
        contactInstructions: String? = nil,
        oneOffInstructions: String? = nil
    ) async throws -> String {
        let idx = replyToIndex ?? (thread.count - 1)
        let targetMessage = thread[idx]
        
        let fetchResult = await fetchSemanticContext(
            for: buildReplySearchQuery(
                targetMessage: targetMessage,
                oneOffInstructions: oneOffInstructions
            )
        )
        
        let reply = try await generateReplyWithContext(
            thread: thread,
            replyToIndex: idx,
            variant: variant,
            styleProfile: styleProfile,
            globalInstructions: globalInstructions,
            contactInstructions: contactInstructions,
            oneOffInstructions: oneOffInstructions,
            semanticContext: fetchResult.context
        )
        
        captureDebugInfo(fetchResult: fetchResult, responsePreview: reply)
        return reply
    }
    
    /// Internal variant that accepts pre-fetched semantic context, avoiding redundant
    /// pipeline calls when generating multiple variants for the same email.
    private func generateReplyWithContext(
        thread: [GmailMessage],
        replyToIndex: Int,
        variant: DraftVariant,
        styleProfile: StyleProfile?,
        globalInstructions: String?,
        contactInstructions: String?,
        oneOffInstructions: String?,
        semanticContext: String?
    ) async throws -> String {
        let systemPrompt = buildReplySystemPrompt(
            variant: variant,
            styleProfile: styleProfile,
            globalInstructions: globalInstructions,
            contactInstructions: contactInstructions,
            oneOffInstructions: oneOffInstructions,
            semanticContext: semanticContext
        )
        
        let userContent = buildThreadContext(thread: thread, replyToIndex: replyToIndex)
        
        return try await callAnthropic(
            system: systemPrompt,
            userContent: userContent,
            maxTokens: Constants.AI.maxEmailReplyTokens
        )
    }
    
    // MARK: - Generate Multi-Draft Reply
    
    /// Generate 3 variants (concise, standard, detailed) in parallel.
    ///
    /// Fetches semantic context once upfront (including the user's one-off instructions
    /// for temporal/topical awareness), then shares it across all 3 variant generations.
    func generateMultiDraft(
        thread: [GmailMessage],
        replyToIndex: Int? = nil,
        styleProfile: StyleProfile? = nil,
        globalInstructions: String? = nil,
        contactInstructions: String? = nil,
        oneOffInstructions: String? = nil
    ) async throws -> MultiDraftResult {
        let idx = replyToIndex ?? (thread.count - 1)
        let targetMessage = thread[idx]
        
        let fetchResult = await fetchSemanticContext(
            for: buildReplySearchQuery(
                targetMessage: targetMessage,
                oneOffInstructions: oneOffInstructions
            )
        )
        captureDebugInfo(fetchResult: fetchResult, responsePreview: "(multi-draft pending)")
        
        var result = MultiDraftResult()
        
        try await withThrowingTaskGroup(of: (DraftVariant, String).self) { group in
            for variant in DraftVariant.allCases {
                group.addTask {
                    let draft = try await self.generateReplyWithContext(
                        thread: thread,
                        replyToIndex: idx,
                        variant: variant,
                        styleProfile: styleProfile,
                        globalInstructions: globalInstructions,
                        contactInstructions: contactInstructions,
                        oneOffInstructions: oneOffInstructions,
                        semanticContext: fetchResult.context
                    )
                    return (variant, draft)
                }
            }
            
            for try await (variant, text) in group {
                result.set(text, for: variant)
            }
        }
        
        return result
    }
    
    // MARK: - Generate Single Variant
    
    /// Regenerate a single variant from a multi-draft set.
    func regenerateSingleVariant(
        variant: DraftVariant,
        thread: [GmailMessage],
        replyToIndex: Int? = nil,
        styleProfile: StyleProfile? = nil,
        globalInstructions: String? = nil,
        contactInstructions: String? = nil,
        oneOffInstructions: String? = nil
    ) async throws -> String {
        try await generateReply(
            thread: thread,
            replyToIndex: replyToIndex,
            variant: variant,
            styleProfile: styleProfile,
            globalInstructions: globalInstructions,
            contactInstructions: contactInstructions,
            oneOffInstructions: oneOffInstructions
        )
    }
    
    // MARK: - Compose (New Email)
    
    /// Generate a new email from a natural language prompt.
    ///
    /// When a pipeline is available, the user's prompt is used as a semantic query to
    /// retrieve relevant context (e.g. "Email Sarah about yesterday's standup" retrieves
    /// the standup notes and composes a grounded email).
    func composeEmail(
        prompt: String,
        styleProfile: StyleProfile? = nil,
        globalInstructions: String? = nil
    ) async throws -> ComposedEmail {
        let fetchResult = await fetchSemanticContext(for: prompt)
        
        let systemPrompt = buildComposeSystemPrompt(
            styleProfile: styleProfile,
            globalInstructions: globalInstructions,
            semanticContext: fetchResult.context
        )
        
        let userContent = """
        User's request: \(prompt)
        
        Generate a complete email based on this request. Return ONLY a JSON object with these fields:
        - "subject": the email subject line
        - "body": the full email body text
        - "suggested_to": best guess at recipient email if mentioned (empty string if not)
        
        Return valid JSON only, no markdown fences.
        """
        
        let response = try await callAnthropic(
            system: systemPrompt,
            userContent: userContent,
            maxTokens: Constants.AI.maxEmailComposeTokens
        )
        captureDebugInfo(fetchResult: fetchResult, responsePreview: response)
        return parseComposedEmail(from: response)
    }
    
    // MARK: - Thread Summarise
    
    /// Generate a concise summary of an email thread.
    ///
    /// When a pipeline is available, cross-references with related meetings, notes, and
    /// calendar events to produce richer, context-aware summaries.
    func summariseThread(thread: [GmailMessage]) async throws -> String {
        let firstMessage = thread.first
        let participants = Set(thread.flatMap { [$0.from] + $0.to }).joined(separator: ", ")
        let fetchResult = await fetchSemanticContext(
            for: deriveSearchQuery(
                subject: firstMessage?.subject ?? "",
                bodyPreview: firstMessage.map { $0.bodyPlain.isEmpty ? $0.snippet : $0.bodyPlain } ?? "",
                sender: participants
            )
        )
        let semanticContext = fetchResult.context
        
        var systemPrompt = """
        You are an email thread summariser. Generate a concise summary of the email thread.
        
        Rules:
        - Return 3-5 bullet points covering: key decisions, requests, open questions, and action items.
        - Each bullet should be one clear sentence.
        - Use Australian English spelling.
        - Focus on what matters — skip pleasantries and filler.
        - If there are action items with owners, highlight them.
        - Format as plain text bullet points using "•" character.
        """
        
        if let semanticContext {
            systemPrompt += """
            
            
            ## Related Context from Your Data
            The following evidence was retrieved from the user's meetings, notes, calendar, and email \
            history. If any of this context is directly related to the email thread, mention the \
            connection briefly (e.g. "This thread relates to the product review meeting on 14 Feb \
            where the same deliverables were discussed"). Only reference context that is genuinely \
            relevant — do not force connections.
            
            \(semanticContext)
            """
        }
        
        let userContent = buildFullThreadText(thread: thread)
        
        return try await callAnthropic(
            system: systemPrompt,
            userContent: userContent,
            maxTokens: Constants.AI.maxSummariseTokens
        )
    }
    
    // MARK: - Classify Email (Suggested Actions)
    
    /// Classify an email and return suggested quick actions.
    ///
    /// When a pipeline is available, uses semantic context to suggest richer, data-aware
    /// actions (e.g. "Reference meeting notes" when a related meeting exists).
    func classifyEmail(message: GmailMessage) async throws -> [SuggestedAction] {
        let fetchResult = await fetchSemanticContext(
            for: deriveSearchQuery(
                subject: message.subject,
                bodyPreview: message.bodyPlain.isEmpty ? message.snippet : message.bodyPlain,
                sender: message.from
            )
        )
        let semanticContext = fetchResult.context
        
        var systemPrompt = """
        You are an email classifier. Analyse the email and suggest 2-4 appropriate quick actions.
        
        Return ONLY a JSON array of objects with "label", "icon", and "instruction" fields.
        
        Available actions (pick the most relevant 2-4):
        - {"label": "Confirm", "icon": "checkmark.circle", "instruction": "Confirm the request/invitation positively"}
        - {"label": "Decline politely", "icon": "xmark.circle", "instruction": "Decline the request politely, suggesting an alternative if appropriate"}
        - {"label": "Acknowledge", "icon": "hand.thumbsup", "instruction": "Send a brief acknowledgement — 'Thanks for the update' style"}
        - {"label": "Answer questions", "icon": "questionmark.circle", "instruction": "Answer the specific questions asked in this email"}
        - {"label": "Ask for details", "icon": "info.circle", "instruction": "Ask for more details or clarification about the request"}
        - {"label": "Schedule", "icon": "calendar", "instruction": "Suggest specific times for the meeting/call requested"}
        - {"label": "Say thanks", "icon": "heart", "instruction": "Send a warm thank you message"}
        """
        
        if let semanticContext {
            systemPrompt += """
            
            
            Additional context-aware actions you may suggest when relevant:
            - {"label": "Reference meeting notes", "icon": "doc.text", "instruction": "Reference the related meeting notes in the reply, citing specific decisions or action items"}
            - {"label": "Summarise prior discussion", "icon": "text.alignleft", "instruction": "Summarise what was previously discussed about this topic, drawing from meeting notes and prior emails"}
            - {"label": "Provide update", "icon": "arrow.triangle.2.circlepath", "instruction": "Provide a status update based on what is known from meetings and notes about this topic"}
            
            ## Related Context from User's Data
            Use this context to decide whether context-aware actions are appropriate:
            
            \(semanticContext)
            """
        }
        
        systemPrompt += "\n\nReturn valid JSON array only, no markdown fences."
        
        let userContent = """
        From: \(message.from) <\(message.fromEmail)>
        Subject: \(message.subject)
        
        \(message.bodyPlain.isEmpty ? message.snippet : message.bodyPlain)
        """
        
        let response = try await callAnthropic(
            system: systemPrompt,
            userContent: userContent,
            maxTokens: Constants.AI.maxClassifyTokens
        )
        return parseSuggestedActions(from: response)
    }
    
    // MARK: - Style Analysis
    
    /// Analyse sent emails to extract a writing style profile.
    func analyseStyle(sentEmails: [GmailMessage]) async throws -> StyleAnalysisResult {
        let systemPrompt = """
        You are a writing style analyst. Analyse the following sent emails and extract the writer's characteristic style.
        
        Return ONLY a JSON object with these fields:
        - "greetings": array of greeting patterns used (e.g. ["Hey", "Hi", ""])
        - "sign_offs": array of sign-off patterns (e.g. ["Cheers,", "Thanks,"])
        - "signature_name": how they sign their name (e.g. "Ryan" or "Ryan Smith")
        - "average_sentence_length": average words per sentence (integer)
        - "formality_score": 0.0 (very casual) to 1.0 (very formal)
        - "uses_contractions": boolean
        - "uses_emoji": boolean
        - "prefers_bullet_points": boolean
        - "common_phrases": array of 5-10 phrases they use often
        - "avoided_phrases": array of phrases/patterns they never use
        - "locale": detected locale (e.g. "en-AU", "en-US")
        - "style_summary": 2-3 sentence natural language description of their writing style
        - "sample_excerpts": 3-5 short representative excerpts (1-2 sentences each, anonymised)
        
        Return valid JSON only, no markdown fences.
        """
        
        // Build sent email samples
        let emailSamples = sentEmails.prefix(100).enumerated().map { index, email in
            """
            --- Email \(index + 1) ---
            To: \(email.to.joined(separator: ", "))
            Subject: \(email.subject)
            Body: \(email.bodyPlain.prefix(500))
            """
        }.joined(separator: "\n\n")
        
        let userContent = """
        Here are \(min(sentEmails.count, 100)) sent emails to analyse:
        
        \(emailSamples)
        
        Analyse the writing style and return the JSON profile.
        """
        
        let response = try await callAnthropic(
            system: systemPrompt,
            userContent: userContent,
            maxTokens: Constants.AI.maxStyleAnalysisTokens
        )
        return parseStyleAnalysis(from: response)
    }
    
    // MARK: - Meeting Follow-Up
    
    /// Generate a follow-up email from meeting notes.
    ///
    /// When a pipeline is available, searches for related emails and prior follow-ups
    /// with the same attendees so the generated email can reference prior discussions
    /// and avoid repeating already-communicated information.
    func generateMeetingFollowUp(
        noteTitle: String,
        enhancedNotes: String,
        attendees: [String],
        template: MeetingFollowUpTemplate = .recap,
        styleProfile: StyleProfile? = nil,
        globalInstructions: String? = nil
    ) async throws -> ComposedEmail {
        let searchQuery = "\(noteTitle) \(attendees.prefix(3).joined(separator: " "))"
        let fetchResult = await fetchSemanticContext(for: searchQuery)
        let semanticContext = fetchResult.context
        
        let styleContext = buildStyleContext(styleProfile)
        let globalContext = globalInstructions.map { "\n\n## Global Rules\n\($0)" } ?? ""
        
        var systemPrompt = """
        You are an AI email assistant drafting a meeting follow-up email.
        \(styleContext)\(globalContext)
        
        Rules:
        - Use Australian English spelling.
        - Write in the user's style if a style profile is provided.
        - Be professional but match the user's natural tone.
        - The email should feel like a genuine follow-up, not an AI-generated template.
        
        Template: \(template.rawValue)
        \(template.guidance)
        """
        
        if let semanticContext {
            systemPrompt += """
            
            
            ## Related Context from Your Data
            The following evidence was retrieved from the user's emails, notes, and calendar. Use \
            this to avoid repeating information that was already communicated in prior emails, and \
            to reference ongoing discussions or prior decisions where relevant.
            
            \(semanticContext)
            """
        }
        
        systemPrompt += """
        
        
        Return ONLY a JSON object with:
        - "subject": suggested subject line
        - "body": the complete email body
        
        Return valid JSON only, no markdown fences.
        """
        
        let userContent = """
        Meeting: \(noteTitle)
        Attendees: \(attendees.joined(separator: ", "))
        
        --- Meeting Notes ---
        \(enhancedNotes)
        --- End of Notes ---
        
        Generate the follow-up email.
        """
        
        let response = try await callAnthropic(
            system: systemPrompt,
            userContent: userContent,
            maxTokens: Constants.AI.maxEmailFollowUpTokens
        )
        return parseComposedEmail(from: response)
    }
    
    // MARK: - Legacy Single-Message Reply (backward compat)
    
    /// Generate an AI draft reply to a single email (backward compatibility).
    func generateReply(
        originalEmail: GmailMessage,
        instructions: String? = nil
    ) async throws -> String {
        try await generateReply(
            thread: [originalEmail],
            replyToIndex: 0,
            variant: .standard,
            oneOffInstructions: instructions
        )
    }
    
    // MARK: - System Prompt Builders
    
    private func buildReplySystemPrompt(
        variant: DraftVariant,
        styleProfile: StyleProfile?,
        globalInstructions: String?,
        contactInstructions: String?,
        oneOffInstructions: String?,
        semanticContext: String? = nil
    ) -> String {
        var prompt = """
        You are an AI email assistant that drafts natural-sounding email replies.
        
        Core rules:
        - Write in the same language as the original email.
        - Match the tone and formality of the conversation.
        - Do NOT include a subject line — only the body text.
        - Do NOT include email headers (From:, To:, Date:).
        - Use Australian English spelling (e.g. "organise", "analyse", "colour").
        - If the original email asks questions, answer them directly.
        - If declining or saying no, be polite but clear.
        - Do not add unnecessary pleasantries or filler.
        """
        
        // Semantic context from the user's indexed data
        if let semanticContext {
            prompt += """
            
            
            ## Relevant Context from Your Data
            The following evidence was retrieved from the user's meetings, notes, calendar, and email \
            history. Use this context to craft a more informed, grounded reply. Reference specific \
            details (decisions, dates, action items, attendees) naturally where relevant — do not \
            fabricate information beyond what is provided.
            
            \(semanticContext)
            """
        }
        
        // Style profile
        let styleContext = buildStyleContext(styleProfile)
        if !styleContext.isEmpty {
            prompt += styleContext
        }
        
        // Global instructions
        if let global = globalInstructions, !global.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            prompt += "\n\n## Global Rules\n\(global)"
        }
        
        // Contact-specific instructions
        if let contact = contactInstructions, !contact.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            prompt += "\n\n## Contact-Specific Rules\n\(contact)"
        }
        
        // One-off instructions
        if let oneOff = oneOffInstructions, !oneOff.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            prompt += "\n\n## Special Instructions for This Reply\n\(oneOff)"
        }
        
        // Variant guidance
        prompt += "\n\n## Length/Style Variant: \(variant.rawValue)\n\(variant.guidance)"
        
        return prompt
    }
    
    private func buildComposeSystemPrompt(
        styleProfile: StyleProfile?,
        globalInstructions: String?,
        semanticContext: String? = nil
    ) -> String {
        var prompt = """
        You are an AI email assistant that composes new emails from natural language prompts.
        
        Core rules:
        - Generate a complete, ready-to-send email.
        - Use Australian English spelling.
        - Write naturally — avoid sounding robotic or overly formal unless the context demands it.
        - Generate an appropriate subject line.
        """
        
        if let semanticContext {
            prompt += """
            
            
            ## Relevant Context from Your Data
            The following evidence was retrieved from the user's meetings, notes, calendar, and email \
            history. Use this context to compose a well-informed, grounded email. Incorporate specific \
            details (names, decisions, dates, action items, discussion points) naturally where they \
            are relevant to the user's request. Do not fabricate information beyond what is provided.
            
            \(semanticContext)
            """
        }
        
        let styleContext = buildStyleContext(styleProfile)
        if !styleContext.isEmpty {
            prompt += styleContext
        }
        
        if let global = globalInstructions, !global.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            prompt += "\n\n## Global Rules\n\(global)"
        }
        
        return prompt
    }
    
    private func buildStyleContext(_ profile: StyleProfile?) -> String {
        guard let profile, !profile.styleSummary.isEmpty else { return "" }
        
        var context = "\n\n## Writing Style Profile"
        context += "\n\(profile.styleSummary)"
        
        let greetings = profile.greetings
        if !greetings.isEmpty {
            context += "\nTypical greetings: \(greetings.joined(separator: ", "))"
        }
        
        let signOffs = profile.signOffs
        if !signOffs.isEmpty {
            context += "\nTypical sign-offs: \(signOffs.joined(separator: ", "))"
        }
        
        if !profile.signatureName.isEmpty {
            context += "\nSigns as: \(profile.signatureName)"
        }
        
        let phrases = profile.commonPhrases
        if !phrases.isEmpty {
            context += "\nCommon phrases: \(phrases.joined(separator: ", "))"
        }
        
        let excerpts = profile.sampleExcerpts
        if !excerpts.isEmpty {
            context += "\n\nExample excerpts of how this user writes:"
            for (i, excerpt) in excerpts.enumerated() {
                context += "\n\(i + 1). \(excerpt)"
            }
        }
        
        return context
    }
    
    // MARK: - Thread Context Builder
    
    private func buildThreadContext(thread: [GmailMessage], replyToIndex: Int) -> String {
        var context = "Email thread (chronological order):\n\n"
        
        for (i, message) in thread.enumerated() {
            let marker = i == replyToIndex ? " ← REPLYING TO THIS MESSAGE" : ""
            context += """
            --- Message \(i + 1) of \(thread.count)\(marker) ---
            From: \(message.from) <\(message.fromEmail)>
            To: \(message.to.joined(separator: ", "))
            Date: \(formattedDate(message.date))
            Subject: \(message.subject)
            
            \(message.bodyPlain.isEmpty ? message.snippet : message.bodyPlain)
            
            """
        }
        
        context += "\nPlease draft a reply to the indicated message."
        return context
    }
    
    private func buildFullThreadText(thread: [GmailMessage]) -> String {
        var text = "Email thread to summarise:\n\n"
        
        for (i, message) in thread.enumerated() {
            text += """
            --- Message \(i + 1) of \(thread.count) ---
            From: \(message.from) <\(message.fromEmail)>
            Date: \(formattedDate(message.date))
            Subject: \(message.subject)
            
            \(message.bodyPlain.isEmpty ? message.snippet : message.bodyPlain)
            
            """
        }
        
        return text
    }
    
    // MARK: - Response Parsers
    
    private func parseComposedEmail(from response: String) -> ComposedEmail {
        // Try to parse as JSON
        let cleaned = response
            .replacingOccurrences(of: "```json", with: "")
            .replacingOccurrences(of: "```", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        
        if let data = cleaned.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            return ComposedEmail(
                subject: json["subject"] as? String ?? "",
                body: json["body"] as? String ?? response,
                suggestedTo: json["suggested_to"] as? String ?? ""
            )
        }
        
        // Fallback: return the raw text as body
        return ComposedEmail(subject: "", body: response, suggestedTo: "")
    }
    
    private func parseSuggestedActions(from response: String) -> [SuggestedAction] {
        let cleaned = response
            .replacingOccurrences(of: "```json", with: "")
            .replacingOccurrences(of: "```", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        
        guard let data = cleaned.data(using: .utf8),
              let array = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }
        
        return array.compactMap { item in
            guard let label = item["label"] as? String,
                  let icon = item["icon"] as? String,
                  let instruction = item["instruction"] as? String else { return nil }
            return SuggestedAction(label: label, icon: icon, instruction: instruction)
        }
    }
    
    private func parseStyleAnalysis(from response: String) -> StyleAnalysisResult {
        let cleaned = response
            .replacingOccurrences(of: "```json", with: "")
            .replacingOccurrences(of: "```", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        
        guard let data = cleaned.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return StyleAnalysisResult()
        }
        
        return StyleAnalysisResult(
            greetings: json["greetings"] as? [String] ?? [],
            signOffs: json["sign_offs"] as? [String] ?? [],
            signatureName: json["signature_name"] as? String ?? "",
            averageSentenceLength: json["average_sentence_length"] as? Int ?? 12,
            formalityScore: (json["formality_score"] as? NSNumber)?.floatValue ?? 0.5,
            usesContractions: json["uses_contractions"] as? Bool ?? true,
            usesEmoji: json["uses_emoji"] as? Bool ?? false,
            prefersBulletPoints: json["prefers_bullet_points"] as? Bool ?? false,
            commonPhrases: json["common_phrases"] as? [String] ?? [],
            avoidedPhrases: json["avoided_phrases"] as? [String] ?? [],
            locale: json["locale"] as? String ?? "en-AU",
            styleSummary: json["style_summary"] as? String ?? "",
            sampleExcerpts: json["sample_excerpts"] as? [String] ?? []
        )
    }
    
    // MARK: - Semantic Context Helpers
    
    /// Internal result from the pipeline fetch — carries both the formatted context
    /// string for LLM injection and the raw metadata for debug display.
    private struct SemanticFetchResult {
        let context: String?
        let searchQuery: String
        let evidenceCount: Int
        let evidenceTitles: [String]
        let temporalLabel: String?
        let error: String?
    }
    
    /// Fetch grounded evidence from the user's indexed data (meetings, notes, calendar, emails)
    /// via the central RAG pipeline. Returns formatted context for LLM injection plus
    /// raw metadata for the debug panel.
    private func fetchSemanticContext(for query: String) async -> SemanticFetchResult {
        guard let pipeline else {
            print("[EmailAIService] Pipeline unavailable — skipping semantic context retrieval")
            return SemanticFetchResult(
                context: nil, searchQuery: query, evidenceCount: 0,
                evidenceTitles: [], temporalLabel: nil, error: "Pipeline not available"
            )
        }
        let options = SearchQueryPipeline.QueryOptions(
            sourceFilters: SearchSourceType.allCases,
            maxEvidenceBlocks: 6,
            enableLLMRewrite: true,
            enableTemporalResolution: true,
            enableAgenticFallback: true
        )
        do {
            let result = try await pipeline.execute(query: query, options: options)
            let titles = result.evidence.map { $0.title }
            let temporal = result.metadata.temporalRange?.label
            
            guard !result.evidence.isEmpty else {
                print("[EmailAIService] Pipeline returned 0 evidence blocks for query: \(query.prefix(80))…")
                return SemanticFetchResult(
                    context: nil, searchQuery: query, evidenceCount: 0,
                    evidenceTitles: [], temporalLabel: temporal, error: nil
                )
            }
            print("[EmailAIService] Pipeline returned \(result.evidence.count) evidence blocks (temporal=\(temporal ?? "none")) for query: \(query.prefix(80))…")
            let formatted = result.evidence.enumerated().map { i, block in
                """
                [\(i + 1)] \(block.title) (Source: \(block.sourceType), Relevance: \(String(format: "%.0f%%", block.semanticScore * 100)))
                \(block.text)
                """
            }.joined(separator: "\n\n")
            return SemanticFetchResult(
                context: formatted, searchQuery: query, evidenceCount: result.evidence.count,
                evidenceTitles: titles, temporalLabel: temporal, error: nil
            )
        } catch {
            print("[EmailAIService] Pipeline error: \(error.localizedDescription)")
            return SemanticFetchResult(
                context: nil, searchQuery: query, evidenceCount: 0,
                evidenceTitles: [], temporalLabel: nil, error: error.localizedDescription
            )
        }
    }
    
    /// Build the pipeline search query for reply generation. Combines the user's
    /// one-off instructions (which may contain temporal references like "tomorrow" or
    /// topical keywords like "meeting notes") with the email metadata so the pipeline
    /// retrieves the right context.
    private func buildReplySearchQuery(targetMessage: GmailMessage, oneOffInstructions: String?) -> String {
        let emailContext = deriveSearchQuery(
            subject: targetMessage.subject,
            bodyPreview: targetMessage.bodyPlain.isEmpty ? targetMessage.snippet : targetMessage.bodyPlain,
            sender: targetMessage.from
        )
        
        if let instructions = oneOffInstructions?.trimmingCharacters(in: .whitespacesAndNewlines),
           !instructions.isEmpty {
            return "\(instructions) \(emailContext)"
        }
        return emailContext
    }
    
    /// Derive an effective search query from email metadata by stripping reply/forward
    /// prefixes, combining the subject with sender name and a body preview.
    private func deriveSearchQuery(subject: String, bodyPreview: String, sender: String) -> String {
        let cleanSubject = subject
            .replacingOccurrences(of: "^(Re|Fwd|Fw):\\s*", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let preview = String(bodyPreview.prefix(150))
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return [cleanSubject, sender, preview]
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
    
    // MARK: - Helpers
    
    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMM yyyy, h:mm a"
        return formatter.string(from: date)
    }
}

// MARK: - Result Types

struct ComposedEmail {
    let subject: String
    let body: String
    let suggestedTo: String
}

struct StyleAnalysisResult {
    var greetings: [String] = []
    var signOffs: [String] = []
    var signatureName: String = ""
    var averageSentenceLength: Int = 12
    var formalityScore: Float = 0.5
    var usesContractions: Bool = true
    var usesEmoji: Bool = false
    var prefersBulletPoints: Bool = false
    var commonPhrases: [String] = []
    var avoidedPhrases: [String] = []
    var locale: String = "en-AU"
    var styleSummary: String = ""
    var sampleExcerpts: [String] = []
}

// MARK: - Meeting Follow-Up Templates

enum MeetingFollowUpTemplate: String, CaseIterable, Identifiable {
    case recap = "Meeting Recap"
    case actionItems = "Action Items Only"
    case decisions = "Decision Summary"
    case custom = "Custom"
    
    var id: String { rawValue }
    
    var icon: String {
        switch self {
        case .recap: return "doc.text"
        case .actionItems: return "checklist"
        case .decisions: return "checkmark.seal"
        case .custom: return "pencil"
        }
    }
    
    var guidance: String {
        switch self {
        case .recap:
            return "Generate a full meeting recap including: brief summary (2-3 sentences), key decisions made, action items with owners, and next steps."
        case .actionItems:
            return "Generate a concise email listing only the action items from the meeting, each with its owner and deadline if mentioned."
        case .decisions:
            return "Generate a summary focused on the decisions made during the meeting, with brief context for each."
        case .custom:
            return "Generate the follow-up email based on the user's custom instructions."
        }
    }
}

// MARK: - Backward Compatibility

/// Legacy error type — now mapped to AIProxyError.
typealias EmailAIError = AIProxyError
