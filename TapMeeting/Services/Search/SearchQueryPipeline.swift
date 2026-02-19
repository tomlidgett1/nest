import Foundation

/// Central RAG query pipeline shared by every AI feature in Nest.
///
/// Responsibilities:
///   1. Query enrichment (coreference resolution via conversation history)
///   2. Sub-query generation (stop-word stripping, topic extraction, temporal stripping)
///   3. **Orchestration agent** — LLM-based query planner (gpt-4.1-mini) that decomposes
///      natural language into structured intent: which sources to search, core search terms,
///      and an optimised rewritten query. Runs concurrently with initial broad search.
///   4. Parallel multi-query vector + lexical search
///   5. Source-filtered search (driven by the planner's source decisions)
///   6. Deduplication + reranking
///   7. Maximal Marginal Relevance (diversity)
///   8. Evidence block building
///   9. Temporal resolution + live calendar injection
///  10. Agentic fallback (second-chance retrieval)
///
/// Any feature that needs grounded evidence from the user's data calls
/// `pipeline.execute(query:options:)` and receives `PipelineResult`.
/// Improvements to this service automatically benefit *every* consumer.
final class SearchQueryPipeline {

    // MARK: - Dependencies

    private let searchService: SemanticSearchService
    private let telemetry: SearchTelemetryService

    /// Injected by AppState — returns cached/local calendar events.
    var liveCalendarProvider: (() -> [CalendarEvent])?
    /// Injected by AppState — fetches Google Calendar events for an arbitrary date range.
    var liveCalendarRangeProvider: ((Date, Date) async -> [CalendarEvent])?

    init(searchService: SemanticSearchService, telemetry: SearchTelemetryService) {
        self.searchService = searchService
        self.telemetry = telemetry
    }

    // MARK: - Public API

    /// Options that callers can customise per-feature.
    struct QueryOptions {
        /// Conversation history for coreference resolution (chat feature).
        var conversationHistory: [SemanticChatMessage] = []
        /// Restrict results to specific source types (e.g. emails only).
        var sourceFilters: [SearchSourceType] = SearchSourceType.allCases
        /// Maximum evidence blocks to return.
        var maxEvidenceBlocks: Int = Constants.Search.maxEvidenceBlocks
        /// Use the LLM to rewrite vague queries into optimised search terms.
        var enableLLMRewrite: Bool = true
        /// Detect temporal references and inject live calendar events.
        var enableTemporalResolution: Bool = true
        /// If initial evidence is thin, try a second retrieval round with extracted topic nouns.
        var enableAgenticFallback: Bool = true
    }

    /// Metadata about how the pipeline executed (useful for telemetry / dashboard).
    struct PipelineMetadata {
        let intent: SemanticIntent
        let enrichedQuery: String
        let subQueries: [String]
        let llmRewrittenQuery: String?
        let searchLatencyMs: Int
        let totalResultCount: Int
        let retrievalRounds: Int
        let temporalRange: (start: Date, end: Date, label: String)?
        /// Query plan produced by the orchestration agent (nil if planner was disabled or failed)
        let queryPlan: QueryPlan?
    }

    /// The output of a pipeline execution.
    struct PipelineResult {
        let evidence: [EvidenceBlock]
        let citations: [SemanticCitation]
        let allResults: [SearchDocumentCandidate]
        let metadata: PipelineMetadata
    }

    /// Execute the full RAG query pipeline and return grounded evidence.
    func execute(query: String, options: QueryOptions = QueryOptions()) async throws -> PipelineResult {
        let intent = detectIntent(query)

        // 1. Enrich query using conversation history
        let enrichedQuery = enrichQuery(query, history: options.conversationHistory)

        // 2. Generate sub-queries (fast, local)
        var subQueries = generateSubQueries(enrichedQuery, intent: intent)

        // 2a. Query planner — uses gpt-4.1-mini to understand WHAT the user wants and
        // WHERE to find it. Runs concurrently with the initial broad search so it adds
        // no latency. Returns structured intent: which sources to search, core search
        // terms, and a rewritten query optimised for embedding similarity.
        let planTask: Task<QueryPlan?, Never> = Task {
            guard options.enableLLMRewrite else { return nil }
            return await self.planQuery(enrichedQuery)
        }

        // 2b. Resolve temporal range (fast, local)
        let temporalRange = options.enableTemporalResolution ? resolveTemporalRange(query) : nil

        // 3. Execute initial broad search in parallel (doesn't wait for planner)
        let searchStart = Date()
        var allResults: [SearchDocumentCandidate] = []
        var allCitations: [SemanticCitation] = []

        await withTaskGroup(of: SemanticSearchResponse?.self) { group in
            for searchQuery in subQueries {
                group.addTask { [searchService] in
                    try? await searchService.search(query: searchQuery)
                }
            }
            for await result in group {
                if let r = result {
                    allResults.append(contentsOf: r.results)
                    allCitations.append(contentsOf: r.citations)
                }
            }
        }

        // 3b. Query planner results are now ready — use them for targeted source-filtered
        // searches and additional topic queries. This is the "orchestration" step.
        let plan = await planTask.value
        var llmRewrittenQuery: String?

        if let plan {
            // Source-filtered searches: the planner tells us which data types are relevant.
            let sourceFilterSets = buildSourceFilters(from: plan)
            var planQueries = plan.searchQueries
            if let rewritten = plan.rewrittenQuery {
                let lower = rewritten.lowercased()
                if !subQueries.contains(where: { $0.lowercased() == lower }) {
                    planQueries.append(rewritten)
                    llmRewrittenQuery = rewritten
                    subQueries.append(rewritten)
                }
            }

            // Run source-filtered + topic searches in parallel
            await withTaskGroup(of: SemanticSearchResponse?.self) { group in
                // For each source filter set, run the planner's search queries
                for filters in sourceFilterSets {
                    for searchQuery in planQueries.isEmpty ? subQueries : planQueries {
                        group.addTask { [searchService] in
                            try? await searchService.search(query: searchQuery, sourceFilters: filters)
                        }
                    }
                }
                // If the planner produced a rewritten query, also search it unfiltered
                if let rewritten = plan.rewrittenQuery {
                    group.addTask { [searchService] in
                        try? await searchService.search(query: rewritten)
                    }
                }
                for await result in group {
                    if let r = result {
                        allResults.append(contentsOf: r.results)
                        allCitations.append(contentsOf: r.citations)
                    }
                }
            }

            // Calendar-title note boost: when the planner says "notes" or "transcripts"
            // and we have a temporal range, search by actual meeting titles
            let wantsNoteContent = plan.sources.contains(where: {
                ["notes", "transcripts", "meetings"].contains($0)
            })
            if wantsNoteContent, let range = temporalRange {
                let noteFilters: [SearchSourceType] = [.noteSummary, .noteChunk, .utteranceChunk]
                let calendarEvents = await fetchCalendarEventsForRange(range)
                var titleQueries: [String] = []
                for event in calendarEvents.prefix(5) {
                    titleQueries.append(event.title)
                    if !event.attendeeNames.isEmpty {
                        titleQueries.append("\(event.title) \(event.attendeeNames.prefix(3).joined(separator: " "))")
                    }
                }
                await withTaskGroup(of: SemanticSearchResponse?.self) { group in
                    for titleQuery in titleQueries {
                        group.addTask { [searchService] in
                            try? await searchService.search(query: titleQuery, sourceFilters: noteFilters)
                        }
                    }
                    for await result in group {
                        if let r = result {
                            allResults.append(contentsOf: r.results)
                            allCitations.append(contentsOf: r.citations)
                        }
                    }
                }
            }
        } else {
            // Planner failed or disabled — fall back to keyword-based source detection
            let lower = query.lowercased()
            let noteKeywords = ["meeting", "meetings", "note", "notes", "transcript",
                                "discussed", "call", "standup", "sync", "recap"]
            let emailKeywords = ["email", "emails", "inbox", "thread", "replied", "wrote"]
            let wantsNotes = noteKeywords.contains { lower.contains($0) }
            let wantsEmails = emailKeywords.contains { lower.contains($0) }
            let noteFilters: [SearchSourceType] = [.noteSummary, .noteChunk, .utteranceChunk]
            let emailFilters: [SearchSourceType] = [.emailSummary, .emailChunk]

            await withTaskGroup(of: SemanticSearchResponse?.self) { group in
                if wantsNotes {
                    for q in subQueries {
                        group.addTask { [searchService] in
                            try? await searchService.search(query: q, sourceFilters: noteFilters)
                        }
                    }
                }
                if wantsEmails {
                    for q in subQueries {
                        group.addTask { [searchService] in
                            try? await searchService.search(query: q, sourceFilters: emailFilters)
                        }
                    }
                }
                // Calendar-title note boost (fallback path)
                if wantsNotes, let range = temporalRange {
                    let calendarEvents = await fetchCalendarEventsForRange(range)
                    for event in calendarEvents.prefix(5) {
                        group.addTask { [searchService] in
                            try? await searchService.search(query: event.title, sourceFilters: noteFilters)
                        }
                    }
                }
                for await result in group {
                    if let r = result {
                        allResults.append(contentsOf: r.results)
                        allCitations.append(contentsOf: r.citations)
                    }
                }
            }
        }

        let searchMs = Int(Date().timeIntervalSince(searchStart) * 1000)

        // 4. Deduplicate
        let dedupedResults = deduplicateResults(allResults)
        let dedupedCitations = deduplicateCitations(allCitations)

        // 5. MMR for diversity
        let diverseResults = applyMMR(dedupedResults, maxResults: options.maxEvidenceBlocks * 2)

        // 6. Build evidence blocks
        var evidence = buildEvidenceBlocks(from: diverseResults, max: options.maxEvidenceBlocks)

        // 6b. Temporal awareness — inject live calendar events.
        // If the planner identified that the user wants notes/transcripts, calendar invites
        // are supplementary (appended). Otherwise (schedule questions), they're primary.
        let plannerWantsNoteContent = plan?.sources.contains(where: {
            ["notes", "transcripts", "meetings"].contains($0)
        }) ?? false
        if options.enableTemporalResolution, let range = temporalRange {
            let calendarEvidence = await liveCalendarEvidence(in: range)
            if !calendarEvidence.isEmpty {
                if plannerWantsNoteContent {
                    let remaining = options.maxEvidenceBlocks - evidence.count
                    if remaining > 0 {
                        evidence.append(contentsOf: calendarEvidence.prefix(remaining))
                    }
                } else {
                    evidence = calendarEvidence + evidence
                    if evidence.count > options.maxEvidenceBlocks {
                        evidence = Array(evidence.prefix(options.maxEvidenceBlocks))
                    }
                }
            }
        }

        // 7. Agentic fallback — second-chance retrieval if evidence is thin
        var retrievalRounds = 1
        if options.enableAgenticFallback && evidence.count < 3 && !enrichedQuery.isEmpty {
            let topicWords = extractTopicNouns(from: enrichedQuery)
            let fallbackQuery = topicWords.isEmpty
                ? enrichedQuery
                : topicWords.joined(separator: " ")
            let fallbackRetrieval = try await searchService.search(query: fallbackQuery)
            let fallbackEvidence = buildEvidenceBlocks(from: fallbackRetrieval.results, max: options.maxEvidenceBlocks)
            if fallbackEvidence.count > evidence.count {
                evidence = fallbackEvidence
                allCitations.append(contentsOf: fallbackRetrieval.citations)
            }
            retrievalRounds = 2
        }

        let metadata = PipelineMetadata(
            intent: intent,
            enrichedQuery: enrichedQuery,
            subQueries: subQueries,
            llmRewrittenQuery: llmRewrittenQuery,
            searchLatencyMs: searchMs,
            totalResultCount: dedupedResults.count,
            retrievalRounds: retrievalRounds,
            temporalRange: temporalRange,
            queryPlan: plan
        )

        return PipelineResult(
            evidence: evidence,
            citations: dedupedCitations,
            allResults: dedupedResults,
            metadata: metadata
        )
    }

    // MARK: - Intent Detection

    func detectIntent(_ query: String) -> SemanticIntent {
        let lower = query.lowercased()
        if lower.contains("draft email") || lower.contains("reply") || lower.contains("compose") {
            return .draftEmail
        }
        if lower.contains("follow up") || lower.contains("todo") || lower.contains("action item") || lower.contains("to-do") {
            return .createFollowUp
        }
        return .answerQuestion
    }

    // MARK: - Query Enrichment

    /// Uses conversation history to resolve pronouns and coreferences.
    func enrichQuery(_ query: String, history: [SemanticChatMessage]) -> String {
        let recentHistory = history.suffix(6)
        guard !recentHistory.isEmpty else { return query }

        var topics: [String] = []
        for message in recentHistory {
            if message.role == .assistant && !message.content.isEmpty {
                let words = message.content.components(separatedBy: .whitespacesAndNewlines)
                    .filter { $0.count > 4 }
                    .prefix(10)
                topics.append(contentsOf: words.map { String($0) })
            }
        }

        let pronounPatterns = ["they", "their", "them", "he", "she", "his", "her", "it", "its", "that", "this", "those", "these"]
        let queryLower = query.lowercased()
        let hasPronouns = pronounPatterns.contains { queryLower.contains($0) }

        if hasPronouns && !topics.isEmpty {
            let lastAssistantContent = recentHistory
                .last(where: { $0.role == .assistant })?
                .content ?? ""
            let contextHint = String(lastAssistantContent.prefix(200))
            return "Context: \(contextHint)\nQuery: \(query)"
        }

        return query
    }

    // MARK: - Temporal Resolution

    /// Detects time references in the query and resolves them to a concrete date range.
    func resolveTemporalRange(_ query: String) -> (start: Date, end: Date, label: String)? {
        let lower = query.lowercased()
        let cal = Calendar.current
        let now = Date.now
        let startOfToday = cal.startOfDay(for: now)

        if lower.contains("today") || lower.contains("today's") {
            let endOfToday = cal.date(byAdding: .day, value: 1, to: startOfToday)!
            return (startOfToday, endOfToday, "today")
        }

        if lower.contains("tomorrow") || lower.contains("tomorrow's") {
            let startOfTomorrow = cal.date(byAdding: .day, value: 1, to: startOfToday)!
            let endOfTomorrow = cal.date(byAdding: .day, value: 2, to: startOfToday)!
            return (startOfTomorrow, endOfTomorrow, "tomorrow")
        }

        if lower.contains("yesterday") || lower.contains("yesterday's") {
            let startOfYesterday = cal.date(byAdding: .day, value: -1, to: startOfToday)!
            return (startOfYesterday, startOfToday, "yesterday")
        }

        if lower.contains("this week") || lower.contains("this week's") {
            let weekday = cal.component(.weekday, from: now)
            let daysFromMonday = (weekday + 5) % 7
            let startOfWeek = cal.date(byAdding: .day, value: -daysFromMonday, to: startOfToday)!
            let endOfWeek = cal.date(byAdding: .day, value: 7, to: startOfWeek)!
            return (startOfWeek, endOfWeek, "this week")
        }

        if lower.contains("next week") || lower.contains("next week's") {
            let weekday = cal.component(.weekday, from: now)
            let daysFromMonday = (weekday + 5) % 7
            let startOfThisWeek = cal.date(byAdding: .day, value: -daysFromMonday, to: startOfToday)!
            let startOfNextWeek = cal.date(byAdding: .day, value: 7, to: startOfThisWeek)!
            let endOfNextWeek = cal.date(byAdding: .day, value: 14, to: startOfThisWeek)!
            return (startOfNextWeek, endOfNextWeek, "next week")
        }

        if lower.contains("last week") || lower.contains("last week's") {
            let weekday = cal.component(.weekday, from: now)
            let daysFromMonday = (weekday + 5) % 7
            let startOfThisWeek = cal.date(byAdding: .day, value: -daysFromMonday, to: startOfToday)!
            let startOfLastWeek = cal.date(byAdding: .day, value: -7, to: startOfThisWeek)!
            return (startOfLastWeek, startOfThisWeek, "last week")
        }

        if lower.contains("this month") || lower.contains("this month's") {
            let startOfMonth = cal.date(from: cal.dateComponents([.year, .month], from: now))!
            let endOfMonth = cal.date(byAdding: .month, value: 1, to: startOfMonth)!
            return (startOfMonth, endOfMonth, "this month")
        }

        if lower.contains("last month") || lower.contains("last month's") {
            let startOfThisMonth = cal.date(from: cal.dateComponents([.year, .month], from: now))!
            let startOfLastMonth = cal.date(byAdding: .month, value: -1, to: startOfThisMonth)!
            return (startOfLastMonth, startOfThisMonth, "last month")
        }

        let weekdayNames = ["sunday": 1, "monday": 2, "tuesday": 3, "wednesday": 4, "thursday": 5, "friday": 6, "saturday": 7]
        for (name, target) in weekdayNames {
            if lower.contains(name) || lower.contains("\(name)'s") {
                let current = cal.component(.weekday, from: now)
                var daysBack = current - target
                if daysBack <= 0 { daysBack += 7 }
                let dayStart = cal.date(byAdding: .day, value: -daysBack, to: startOfToday)!
                let dayEnd = cal.date(byAdding: .day, value: 1, to: dayStart)!
                return (dayStart, dayEnd, name)
            }
        }

        return nil
    }

    // MARK: - Live Calendar Evidence

    func liveCalendarEvidence(in range: (start: Date, end: Date, label: String)) async -> [EvidenceBlock] {
        var events: [CalendarEvent] = []
        if let rangeProvider = liveCalendarRangeProvider {
            events = await rangeProvider(range.start, range.end)
        }
        if events.isEmpty, let provider = liveCalendarProvider {
            events = provider().filter { event in
                event.startDate >= range.start && event.startDate < range.end
            }
        }
        events.sort { $0.startDate < $1.startDate }
        guard !events.isEmpty else { return [] }

        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "EEEE d MMM"
        dateFormatter.locale = Locale(identifier: "en_AU")

        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "HH:mm"
        timeFormatter.locale = Locale(identifier: "en_AU")

        return events.prefix(20).map { event in
            let attendees = event.attendeeNames.isEmpty ? "No attendees listed" : event.attendeeNames.joined(separator: ", ")
            let time = event.isAllDay ? "All day" : "\(timeFormatter.string(from: event.startDate))–\(timeFormatter.string(from: event.endDate))"
            let location = event.location ?? ""
            let desc = event.eventDescription ?? ""

            var text = "\(dateFormatter.string(from: event.startDate)) | \(time)"
            text += "\nAttendees: \(attendees)"
            if !location.isEmpty { text += "\nLocation: \(location)" }
            if !desc.isEmpty { text += "\nDescription: \(String(desc.prefix(300)))" }

            return EvidenceBlock(
                sourceType: "Calendar Event (Live)",
                title: event.title,
                text: text,
                semanticScore: 1.0,
                sourceId: event.id,
                documentId: UUID()
            )
        }
    }

    /// Fetches raw calendar events for a temporal range (used to generate note-boost queries).
    private func fetchCalendarEventsForRange(_ range: (start: Date, end: Date, label: String)) async -> [CalendarEvent] {
        var events: [CalendarEvent] = []
        if let rangeProvider = liveCalendarRangeProvider {
            events = await rangeProvider(range.start, range.end)
        }
        if events.isEmpty, let provider = liveCalendarProvider {
            events = provider().filter { $0.startDate >= range.start && $0.startDate < range.end }
        }
        return events.filter { !$0.isAllDay }.sorted { $0.startDate < $1.startDate }
    }

    // MARK: - Sub-Query Generation

    func generateSubQueries(_ query: String, intent: SemanticIntent) -> [String] {
        var queries: [String] = []

        let stopWords: Set<String> = [
            "what", "when", "where", "who", "how", "why",
            "did", "does", "do", "the", "a", "an",
            "is", "was", "were", "are", "been", "be",
            "about", "from", "with", "for", "of", "in", "on", "at", "to",
            "can", "could", "would", "should", "will",
            "you", "me", "my", "i", "we", "our",
            "tell", "show", "give", "find", "get", "list", "summarise", "summarize", "explain",
            "please", "any", "some", "that", "this", "those", "these", "it", "its"
        ]

        let temporalWords: Set<String> = [
            "today", "tomorrow", "yesterday", "tonight", "morning", "afternoon", "evening",
            "last", "next", "recent", "latest", "upcoming", "past",
            "week", "month", "year", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
            "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"
        ]

        let words = query.split(separator: " ").map { String($0) }

        queries.append(query)

        let keywords = words.filter { word in
            let lower = word.lowercased().trimmingCharacters(in: .punctuationCharacters)
            return !stopWords.contains(lower) && !temporalWords.contains(lower) && lower.count > 1
        }

        if keywords.count >= 2 {
            queries.append(keywords.joined(separator: " "))
        }

        let topicWords = keywords
            .sorted { $0.count > $1.count }
            .prefix(3)
        if let primaryTopic = topicWords.first, primaryTopic.lowercased() != keywords.joined(separator: " ").lowercased() {
            queries.append(primaryTopic)
            if topicWords.count >= 2 {
                queries.append(topicWords.joined(separator: " "))
            }
        }

        var seen = Set<String>()
        queries = queries.filter { q in
            let key = q.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
            guard !key.isEmpty, !seen.contains(key) else { return false }
            seen.insert(key)
            return true
        }

        return queries
    }

    // MARK: - Query Planner (Orchestration Agent)

    /// Structured output from the LLM query planner.
    struct QueryPlan {
        /// Which data sources to search: "notes", "transcripts", "emails", "calendar", "all"
        let sources: [String]
        /// Core topic keywords extracted by the LLM
        let searchQueries: [String]
        /// A single optimised search query for embedding similarity
        let rewrittenQuery: String?
        /// The user's underlying intent: "find", "summarise", "draft", "schedule", "compare"
        let intent: String
    }

    /// Calls gpt-4.1-mini to decompose the user's natural-language query into a structured
    /// query plan. This replaces brittle keyword detection with genuine understanding.
    ///
    /// Example: "what was the meeting about hospitals today about"
    ///   → sources: ["notes", "transcripts", "calendar"]
    ///   → searchQueries: ["hospitals meeting", "hospital stock"]
    ///   → rewrittenQuery: "hospital meeting discussion notes"
    ///   → intent: "summarise"
    func planQuery(_ query: String) async -> QueryPlan? {
        let body: [String: Any] = [
            "model": Constants.AI.queryRewriteModel,
            "input": """
            You are a query planning agent for a personal productivity app. The user has notes, \
            meeting transcripts, emails, and calendar events indexed.

            Given the user's question, produce a JSON object with these fields:
            - "sources": array of data types to search. Values: "notes", "transcripts", "emails", "calendar". \
              Use "notes" for meeting notes/summaries, "transcripts" for spoken words from meetings, \
              "emails" for email threads, "calendar" for calendar events/invites. Include ALL relevant types. \
              For meeting-related queries, ALWAYS include both "notes" and "transcripts". \
              If the user mentions a person by name, also include "emails" (to find threads with that person).
            - "search_queries": array of 2-4 short, precise search queries (3-8 words each) optimised for \
              embedding similarity. Strip filler words, temporal references, and question syntax. \
              Focus on topic nouns, entities, and proper nouns. Generate diverse queries covering different \
              angles of the user's question.
            - "rewritten_query": a single best search query (3-8 words) for the core topic.
            - "intent": one of "find", "summarise", "draft", "schedule", "compare", "list", "explain".

            Return ONLY valid JSON, no markdown, no explanation.

            User question: \(query)
            """,
            "max_output_tokens": 300,
            "store": false
        ]

        do {
            let data = try await AIProxyClient.shared.request(
                provider: .openai,
                endpoint: "/v1/responses",
                body: body
            )
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let output = json["output"] as? [[String: Any]] else { return nil }

            for item in output {
                if let content = item["content"] as? [[String: Any]] {
                    for part in content {
                        if let text = part["text"] as? String {
                            return parseQueryPlan(text)
                        }
                    }
                }
            }
        } catch {
            print("[SearchQueryPipeline] Query planner failed: \(error.localizedDescription)")
        }
        return nil
    }

    /// Parse the LLM JSON response into a `QueryPlan`.
    private func parseQueryPlan(_ raw: String) -> QueryPlan? {
        let cleaned = raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "```json", with: "")
            .replacingOccurrences(of: "```", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard let data = cleaned.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            print("[SearchQueryPipeline] Could not parse query plan JSON: \(raw.prefix(200))")
            return nil
        }

        let sources = (json["sources"] as? [String]) ?? ["all"]
        let searchQueries = (json["search_queries"] as? [String]) ?? []
        let rewrittenQuery = json["rewritten_query"] as? String
        let intent = (json["intent"] as? String) ?? "find"

        guard !sources.isEmpty else { return nil }

        return QueryPlan(
            sources: sources,
            searchQueries: searchQueries,
            rewrittenQuery: rewrittenQuery,
            intent: intent
        )
    }

    /// Convert the planner's source list into concrete `SearchSourceType` filter arrays.
    /// Returns an array of filter sets — each set is run as a separate batch of searches.
    private func buildSourceFilters(from plan: QueryPlan) -> [[SearchSourceType]] {
        var filterSets: [[SearchSourceType]] = []

        let wantsNotes = plan.sources.contains("notes") || plan.sources.contains("meetings")
        let wantsTranscripts = plan.sources.contains("transcripts")
        let wantsEmails = plan.sources.contains("emails")
        let wantsCalendar = plan.sources.contains("calendar")
        let wantsAll = plan.sources.contains("all")

        if wantsAll {
            // Don't add any filtered set — broad search already covers everything
            return []
        }

        // Combine notes + transcripts since they're closely related
        if wantsNotes || wantsTranscripts {
            filterSets.append([.noteSummary, .noteChunk, .utteranceChunk])
        }
        if wantsEmails {
            filterSets.append([.emailSummary, .emailChunk])
        }
        if wantsCalendar {
            filterSets.append([.calendarSummary])
        }

        return filterSets
    }

    // MARK: - Topic Noun Extraction

    func extractTopicNouns(from query: String) -> [String] {
        let stopWords: Set<String> = [
            "what", "when", "where", "who", "how", "why", "did", "does", "do",
            "the", "a", "an", "is", "was", "were", "are", "been", "be",
            "about", "from", "with", "for", "of", "in", "on", "at", "to",
            "can", "could", "would", "should", "will",
            "you", "me", "my", "i", "we", "our",
            "tell", "show", "give", "find", "get", "list", "summarise", "summarize", "explain",
            "please", "any", "some", "that", "this", "those", "these", "it", "its",
            "today", "tomorrow", "yesterday", "tonight", "morning", "afternoon", "evening",
            "last", "next", "recent", "latest", "upcoming", "past",
            "week", "month", "year", "key", "highlights", "details", "related"
        ]

        return query.split(separator: " ")
            .map { String($0).lowercased().trimmingCharacters(in: .punctuationCharacters) }
            .filter { !stopWords.contains($0) && $0.count > 1 }
    }

    // MARK: - Deduplication

    func deduplicateResults(_ results: [SearchDocumentCandidate]) -> [SearchDocumentCandidate] {
        var seen = Set<UUID>()
        return results.filter { candidate in
            guard !seen.contains(candidate.id) else { return false }
            seen.insert(candidate.id)
            return true
        }.sorted { $0.fusedScore > $1.fusedScore }
    }

    func deduplicateCitations(_ citations: [SemanticCitation]) -> [SemanticCitation] {
        var seen = Set<String>()
        return citations.filter { citation in
            let key = "\(citation.sourceType.rawValue)::\(citation.sourceId)"
            guard !seen.contains(key) else { return false }
            seen.insert(key)
            return true
        }
    }

    // MARK: - MMR (Maximal Marginal Relevance)

    func applyMMR(_ results: [SearchDocumentCandidate], maxResults: Int) -> [SearchDocumentCandidate] {
        guard results.count > maxResults else { return results }

        var selected: [SearchDocumentCandidate] = []
        var sourceCount: [String: Int] = [:]
        let diversityPenalty = 0.3

        let sorted = results.sorted { $0.fusedScore > $1.fusedScore }

        for candidate in sorted {
            guard selected.count < maxResults else { break }

            let sourceKey = "\(candidate.sourceType.rawValue)::\(candidate.sourceId)"
            let count = sourceCount[sourceKey, default: 0]

            if count < 3 {
                let penalty = Double(count) * diversityPenalty
                let adjustedScore = candidate.fusedScore * (1.0 - penalty)
                if adjustedScore > 0 || selected.count < 4 {
                    selected.append(candidate)
                    sourceCount[sourceKey] = count + 1
                }
            }
        }

        return selected
    }

    // MARK: - Evidence Building

    func buildEvidenceBlocks(from results: [SearchDocumentCandidate], max: Int = Constants.Search.maxEvidenceBlocks) -> [EvidenceBlock] {
        results.prefix(max).compactMap { result in
            let body = (result.chunkText ?? result.summaryText ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !body.isEmpty else { return nil }
            return EvidenceBlock(
                sourceType: result.sourceType.displayName,
                title: result.title ?? result.sourceType.displayName,
                text: String(body.prefix(Constants.Search.maxEvidenceBlockCharacters)),
                semanticScore: result.semanticScore,
                sourceId: result.sourceId,
                documentId: result.id
            )
        }
    }
}
