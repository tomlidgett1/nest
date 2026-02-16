import Foundation
import SwiftData

/// AI service for all email intelligence tasks.
///
/// Uses the Anthropic Messages API (Claude) via server-side proxy.
/// Handles: reply, compose, summarise, classify, style analysis, and meeting follow-up.
final class EmailAIService {
    
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
    
    // MARK: - Generate Reply (Single Variant)
    
    /// Generate a single AI draft reply to an email thread.
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
        
        let systemPrompt = buildReplySystemPrompt(
            variant: variant,
            styleProfile: styleProfile,
            globalInstructions: globalInstructions,
            contactInstructions: contactInstructions,
            oneOffInstructions: oneOffInstructions
        )
        
        let userContent = buildThreadContext(thread: thread, replyToIndex: idx)
        
        return try await callAnthropic(
            system: systemPrompt,
            userContent: userContent,
            maxTokens: Constants.AI.maxEmailReplyTokens
        )
    }
    
    // MARK: - Generate Multi-Draft Reply
    
    /// Generate 3 variants (concise, standard, detailed) in parallel.
    func generateMultiDraft(
        thread: [GmailMessage],
        replyToIndex: Int? = nil,
        styleProfile: StyleProfile? = nil,
        globalInstructions: String? = nil,
        contactInstructions: String? = nil,
        oneOffInstructions: String? = nil
    ) async throws -> MultiDraftResult {
        var result = MultiDraftResult()
        
        try await withThrowingTaskGroup(of: (DraftVariant, String).self) { group in
            for variant in DraftVariant.allCases {
                group.addTask {
                    let draft = try await self.generateReply(
                        thread: thread,
                        replyToIndex: replyToIndex,
                        variant: variant,
                        styleProfile: styleProfile,
                        globalInstructions: globalInstructions,
                        contactInstructions: contactInstructions,
                        oneOffInstructions: oneOffInstructions
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
    func composeEmail(
        prompt: String,
        styleProfile: StyleProfile? = nil,
        globalInstructions: String? = nil
    ) async throws -> ComposedEmail {
        let systemPrompt = buildComposeSystemPrompt(
            styleProfile: styleProfile,
            globalInstructions: globalInstructions
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
        return parseComposedEmail(from: response)
    }
    
    // MARK: - Thread Summarise
    
    /// Generate a concise summary of an email thread.
    func summariseThread(thread: [GmailMessage]) async throws -> String {
        let systemPrompt = """
        You are an email thread summariser. Generate a concise summary of the email thread.
        
        Rules:
        - Return 3-5 bullet points covering: key decisions, requests, open questions, and action items.
        - Each bullet should be one clear sentence.
        - Use Australian English spelling.
        - Focus on what matters — skip pleasantries and filler.
        - If there are action items with owners, highlight them.
        - Format as plain text bullet points using "•" character.
        """
        
        let userContent = buildFullThreadText(thread: thread)
        
        return try await callAnthropic(
            system: systemPrompt,
            userContent: userContent,
            maxTokens: Constants.AI.maxSummariseTokens
        )
    }
    
    // MARK: - Classify Email (Suggested Actions)
    
    /// Classify an email and return suggested quick actions.
    func classifyEmail(message: GmailMessage) async throws -> [SuggestedAction] {
        let systemPrompt = """
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
        
        Return valid JSON array only, no markdown fences.
        """
        
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
    func generateMeetingFollowUp(
        noteTitle: String,
        enhancedNotes: String,
        attendees: [String],
        template: MeetingFollowUpTemplate = .recap,
        styleProfile: StyleProfile? = nil,
        globalInstructions: String? = nil
    ) async throws -> ComposedEmail {
        let styleContext = buildStyleContext(styleProfile)
        let globalContext = globalInstructions.map { "\n\n## Global Rules\n\($0)" } ?? ""
        
        let systemPrompt = """
        You are an AI email assistant drafting a meeting follow-up email.
        \(styleContext)\(globalContext)
        
        Rules:
        - Use Australian English spelling.
        - Write in the user's style if a style profile is provided.
        - Be professional but match the user's natural tone.
        - The email should feel like a genuine follow-up, not an AI-generated template.
        
        Template: \(template.rawValue)
        \(template.guidance)
        
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
        oneOffInstructions: String?
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
        globalInstructions: String?
    ) -> String {
        var prompt = """
        You are an AI email assistant that composes new emails from natural language prompts.
        
        Core rules:
        - Generate a complete, ready-to-send email.
        - Use Australian English spelling.
        - Write naturally — avoid sounding robotic or overly formal unless the context demands it.
        - Generate an appropriate subject line.
        """
        
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
