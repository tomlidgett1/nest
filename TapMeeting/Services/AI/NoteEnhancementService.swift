import Foundation

/// Enhances raw meeting notes using the OpenAI Responses API (GPT-4.1).
/// Merges user notes with transcript context to produce structured markdown.
final class NoteEnhancementService {
    
    // MARK: - Networking
    
    /// Configured session with generous timeouts for AI calls (long transcripts can take a while).
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120     // 120s per request
        config.timeoutIntervalForResource = 300    // 5 min total (handles chunked long transcripts)
        config.waitsForConnectivity = true          // wait for network rather than fail instantly
        return URLSession(configuration: config)
    }()
    
    /// Maximum number of automatic retries for transient network errors.
    private let maxRetries = 2
    
    /// System prompt guiding the AI enhancement.
    private let systemPrompt = """
    You are a meeting notes assistant that transforms meeting transcripts into clean, \
    structured, actionable notes. Your output must follow these exact conventions:

    Structure:

    - Title: Begin with a concise descriptive title for the meeting as a top-level \
    heading using ## (e.g., ## January Performance Review).
    - Topical Sections: Group the transcript content into 3–6 thematic sections. Each \
    section gets a ## heading (e.g., ## Operational Updates, ## Emirates Partnership Updates). \
    Sections should reflect the natural topic shifts in the conversation, not a rigid template.
    - "Next Steps" or "Action Items" Section: Always end with a final section using \
    ## Next Steps or ## Action Items capturing follow-ups and owners.

    Formatting Rules:

    - Use - for all bullet points (hyphen followed by a space).
    - Use hierarchical indentation (2–3 levels max) to nest supporting details under \
    parent points. Nested bullets use two spaces before the hyphen (e.g., "  - detail").
    - Parent bullets are key facts, decisions, or topics. Child bullets provide specifics: \
    numbers, context, exceptions, reasoning, or examples.
    - In the Next Steps section, prefix action items with the responsible person's name \
    followed by a colon (e.g., - Ryan: Confirm photo timestamps with tech team).
    - When multiple people share an action, use - All: as the prefix.
    - All section headers use ## — do not use # or ### for subsections. There is \
    only one level of heading.

    Writing Style:

    - Telegraphic, not prose. Write in condensed note fragments, not full sentences. \
    Strip articles ("the", "a") and filler words where possible without losing clarity.
    - Specific and quantitative. Always include exact numbers, percentages, currencies, \
    dates, and proper nouns from the transcript. Never round or generalise when the \
    transcript provides specifics (e.g., "280 rides rebated (23% of total)" not \
    "roughly a quarter were rebated").
    - Parenthetical context. Use parentheses to add brief clarifying context that wasn't \
    the main point but aids understanding (e.g., "backup sent", "year-long advocacy effort \
    successful after sharing passenger video in rain", "strongest week ever").
    - No commentary, interpretation, or opinion. Record what was discussed, decided, and \
    assigned. Do not editorialize, summarise sentiment, or add your own analysis.
    - Name people with their actions. When someone said something notable, took \
    responsibility, or made a request, name them (e.g., "George requested timestamp \
    confirmation to prevent photo reuse").
    - Preserve nuance and caveats. If something is uncertain, conditional, or has \
    exceptions, capture that (e.g., "Considering test week without validation requirements", \
    "Challenge: chauffeurs send vans due to luggage capacity concerns").
    - Use Australian English spelling (e.g. "organise", "analyse", "colour", "summarise").

    Section Header Naming:

    - Name sections based on the substance of the discussion, not generic labels. Prefer \
    specific topic labels like "Emirates Partnership Updates", "Vehicle Inspection Program \
    Rollout", "Kyoto Market Launch Planning" over generic ones like "Discussion", "Updates", \
    "Other Business."
    - If the meeting covers one company's/client's operational review, lead with the \
    performance data section, then move to operational updates, then partnerships/strategy, \
    then next steps.

    Content Prioritisation:

    - Lead each section with the highest-impact or most concrete information (decisions \
    made, numbers reported, outcomes confirmed).
    - Follow with context, challenges, dependencies, and open questions.
    - Capture disagreements, concerns, and risks as factual observations (e.g., \
    "Concerning: Emirates contacted Ray directly, shows close relationship potentially \
    working against Blacklane").
    - Include timeline information when discussed (launch dates, deadlines, phases).

    Bullet Depth Logic:

    - Level 1 (- ): Key topic, metric, decision, or update.
    - Level 2 (indented - ): Supporting detail — the specific number, the reason why, \
    the person responsible, or the exception.
    - Level 3 (double-indented - ): Further granularity only when needed — sub-breakdowns \
    of data, edge cases, or multi-part explanations.
    - Never go deeper than 3 levels. If content is that nested, restructure into a new \
    Level 1 bullet.

    Number & Data Formatting:

    - Use commas for thousands (1,217 not 1217).
    - Use % symbol directly after numbers (23% not 23 percent).
    - Use currency symbols before amounts (€94k, $10k, $250/month).
    - Use + and - prefixes for changes and variances (+11%, -3%, +€3.8).
    - Express comparisons clearly (e.g., "42% GPM (consistently above 40% target)", \
    "+29% year-over-year").
    - Include the comparison baseline when available (vs target, vs previous week, \
    year-over-year).

    What NOT to Do:

    - Do not use # or ### — only ## for all section headers.
    - Do not provide any Next Steps or action items if there are none.
    - Do not use * for bullet points — only use - (hyphen).
    - Do not use bold (**) or italic formatting within bullets.
    - Do not write introductory summaries or conclusions.
    - Do not add bullet points that weren't substantively discussed in the transcript.
    - Do not merge separate topics into one section for brevity — keep them distinct.
    - Do not omit names, numbers, or specifics that were mentioned in the transcript.
    - Do not create empty or vague action items — every next step needs an owner and \
    a clear action.
    """
    
    /// System prompt for generating a concise meeting title from transcript.
    private let titlePrompt = """
    You are a meeting notes assistant. Given a meeting transcript, generate a short, \
    descriptive title for the meeting (3–7 words). Return ONLY the title text — no \
    quotes, no punctuation, no explanation. Use Australian English spelling.
    
    Examples of good titles:
    - Q1 Marketing Strategy Review
    - Sprint Planning Session
    - Client Onboarding Kickoff
    - Weekly Team Standup
    - Budget Approval Discussion
    """
    
    // MARK: - Title Generation
    
    /// Generate a short, descriptive meeting title from the transcript.
    func generateTitle(transcript: String) async throws -> String {
        let apiKey = KeychainHelper.get(key: Constants.Keychain.openAIAPIKey) ?? ""
        guard !apiKey.isEmpty else {
            throw EnhancementError.missingAPIKey
        }
        
        // Send a trimmed transcript (first ~2000 chars is enough for a title)
        let trimmedTranscript = String(transcript.prefix(2000))
        
        let requestBody = ResponsesAPIRequest(
            model: Constants.AI.enhancementModel,
            instructions: titlePrompt,
            input: trimmedTranscript,
            store: false
        )
        
        let request = try buildRequest(apiKey: apiKey, body: requestBody)
        let (data, _) = try await performRequest(request)
        let apiResponse = try JSONDecoder().decode(ResponsesAPIResponse.self, from: data)
        
        guard let text = apiResponse.outputText?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else {
            throw EnhancementError.emptyResponse
        }
        
        return text
    }
    
    // MARK: - Standalone Enhancement
    
    /// System prompt for structuring standalone notes (no transcript context).
    private let standalonePrompt = """
    You are a notes assistant that structures and improves raw notes. The user has typed \
    free-form notes without a meeting transcript. Your job is to:
    
    - Organise the content into logical sections with ## headings
    - Use - for all bullet points (hyphen followed by a space)
    - Clean up grammar and clarity while preserving the user's intent
    - Extract any action items into a final ## Action Items section
    - Use Australian English spelling
    - Be concise and telegraphic — note fragments, not prose
    - Do not add content that wasn't in the original notes
    - Do not use bold (**) or italic formatting within bullets
    """
    
    /// Enhance standalone notes (no transcript context).
    func enhanceStandalone(rawNotes: String) async throws -> String {
        let apiKey = KeychainHelper.get(key: Constants.Keychain.openAIAPIKey) ?? ""
        guard !apiKey.isEmpty else {
            throw EnhancementError.missingAPIKey
        }
        
        let requestBody = ResponsesAPIRequest(
            model: Constants.AI.enhancementModel,
            instructions: standalonePrompt,
            input: rawNotes,
            store: false
        )
        
        let request = try buildRequest(apiKey: apiKey, body: requestBody)
        let (data, _) = try await performRequest(request)
        let apiResponse = try JSONDecoder().decode(ResponsesAPIResponse.self, from: data)
        
        guard let text = apiResponse.outputText else {
            throw EnhancementError.emptyResponse
        }
        
        return text
    }
    
    // MARK: - Long Transcript Handling
    
    /// Maximum transcript character count before switching to chunked processing.
    /// ~100K chars ≈ ~25K tokens — comfortably fits in one API call with system prompt.
    private let chunkThreshold = 100_000
    
    /// Target size per chunk (in characters). ~80K chars ≈ ~20K tokens.
    private let chunkSize = 80_000
    
    /// System prompt for summarising a single chunk of a long transcript.
    private let chunkSummaryPrompt = """
    You are a meeting notes assistant. You are processing one segment of a very long \
    meeting transcript. Your job is to extract ALL key information from this segment \
    into detailed, structured bullet points.

    Rules:
    - Capture every decision, action item, number, name, date, and key discussion point
    - Use - for bullet points with hierarchical indentation (2 levels max)
    - Be thorough — do NOT skip or summarise away details. This output will be used \
    as input for a final structuring pass, so nothing should be lost
    - Include who said what when it matters
    - Preserve exact numbers, percentages, currencies, and proper nouns
    - Use Australian English spelling
    - Do not add commentary or interpretation
    - Output ONLY the bullet points — no headings, no intro, no conclusion
    """
    
    /// Split a transcript into chunks, splitting at line boundaries to avoid cutting mid-utterance.
    private func splitTranscript(_ transcript: String, maxChunkSize: Int) -> [String] {
        let lines = transcript.components(separatedBy: "\n")
        var chunks: [String] = []
        var currentChunk = ""
        
        for line in lines {
            if currentChunk.count + line.count + 1 > maxChunkSize && !currentChunk.isEmpty {
                chunks.append(currentChunk)
                currentChunk = ""
            }
            if !currentChunk.isEmpty {
                currentChunk += "\n"
            }
            currentChunk += line
        }
        
        if !currentChunk.isEmpty {
            chunks.append(currentChunk)
        }
        
        return chunks
    }
    
    /// Summarise a single chunk of transcript, extracting all key information.
    private func summariseChunk(_ chunk: String, chunkIndex: Int, totalChunks: Int, apiKey: String) async throws -> String {
        let input = """
        [Segment \(chunkIndex + 1) of \(totalChunks)]
        
        \(chunk)
        """
        
        let requestBody = ResponsesAPIRequest(
            model: Constants.AI.enhancementModel,
            instructions: chunkSummaryPrompt,
            input: input,
            store: false
        )
        
        let request = try buildRequest(apiKey: apiKey, body: requestBody)
        let (data, _) = try await performRequest(request)
        let apiResponse = try JSONDecoder().decode(ResponsesAPIResponse.self, from: data)
        
        guard let text = apiResponse.outputText?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else {
            throw EnhancementError.emptyResponse
        }
        
        print("[NoteEnhancement] Chunk \(chunkIndex + 1)/\(totalChunks) summarised (\(chunk.count) chars → \(text.count) chars)")
        return text
    }
    
    // MARK: - Enhancement
    
    /// Enhance raw notes using transcript context via the OpenAI Responses API.
    /// For long transcripts (3+ hour meetings), automatically chunks the transcript,
    /// summarises each chunk, then produces final structured notes from the combined summaries.
    func enhance(rawNotes: String, transcript: String) async throws -> String {
        let apiKey = KeychainHelper.get(key: Constants.Keychain.openAIAPIKey) ?? ""
        guard !apiKey.isEmpty else {
            throw EnhancementError.missingAPIKey
        }
        
        // Short transcript — process in a single call (existing behaviour)
        if transcript.count <= chunkThreshold {
            return try await enhanceDirect(rawNotes: rawNotes, transcript: transcript, apiKey: apiKey)
        }
        
        // Long transcript — chunk, summarise each, then combine
        print("[NoteEnhancement] Long transcript detected (\(transcript.count) chars). Using chunked processing.")
        
        let chunks = splitTranscript(transcript, maxChunkSize: chunkSize)
        print("[NoteEnhancement] Split into \(chunks.count) chunks")
        
        // Summarise each chunk (sequentially to avoid rate limits)
        var chunkSummaries: [String] = []
        for (index, chunk) in chunks.enumerated() {
            let summary = try await summariseChunk(chunk, chunkIndex: index, totalChunks: chunks.count, apiKey: apiKey)
            chunkSummaries.append(summary)
        }
        
        // Combine all chunk summaries and do the final enhancement pass
        let combinedSummary = chunkSummaries.enumerated().map { index, summary in
            "--- Part \(index + 1) of \(chunks.count) ---\n\(summary)"
        }.joined(separator: "\n\n")
        
        print("[NoteEnhancement] Combined summaries: \(combinedSummary.count) chars. Running final enhancement pass.")
        
        let userMessage = """
        ## My Notes
        \(rawNotes)
        
        ## Meeting Content (pre-summarised from a \(chunks.count)-part transcript)
        \(combinedSummary)
        """
        
        let requestBody = ResponsesAPIRequest(
            model: Constants.AI.enhancementModel,
            instructions: systemPrompt,
            input: userMessage,
            store: false
        )
        
        let request = try buildRequest(apiKey: apiKey, body: requestBody)
        let (data, _) = try await performRequest(request)
        let apiResponse = try JSONDecoder().decode(ResponsesAPIResponse.self, from: data)
        
        guard let text = apiResponse.outputText else {
            throw EnhancementError.emptyResponse
        }
        
        print("[NoteEnhancement] Final enhancement complete for long transcript.")
        return text
    }
    
    /// Direct single-call enhancement for normal-length transcripts.
    private func enhanceDirect(rawNotes: String, transcript: String, apiKey: String) async throws -> String {
        let userMessage = """
        ## My Notes
        \(rawNotes)
        
        ## Meeting Transcript
        \(transcript)
        """
        
        let requestBody = ResponsesAPIRequest(
            model: Constants.AI.enhancementModel,
            instructions: systemPrompt,
            input: userMessage,
            store: false
        )
        
        let request = try buildRequest(apiKey: apiKey, body: requestBody)
        let (data, _) = try await performRequest(request)
        let apiResponse = try JSONDecoder().decode(ResponsesAPIResponse.self, from: data)
        
        guard let text = apiResponse.outputText else {
            throw EnhancementError.emptyResponse
        }
        
        return text
    }
    
    // MARK: - Private Helpers
    
    /// Build a URLRequest for the OpenAI Responses API.
    private func buildRequest(apiKey: String, body: ResponsesAPIRequest) throws -> URLRequest {
        let url = URL(string: Constants.AI.responsesEndpoint)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        return request
    }
    
    /// Execute a request with automatic retry for transient network failures.
    private func performRequest(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        var lastError: Error?
        
        for attempt in 0...maxRetries {
            do {
                let (data, response) = try await session.data(for: request)
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw EnhancementError.apiError("Invalid response from server")
                }
                
                // Don't retry client errors (4xx) — only server/network errors
                if (400...499).contains(httpResponse.statusCode) {
                    let body = String(data: data, encoding: .utf8) ?? ""
                    throw EnhancementError.apiError("Request rejected (\(httpResponse.statusCode)): \(body)")
                }
                
                guard (200...299).contains(httpResponse.statusCode) else {
                    throw EnhancementError.apiError("Server error (\(httpResponse.statusCode))")
                }
                
                return (data, httpResponse)
                
            } catch let error as EnhancementError {
                // Don't retry known non-transient errors
                throw error
            } catch {
                lastError = error
                
                // Only retry if we haven't exhausted attempts
                if attempt < maxRetries {
                    // Exponential back-off: 1s, 2s
                    let delay = UInt64(pow(2.0, Double(attempt))) * 1_000_000_000
                    try await Task.sleep(nanoseconds: delay)
                }
            }
        }
        
        // All retries exhausted — throw a descriptive network error
        throw EnhancementError.networkError(lastError)
    }
}

// MARK: - API Types

/// Request body for the OpenAI Responses API.
private struct ResponsesAPIRequest: Encodable {
    let model: String
    let instructions: String
    let input: String
    let store: Bool
}

/// Simplified response from the OpenAI Responses API.
private struct ResponsesAPIResponse: Decodable {
    let id: String
    let output: [OutputItem]
    
    var outputText: String? {
        output.compactMap { item in
            item.content?.compactMap { content in
                content.text
            }.joined()
        }.joined()
    }
    
    struct OutputItem: Decodable {
        let type: String
        let content: [ContentItem]?
    }
    
    struct ContentItem: Decodable {
        let type: String
        let text: String?
    }
}

// MARK: - Errors

enum EnhancementError: LocalizedError {
    case missingAPIKey
    case apiError(String)
    case emptyResponse
    case networkError(Error?)
    
    var errorDescription: String? {
        switch self {
        case .missingAPIKey:
            return "OpenAI API key not configured. Add it in Preferences."
        case .apiError(let message):
            return "AI enhancement failed: \(message)"
        case .emptyResponse:
            return "AI returned an empty response."
        case .networkError(let underlying):
            let detail = underlying?.localizedDescription ?? "Unknown error"
            return "Network connection failed. Please check your internet connection and try again. (\(detail))"
        }
    }
}
