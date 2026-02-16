import SwiftUI
import SwiftData
import Combine
import AppKit

/// Central observable state for the entire application.
/// Owns and coordinates all services; injected into the SwiftUI environment.
///
/// Pipeline when a meeting is active:
///   AudioCaptureManager → DeepgramService (mic + system) → TranscriptStore → UI
@Observable
final class AppState {
    
    // MARK: - Meeting State
    
    var currentMeeting: MeetingSession?
    var isMeetingActive: Bool { currentMeeting != nil }
    var isMeetingPaused = false
    
    // MARK: - UI State
    
    var isNotepadVisible = false
    var isNotesWindowVisible = false
    var showOnboarding = false
    
    /// Set to true by the HUD to request the notes window be opened.
    var shouldOpenNotesWindow = false
    
    /// Set to true to navigate to the live meeting note when the window opens.
    var shouldNavigateToLiveMeeting = false
    
    /// Tracks which note is currently being enhanced by AI.
    /// Views observe this to show the generating animation.
    var enhancingNoteId: UUID?
    var isEnhancingNotes: Bool { enhancingNoteId != nil }
    
    /// Debug: count of audio buffers sent to Deepgram (for live transcript UI).
    var debugMicBuffersSent = 0
    var debugSystemBuffersSent = 0
    var debugMicSuppressedBySystem = 0
    
    // MARK: - Supabase

    /// Supabase auth and config service. Set after authentication.
    var supabaseService: SupabaseService? {
        didSet {
            googleCalendarService.supabaseService = supabaseService
            gmailService.supabaseService = supabaseService

            // Trigger initial data fetch when Supabase auth is established
            if supabaseService?.isAuthenticated == true {
                configureSemanticSearchStack()
                Task {
                    await googleCalendarService.fetchAllCalendars()
                    await googleCalendarService.fetchEvents()
                }
                Task {
                    await gmailService.fetchMessages()
                    gmailService.startPolling()
                }
            }
        }
    }

    /// Sync service for bidirectional SwiftData <-> Supabase. Set after authentication.
    var syncService: SyncService? {
        didSet {
            noteRepository.syncService = syncService
            todoRepository.syncService = syncService
        }
    }

    /// Semantic search retrieval.
    var semanticSearchService: SemanticSearchService?
    /// Grounded semantic chatbot.
    var semanticChatService: SemanticChatService?
    /// Search ingestion + backfill orchestration.
    var searchIngestionService: SearchIngestionService?
    let searchTelemetryService = SearchTelemetryService()
    let embeddingService = EmbeddingService()
    let emailEncryptionService = EmailEncryptionService()
    var searchEvaluationService: SearchEvaluationService?

    var semanticQuery: String = ""
    var semanticResults: [SearchDocumentCandidate] = []
    var semanticCitations: [SemanticCitation] = []
    var semanticAnswer: String = ""
    var semanticChatMessages: [SemanticChatMessage] = []
    var isSemanticLoading = false

    // MARK: - Services

    let audioCaptureManager = AudioCaptureManager()
    let transcriptStore = TranscriptStore()
    let noteEnhancementService = NoteEnhancementService()
    let autoTaggingService = AutoTaggingService()
    let calendarService = CalendarService()
    let googleCalendarService = GoogleCalendarService()
    let gmailService = GmailService()
    let slackService = SlackService()
    let permissionsManager = PermissionsManager()
    let notificationService = NotificationService()
    let noteRepository: NoteRepository
    let todoRepository: TodoRepository
    let todoExtractionService = TodoExtractionService()
    let shareService = ShareService()
    let browserMonitorService = BrowserMonitorService()
    let appleNotesService = AppleNotesService()
    
    /// Meeting HUD — managed directly by AppState.
    private var meetingHUD: MeetingHUDController?
    
    /// Prompt HUD — shown when a meeting URL/app is detected.
    private var meetingPromptHUD: MeetingPromptHUDController?
    
    /// Reminder HUD — shown 1 minute before a calendar event.
    private var meetingReminderHUD: MeetingReminderHUDController?
    
    /// Tracks event IDs we've already shown a reminder for, to avoid duplicates.
    private var remindedEventIDs: Set<String> = []
    
    /// Timer for checking upcoming event reminders.
    private var reminderTimer: Timer?
    
    /// Observation token for browser monitor changes.
    private var browserMonitorTimer: Timer?
    
    /// Background timer that polls for new to-dos every 20 seconds.
    private var todoPollingTimer: Timer?
    
    /// Whether a to-do scan is currently in progress (drives UI indicator).
    var isTodoScanning = false
    
    /// Single Deepgram connection in multichannel mode.
    /// Receives interleaved stereo PCM where:
    /// - channel 0 = mic
    /// - channel 1 = system
    private var multichannelTranscription: DeepgramService?
    
    /// Interleaves independent mic/system mono streams into stereo for Deepgram.
    private let audioInterleaver = AudioInterleaver()
    
    /// Per-source buffer of Deepgram `is_final` chunks.
    /// Chunks are committed to TranscriptStore only when a boundary arrives
    /// (`speech_final` or `UtteranceEnd`).
    private var pendingFinalChunksBySource: [AudioSource: [TranscriptionResult]] = [:]
    
    /// Latest interim preview per source, used to avoid UI flicker
    /// when mic/system interim updates arrive back-to-back.
    private var latestInterimBySource: [AudioSource: TranscriptionResult] = [:]
    private var latestInterimUpdatedAt: [AudioSource: Date] = [:]
    private let systemInterimPriorityWindow: TimeInterval = 1.2
    private let interimDisplayHoldWindow: TimeInterval = 1.0
    private var displayedInterimResult: TranscriptionResult?
    private var displayedInterimUpdatedAt: Date?
    
    // MARK: - Speaker-mode Mic Suppression
    
    /// Treat system audio above this level as active remote speech.
    /// Raised from 0.06 → 0.14 so only clear speech triggers suppression,
    /// not background noise or low-level remote audio.
    private let systemSpeechLevelThreshold: Float = 0.14
    /// Require mic to be at least this much louder than system to allow barge-in.
    /// Lowered from 1.8 → 1.15 so the user doesn't need to shout over remote speakers.
    private let micBargeInRatio: Float = 1.15
    /// Absolute mic floor for barge-in.
    /// Lowered from 0.10 → 0.03 so quiet speech still passes through.
    private let micBargeInFloor: Float = 0.03
    
    // MARK: - Init
    
    init(modelContext: ModelContext) {
        self.noteRepository = NoteRepository(modelContext: modelContext)
        self.todoRepository = TodoRepository(modelContext: modelContext)
        
        let hasOnboarded = UserDefaults.standard.bool(
            forKey: Constants.Defaults.hasCompletedOnboarding
        )
        self.showOnboarding = !hasOnboarded
        
        // Wire Google Calendar into the calendar service
        calendarService.googleCalendarService = googleCalendarService
        
        // Wire Gmail → Calendar so adding an account covers both services
        gmailService.googleCalendarService = googleCalendarService
        
        // When Google events arrive, refresh the merged calendar list
        googleCalendarService.onEventsFetched = { [weak self] in
            self?.calendarService.fetchUpcomingEvents()
        }
        
        // Fetch Google Calendar events on launch if any accounts are connected
        if !googleCalendarService.accounts.isEmpty {
            Task {
                await googleCalendarService.fetchAllCalendars()
                await googleCalendarService.fetchEvents()
            }
        }
        
        // Fetch Gmail messages on launch if any accounts are connected, then start polling
        if !gmailService.accounts.isEmpty {
            Task { await gmailService.fetchMessages() }
            gmailService.startPolling()
        }
        
        // Show macOS notification when new emails arrive + extract to-dos
        gmailService.onNewEmailsDetected = { [weak self] threads in
            self?.notificationService.sendNewEmailNotification(threads: threads)
            Task { await self?.extractTodosFromNewEmails(threads: threads) }
        }

        noteRepository.onNoteChanged = { [weak self] note in
            guard let self, let ingestion = self.searchIngestionService else { return }
            Task { try? await ingestion.indexNote(note) }
        }
        noteRepository.onTranscriptSaved = { [weak self] note, utterances in
            guard let self, let ingestion = self.searchIngestionService else { return }
            Task { try? await ingestion.indexTranscript(for: note, utterances: utterances) }
        }
        gmailService.onThreadsFetched = { [weak self] _, threads in
            guard let self, let ingestion = self.searchIngestionService else { return }
            Task {
                for thread in threads {
                    try? await ingestion.indexEmailThread(thread)
                }
            }
        }
        
        // Slack feature paused — uncomment when re-enabling
        // if slackService.isConnected {
        //     Task { await slackService.fetchConversations() }
        // }
        
        // Start browser/meeting-app monitoring
        browserMonitorService.startMonitoring()
        startBrowserMonitorObservation()
        
        // Start calendar reminder monitoring
        startReminderMonitoring()
        
        // Start to-do background polling (every 20s)
        startTodoPolling()
    }
    
    // MARK: - Meeting Lifecycle
    
    /// Start a new meeting session, optionally linked to a calendar event.
    ///
    /// Order matters:
    /// 1. Create DeepgramService instances (synchronous — so they exist when audio arrives)
    /// 2. Wire audio pipeline (callback references the services)
    /// 3. Connect Deepgram WebSockets (async — queues audio until connected)
    /// 4. Start audio capture (begins flowing through the pipeline)
    func startMeeting(title: String? = nil, calendarEventId: String? = nil, attendees: [String] = []) {
        let meetingTitle = title ?? "New Note"
        pendingFinalChunksBySource.removeAll()
        latestInterimBySource.removeAll()
        latestInterimUpdatedAt.removeAll()
        displayedInterimResult = nil
        displayedInterimUpdatedAt = nil
        
        let note = noteRepository.createNote(
            title: meetingTitle,
            calendarEventId: calendarEventId,
            attendees: attendees
        )
        
        let session = MeetingSession(note: note)
        currentMeeting = session
        isNotepadVisible = true
        debugMicBuffersSent = 0
        debugSystemBuffersSent = 0
        debugMicSuppressedBySystem = 0
        
        print("[AppState] ▶ Meeting started: \(meetingTitle)")
        
        // Show the meeting HUD
        showMeetingHUD()
        
        // 1. Create transcription services FIRST (so they're non-nil when audio arrives)
        setupTranscriptionServices()
        
        // 2. Wire audio → transcription
        wireAudioPipeline()
        
        // 3. Connect Deepgram WebSockets (async, but audio will queue via sendAudio)
        connectTranscriptionWebSockets()
        
        // 4. Start audio capture LAST
        audioCaptureManager.startCapture()
        print("[AppState] ▶ Audio capture started")
    }
    
    /// Stop the current meeting session.
    func stopMeeting() {
        guard let session = currentMeeting else { return }
        
        print("[AppState] ■ Stopping meeting. Buffers sent — mic: \(debugMicBuffersSent), system: \(debugSystemBuffersSent)")
        print("[AppState] ■ Transcript utterances: \(transcriptStore.utteranceCount)")
        
        // ── Phase 1: Immediate UI teardown (must be fast) ──
        
        // Stop audio capture immediately so the UI feels responsive
        audioCaptureManager.stopCapture()
        audioCaptureManager.onAudioBuffer = nil
        
        // Flush buffered final chunks so they are included before save/discard.
        flushAllPendingFinalChunks(reason: "meeting_stop")
        
        // Disconnect transcription and stop interleaving.
        multichannelTranscription?.disconnect()
        multichannelTranscription = nil
        audioInterleaver.stop()
        audioInterleaver.onInterleavedBuffer = nil
        audioInterleaver.onMicLevel = nil
        audioInterleaver.onSystemLevel = nil
        
        // Hide the meeting HUD
        hideMeetingHUD()
        
        // Grab utterances and clear in-memory state immediately
        let utterances = transcriptStore.allUtterances
        transcriptStore.clear()
        pendingFinalChunksBySource.removeAll()
        latestInterimBySource.removeAll()
        latestInterimUpdatedAt.removeAll()
        displayedInterimResult = nil
        displayedInterimUpdatedAt = nil
        currentMeeting = nil
        isMeetingPaused = false
        
        // Set enhancing state early so UI shows "Generating notes…" right away
        enhancingNoteId = session.note.id
        
        // ── Phase 2: Heavy processing off the main thread ──
        
        let note = session.note
        let repo = noteRepository
        
        let existingTranscriptCount = note.transcript.count
        
        Task.detached(priority: .userInitiated) { [weak self] in
            // Word count check (can be slow for long transcripts)
            let wordCount = utterances.reduce(0) { count, u in
                count + u.text.split(separator: " ").count
            }
            
            let hasExistingTranscript = existingTranscriptCount > 0
            
            if utterances.isEmpty || wordCount < 30 {
                if hasExistingTranscript {
                    // Resumed meeting with few new words — keep existing note, just re-enhance
                    await MainActor.run {
                        if !utterances.isEmpty {
                            repo.saveTranscript(utterances, to: note)
                        }
                        repo.updateStatus(note, to: .ended)
                    }
                    print("[AppState] ■ Resumed session had few new words (\(wordCount)), re-enhancing existing note")
                    await self?.enhanceNotes(for: note)
                } else {
                    await MainActor.run {
                        repo.deleteNote(note)
                        self?.enhancingNoteId = nil
                    }
                    print("[AppState] ■ Discarded note — insufficient transcript (\(wordCount) words)")
                }
                return
            }
            
            // Persist transcript (inserts many model objects — can be slow)
            await MainActor.run {
                repo.saveTranscript(utterances, to: note)
                repo.updateStatus(note, to: .ended)
            }
            
            print("[AppState] ■ Transcript saved (\(utterances.count) utterances, \(wordCount) words)")
            
            // AI processing (already async)
            if !hasExistingTranscript {
                await self?.autoRenameNote(note)
            }
            await self?.enhanceNotes(for: note)
        }
    }
    
    /// Pause or resume the current meeting.
    func toggleMeetingPause() {
        guard currentMeeting != nil else { return }
        isMeetingPaused.toggle()
        
        if isMeetingPaused {
            audioCaptureManager.stopCapture()
            print("[AppState] ⏸ Meeting paused")
        } else {
            audioCaptureManager.startCapture()
            print("[AppState] ▶ Meeting resumed")
        }
    }
    
    /// Resume a previously stopped meeting, continuing to record on the same note.
    /// Preserves the existing transcript and appends new utterances when stopped again.
    func resumeMeeting(for note: Note) {
        guard currentMeeting == nil else {
            print("[AppState] ✗ Cannot resume — another meeting is active")
            return
        }
        
        pendingFinalChunksBySource.removeAll()
        latestInterimBySource.removeAll()
        latestInterimUpdatedAt.removeAll()
        displayedInterimResult = nil
        displayedInterimUpdatedAt = nil
        
        let session = MeetingSession(note: note)
        currentMeeting = session
        isNotepadVisible = true
        debugMicBuffersSent = 0
        debugSystemBuffersSent = 0
        debugMicSuppressedBySystem = 0
        
        // Update note status back to in-progress
        noteRepository.updateStatus(note, to: .inProgress)
        
        print("[AppState] ▶ Meeting resumed on note: \(note.title)")
        
        showMeetingHUD()
        setupTranscriptionServices()
        wireAudioPipeline()
        connectTranscriptionWebSockets()
        audioCaptureManager.startCapture()
        print("[AppState] ▶ Audio capture started (resumed)")
    }
    
    /// Re-generate AI-enhanced notes for a note that already has a transcript.
    func regenerateNotes(for note: Note) async {
        guard !note.transcript.isEmpty else {
            print("[AppState] ✗ Cannot regenerate — no transcript")
            return
        }
        await enhanceNotes(for: note)
    }
    
    /// Generate an AI title for a note from its transcript.
    func autoRenameNote(_ note: Note) async {
        // Capture @Model data on main thread before going async
        let transcript = await MainActor.run {
            note.transcript.map { utterance in
                let speaker = utterance.source == .mic ? "You" : "Them"
                return "[\(speaker)] \(utterance.text)"
            }.joined(separator: "\n")
        }
        
        guard !transcript.isEmpty else { return }
        
        do {
            let title = try await noteEnhancementService.generateTitle(transcript: transcript)
            await MainActor.run {
                noteRepository.renameNote(note, to: title)
            }
            print("[AppState] ✎ Auto-renamed note to: \(title)")
        } catch {
            print("[AppState] Auto-rename failed: \(error.localizedDescription)")
        }
    }
    
    /// Rename a note manually.
    func renameNote(_ note: Note, to title: String) {
        guard !title.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        noteRepository.renameNote(note, to: title)
    }
    
    /// Enhance the notes for a given note using AI.
    func enhanceNotes(for note: Note) async {
        // Capture @Model data on main thread before going async
        let (rawNotes, transcript): (String, String) = await MainActor.run {
            enhancingNoteId = note.id
            let raw = note.rawNotes
            let trans = note.transcript.map { utterance in
                let speaker = utterance.source == .mic ? "You" : "Them"
                return "[\(speaker)] \(utterance.text)"
            }.joined(separator: "\n")
            return (raw, trans)
        }
        
        do {
            let enhanced = try await noteEnhancementService.enhance(
                rawNotes: rawNotes,
                transcript: transcript
            )
            await MainActor.run {
                noteRepository.setEnhancedNotes(enhanced, for: note)
                noteRepository.updateStatus(note, to: .enhanced)
            }
            
            // Auto-extract to-dos from enhanced notes
            await extractTodosFromNote(note, enhancedNotes: enhanced)
        } catch {
            print("[AppState] Enhancement failed: \(error.localizedDescription)")
        }
        
        await MainActor.run {
            enhancingNoteId = nil
        }
    }
    
    // MARK: - Standalone Notes
    
    /// Create a new standalone note (no meeting/audio pipeline).
    @discardableResult
    func createStandaloneNote(title: String = "Untitled Note") -> Note {
        let note = noteRepository.createStandaloneNote(title: title)
        print("[AppState] ✎ Standalone note created: \(title)")
        return note
    }
    
    /// Enhance a standalone note using AI (no transcript context).
    func enhanceStandaloneNote(_ note: Note) async {
        let rawNotes: String = await MainActor.run {
            enhancingNoteId = note.id
            return note.rawNotes
        }
        
        guard !rawNotes.isEmpty else {
            await MainActor.run { enhancingNoteId = nil }
            return
        }
        
        do {
            let enhanced = try await noteEnhancementService.enhanceStandalone(rawNotes: rawNotes)
            await MainActor.run {
                noteRepository.setEnhancedNotes(enhanced, for: note)
                noteRepository.updateStatus(note, to: .enhanced)
            }
        } catch {
            print("[AppState] Standalone enhancement failed: \(error.localizedDescription)")
        }
        
        await MainActor.run {
            enhancingNoteId = nil
        }
    }
    
    /// Auto-tag a note using AI. Fetches existing tags to promote reuse.
    func autoTagNote(_ note: Note) async {
        let (content, existingTagNames): (String, [String]) = await MainActor.run {
            let text = note.rawNotes
            let names = noteRepository.fetchAllTags().map(\.name)
            return (text, names)
        }
        
        guard !content.isEmpty else { return }
        
        do {
            let suggestedNames = try await autoTaggingService.suggestTags(
                noteContent: content,
                existingTags: existingTagNames
            )
            await MainActor.run {
                // Assign a colour to each new tag from the palette
                let allTags = noteRepository.fetchAllTags()
                for name in suggestedNames {
                    let colorIndex = allTags.count + suggestedNames.firstIndex(of: name)!
                    let hex = Theme.tagColors[colorIndex % Theme.tagColors.count].hex
                    let tag = noteRepository.findOrCreateTag(name: name, colorHex: hex)
                    noteRepository.addTag(tag, to: note)
                }
            }
            print("[AppState] 🏷 Auto-tagged note with: \(suggestedNames)")
        } catch {
            print("[AppState] Auto-tagging failed: \(error.localizedDescription)")
        }
    }
    
    // MARK: - To-Do Extraction
    
    /// Extract to-dos from enhanced meeting notes and save them.
    /// Called automatically after note enhancement completes.
    private func extractTodosFromNote(_ note: Note, enhancedNotes: String) async {
        let (noteTitle, noteId): (String, UUID) = await MainActor.run {
            (note.title, note.id)
        }
        
        do {
            // Delete existing to-dos for this note (handles re-enhancement)
            await MainActor.run {
                todoRepository.deleteTodosForSource(sourceId: noteId.uuidString)
            }
            
            let todos = try await todoExtractionService.extractFromMeetingNotes(
                enhancedNotes: enhancedNotes,
                noteTitle: noteTitle,
                noteId: noteId
            )
            
            guard !todos.isEmpty else {
                print("[AppState] No to-dos extracted from note: \(noteTitle)")
                return
            }
            
            await MainActor.run {
                todoRepository.saveTodos(todos)
                notificationService.sendNewTodoNotification(
                    count: todos.count,
                    source: .meeting,
                    sourceTitle: noteTitle
                )
            }
            print("[AppState] Extracted \(todos.count) to-dos from note: \(noteTitle)")
        } catch {
            print("[AppState] To-do extraction from note failed: \(error.localizedDescription)")
        }
    }
    
    /// Extract to-dos from newly detected email threads.
    /// Tracks processed message IDs to avoid re-extraction.
    /// Passes existing to-do titles per thread to the AI for deduplication.
    private func extractTodosFromNewEmails(threads: [GmailThread]) async {
        // Load processed message IDs
        var processedIds = Set(
            UserDefaults.standard.stringArray(forKey: Constants.Defaults.processedTodoEmailMessageIds) ?? []
        )
        
        // Load exclusion rules so we can skip emails entirely (saves API calls)
        let excludedSenders = await MainActor.run { todoRepository.excludedSenders() }
        let excludedCategories = await MainActor.run { todoRepository.excludedCategories() }
        
        // Collect unprocessed messages, including the user's email for each
        // so the AI can determine if requests are directed at the user or others
        var unprocessed: [(message: GmailMessage, threadId: String, userEmail: String)] = []
        for thread in threads {
            // Use the latest message in the thread
            guard let latestMessage = thread.messages.last else { continue }
            let messageId = latestMessage.id
            guard !processedIds.contains(messageId) else { continue }
            
            // Skip emails from excluded senders
            if excludedSenders.contains(latestMessage.fromEmail.lowercased()) {
                processedIds.insert(messageId)
                continue
            }
            
            // Skip obvious automated/noreply senders — never actionable
            if Self.isAutomatedSender(latestMessage.fromEmail) {
                processedIds.insert(messageId)
                continue
            }
            
            // Skip emails matching excluded categories
            if !excludedCategories.isEmpty {
                let detected = EmailCategory.classify(
                    subject: latestMessage.subject,
                    fromEmail: latestMessage.fromEmail,
                    labelIds: latestMessage.labelIds,
                    attachmentFilenames: latestMessage.attachments.map(\.filename),
                    attachmentMimeTypes: latestMessage.attachments.map(\.mimeType)
                )
                if !detected.intersection(excludedCategories).isEmpty {
                    processedIds.insert(messageId)
                    continue
                }
            }
            
            let email = thread.accountEmail.isEmpty
                ? (gmailService.connectedEmail ?? "")
                : thread.accountEmail
            unprocessed.append((message: latestMessage, threadId: thread.id, userEmail: email))
            processedIds.insert(messageId)
        }
        
        guard !unprocessed.isEmpty else { return }
        
        // Build existing to-do titles per thread for deduplication.
        // The AI uses these to avoid creating duplicate tasks from quoted
        // or referenced content in later messages of the same thread.
        let existingTodosByThread: [String: [String]] = await MainActor.run {
            var map: [String: [String]] = [:]
            let threadIds = Set(unprocessed.map(\.threadId))
            for threadId in threadIds {
                let existing = todoRepository.fetchTodos(forSourceId: threadId)
                if !existing.isEmpty {
                    map[threadId] = existing.map(\.title)
                }
            }
            return map
        }
        
        // Extract to-dos from all unprocessed messages, with dedup context + category exclusions
        let todos = await todoExtractionService.extractFromEmails(
            unprocessed,
            existingTodosByThread: existingTodosByThread,
            excludedCategories: excludedCategories
        )
        
        if !todos.isEmpty {
            await MainActor.run {
                todoRepository.saveTodos(todos)
                notificationService.sendNewTodoNotification(
                    count: todos.count,
                    source: .email
                )
            }
            print("[AppState] Extracted \(todos.count) to-dos from \(unprocessed.count) new emails")
        }
        
        // Persist processed IDs (keep last 500 to avoid unbounded growth)
        let trimmed = Array(processedIds.suffix(500))
        UserDefaults.standard.set(trimmed, forKey: Constants.Defaults.processedTodoEmailMessageIds)
    }
    
    // MARK: - AI Connections
    
    /// Find meeting notes related to a given note by content similarity.
    func findRelatedNotes(for note: Note) async -> [Note] {
        let (content, allNotes): (String, [Note]) = await MainActor.run {
            let text = note.enhancedNotes ?? note.rawNotes
            let notes = noteRepository.fetchAllNotes().filter { $0.id != note.id }
            return (text, notes)
        }
        
        guard !content.isEmpty else { return [] }
        
        do {
            let noteSnippets = allNotes.prefix(20).map { n in
                "\(n.id.uuidString):::\(n.title) — \(String((n.enhancedNotes ?? n.rawNotes).prefix(200)))"
            }
            let relatedIds = try await autoTaggingService.findRelatedNotes(
                content: content,
                candidates: noteSnippets
            )
            return await MainActor.run {
                relatedIds.compactMap { idStr in
                    guard let uuid = UUID(uuidString: idStr) else { return nil }
                    return allNotes.first { $0.id == uuid }
                }
            }
        } catch {
            print("[AppState] Find related notes failed: \(error.localizedDescription)")
            return []
        }
    }
    
    /// Mark onboarding as complete.
    func completeOnboarding() {
        UserDefaults.standard.set(true, forKey: Constants.Defaults.hasCompletedOnboarding)
        showOnboarding = false
    }

    @MainActor
    func runSemanticSearch(_ query: String) async {
        guard let semanticSearchService else { return }
        semanticQuery = query
        isSemanticLoading = true
        defer { isSemanticLoading = false }

        do {
            let response = try await semanticSearchService.search(query: query)
            semanticResults = response.results
            semanticCitations = response.citations
        } catch {
            semanticResults = []
            semanticCitations = []
            searchTelemetryService.track(event: "semantic_search_error", fields: ["error": error.localizedDescription])
        }
    }

    @MainActor
    func askSemanticAssistant(_ query: String) async {
        guard let semanticChatService else { return }
        let prompt = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty else { return }

        // 1. Append user message and show thinking indicator
        semanticChatMessages.append(
            SemanticChatMessage(role: .user, content: prompt)
        )
        isSemanticLoading = true

        do {
            // 2. Retrieval + evidence building happens inside respondStreaming (this is the "thinking" phase)
            let (citations, stream) = try await semanticChatService.respondStreaming(
                to: prompt,
                conversationHistory: semanticChatMessages
            )

            // 3. Retrieval done — append empty assistant message and stop thinking indicator
            semanticChatMessages.append(
                SemanticChatMessage(role: .assistant, content: "", citations: citations)
            )
            let messageIndex = semanticChatMessages.count - 1
            isSemanticLoading = false

            // 4. Stream tokens into the message
            for await delta in stream {
                semanticChatMessages[messageIndex].content += delta
            }

            // 5. Final state update
            semanticAnswer = semanticChatMessages[messageIndex].content
            semanticCitations = citations

        } catch {
            isSemanticLoading = false
            semanticAnswer = "The assistant could not answer right now."
            semanticCitations = []
            semanticChatMessages.append(
                SemanticChatMessage(role: .assistant, content: semanticAnswer)
            )
            searchTelemetryService.track(event: "semantic_chat_error", fields: ["error": error.localizedDescription])
        }
    }

    @MainActor
    func clearSemanticChat() {
        semanticChatMessages = []
        semanticAnswer = ""
        semanticCitations = []
        semanticResults = []
        semanticQuery = ""
    }

    private func configureSemanticSearchStack() {
        guard let supabase = supabaseService else { return }
        guard searchIngestionService == nil else { return }

        let semanticSearch = SemanticSearchService(
            client: supabase.client,
            embeddingService: embeddingService,
            telemetry: searchTelemetryService
        )
        let semanticChat = SemanticChatService(
            searchService: semanticSearch,
            telemetry: searchTelemetryService
        )
        let ingestion = SearchIngestionService(
            client: supabase.client,
            embeddingService: embeddingService,
            encryptionService: emailEncryptionService,
            telemetry: searchTelemetryService
        )

        self.semanticSearchService = semanticSearch
        self.semanticChatService = semanticChat
        self.searchIngestionService = ingestion
        self.searchEvaluationService = SearchEvaluationService(searchService: semanticSearch, telemetry: searchTelemetryService)
    }

    func runSemanticBackfillIfNeeded() async {
        guard let ingestion = searchIngestionService else { return }
        await gmailService.fetchMailbox(.inbox)
        await gmailService.fetchMailbox(.sent)
        calendarService.fetchUpcomingEvents()
        let notes = noteRepository.fetchAllNotes()
        let threads = gmailService.allThreads()
        let events = calendarService.upcomingEvents
        await ingestion.runMandatoryBackfill(notes: notes, threads: threads, calendarEvents: events)
    }

    func runSemanticEvaluationSuite() async -> [SearchEvaluationResult] {
        guard let evaluator = searchEvaluationService else { return [] }
        let suite = [
            SearchEvaluationCase(query: "What decisions were made this week?", minimumResults: 3, minimumCitations: 2),
            SearchEvaluationCase(query: "Find my latest email follow-up commitments", minimumResults: 2, minimumCitations: 2),
            SearchEvaluationCase(query: "Which meetings mention calendar launches?", minimumResults: 2, minimumCitations: 2)
        ]
        return await evaluator.run(cases: suite)
    }
    
    // MARK: - Audio → Transcription Pipeline
    
    /// Create a single multichannel Deepgram service and wire result callbacks.
    /// Must happen BEFORE audio starts flowing so the optional chain doesn't drop data.
    private func setupTranscriptionServices() {
        guard let apiKey = supabaseService?.deepgramAPIKey ?? KeychainHelper.get(key: "deepgram_api_key"),
              !apiKey.isEmpty else {
            print("[AppState] ⚠ No Deepgram API key — transcription disabled.")
            return
        }

        print("[AppState] Creating Deepgram multichannel service (key: \(apiKey.prefix(8))…)")
        
        let service = DeepgramService(source: .mic, multichannel: true)
        service.onUtterance = { [weak self] result in
            self?.handleTranscriptionResult(result)
        }
        service.onVADEvent = { [weak self] event in
            self?.handleTranscriptionVADEvent(event)
        }
        self.multichannelTranscription = service
    }
    
    /// Wire mic/system capture into the interleaver, then send stereo frames to Deepgram.
    private func wireAudioPipeline() {
        audioInterleaver.stop()
        audioInterleaver.start()
        
        audioInterleaver.onInterleavedBuffer = { [weak self] interleavedData in
            guard let self, let service = self.multichannelTranscription else { return }
            service.sendAudio(interleavedData)
        }
        
        audioCaptureManager.onAudioBuffer = { [weak self] data, source in
            guard let self else { return }
            switch source {
            case .mic:
                if self.shouldSuppressMicBuffer() {
                    self.debugMicSuppressedBySystem += 1
                    if self.debugMicSuppressedBySystem % 100 == 1 {
                        print("[Pipeline] Suppressed mic buffer #\(self.debugMicSuppressedBySystem) (micLevel=\(String(format: "%.2f", self.audioCaptureManager.micLevel)), systemLevel=\(String(format: "%.2f", self.audioCaptureManager.systemLevel)))")
                    }
                    return
                }
                
                self.audioInterleaver.appendMicAudio(data)
                self.debugMicBuffersSent += 1
                if self.debugMicBuffersSent % 100 == 1 {
                    let connected = self.multichannelTranscription?.isConnected ?? false
                    print("[Pipeline] Mic buffer #\(self.debugMicBuffersSent) → interleaver (\(data.count) bytes, deepgram_connected: \(connected))")
                }
            case .system:
                self.audioInterleaver.appendSystemAudio(data)
                self.debugSystemBuffersSent += 1
                if self.debugSystemBuffersSent % 100 == 1 {
                    let connected = self.multichannelTranscription?.isConnected ?? false
                    print("[Pipeline] System buffer #\(self.debugSystemBuffersSent) → interleaver (\(data.count) bytes, deepgram_connected: \(connected))")
                }
            }
        }
    }
    
    private func shouldSuppressMicBuffer() -> Bool {
        let systemLevel = audioCaptureManager.systemLevel
        let micLevel = audioCaptureManager.micLevel
        
        let systemSpeechActive = systemLevel >= systemSpeechLevelThreshold
        guard systemSpeechActive else { return false }
        
        // Allow local user barge-in only when mic is clearly dominant.
        let micDominant = micLevel >= max(micBargeInFloor, systemLevel * micBargeInRatio)
        return !micDominant
    }
    
    /// Connect the Deepgram WebSockets asynchronously.
    private func connectTranscriptionWebSockets() {
        guard let service = multichannelTranscription else { return }
        
        Task {
            do {
                try await service.connect(for: .mic)
                print("[AppState] ✓ Deepgram multichannel connected")
            } catch {
                print("[AppState] ✗ Deepgram multichannel connect failed: \(error.localizedDescription)")
            }
        }
    }
    
    /// Route transcription results to the TranscriptStore.
    private func handleTranscriptionResult(_ result: TranscriptionResult) {
        if result.isFinal {
            latestInterimBySource[result.source] = nil
            latestInterimUpdatedAt[result.source] = nil
            refreshDisplayedInterim()
            
            appendFinalChunk(result)
            if result.speechFinal {
                flushPendingFinalChunks(for: result.source, reason: "speech_final")
            }
        } else {
            let preview = buildContinuousInterimPreview(from: result)
            
            // Suppress mic interim if it likely mirrors ongoing system speech.
            if preview.source == .mic && shouldSuppressMicInterim(preview) {
                return
            }
            
            latestInterimBySource[preview.source] = preview
            latestInterimUpdatedAt[preview.source] = Date.now
            refreshDisplayedInterim()
        }
    }
    
    private func handleTranscriptionVADEvent(_ event: VADEvent) {
        switch event {
        case .speechStarted:
            break
        case .speechEnded:
            // In multichannel mode this VAD event isn't source-specific,
            // so flush all buffered channels.
            flushAllPendingFinalChunks(reason: "utterance_end")
            latestInterimBySource.removeAll()
            latestInterimUpdatedAt.removeAll()
            refreshDisplayedInterim()
        }
    }
    
    private func appendFinalChunk(_ result: TranscriptionResult) {
        var chunks = pendingFinalChunksBySource[result.source, default: []]
        chunks.append(result)
        pendingFinalChunksBySource[result.source] = chunks
        
        print("[Transcript] FINAL chunk [\(result.source.displayLabel)] speech_final=\(result.speechFinal): \(result.text)")
    }
    
    private func flushPendingFinalChunks(for source: AudioSource, reason: String) {
        guard let chunks = pendingFinalChunksBySource[source], !chunks.isEmpty else { return }
        pendingFinalChunksBySource[source] = []
        
        let combined = combineFinalChunks(chunks, source: source)
        print("[Transcript] COMMIT [\(source.displayLabel)] via \(reason): \(combined.text)")
        transcriptStore.addFinalResult(combined)
    }
    
    private func flushAllPendingFinalChunks(reason: String) {
        flushPendingFinalChunks(for: .mic, reason: reason)
        flushPendingFinalChunks(for: .system, reason: reason)
    }
    
    private func combineFinalChunks(_ chunks: [TranscriptionResult], source: AudioSource) -> TranscriptionResult {
        let text = chunks
            .map(\.text)
            .joined(separator: " ")
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        
        let totalConfidence = chunks.reduce(0.0) { $0 + Double($1.confidence) }
        let averageConfidence = Float(totalConfidence / Double(chunks.count))
        
        return TranscriptionResult(
            text: text,
            source: source,
            startTime: chunks.first?.startTime ?? Date.now,
            endTime: chunks.last?.endTime ?? Date.now,
            confidence: averageConfidence,
            isFinal: true,
            speechFinal: true
        )
    }
    
    private func buildContinuousInterimPreview(from interim: TranscriptionResult) -> TranscriptionResult {
        let buffered = pendingFinalChunksBySource[interim.source, default: []]
        guard !buffered.isEmpty else { return interim }
        
        let combinedText = (buffered.map(\.text) + [interim.text])
            .joined(separator: " ")
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        
        return TranscriptionResult(
            text: combinedText,
            source: interim.source,
            startTime: buffered.first?.startTime ?? interim.startTime,
            endTime: interim.endTime,
            confidence: interim.confidence,
            isFinal: false,
            speechFinal: false
        )
    }
    
    private func refreshDisplayedInterim() {
        let now = Date.now
        let systemInterim = latestInterimBySource[.system]
        let micInterim = latestInterimBySource[.mic]
        
        if let systemInterim,
           let updatedAt = latestInterimUpdatedAt[.system],
           now.timeIntervalSince(updatedAt) <= systemInterimPriorityWindow {
            displayedInterimResult = systemInterim
            displayedInterimUpdatedAt = now
            transcriptStore.updateInterim(systemInterim)
            return
        }
        
        if let micInterim {
            displayedInterimResult = micInterim
            displayedInterimUpdatedAt = now
            transcriptStore.updateInterim(micInterim)
            return
        }
        
        if let systemInterim {
            displayedInterimResult = systemInterim
            displayedInterimUpdatedAt = now
            transcriptStore.updateInterim(systemInterim)
            return
        }
        
        if let displayedInterimResult,
           let displayedInterimUpdatedAt,
           now.timeIntervalSince(displayedInterimUpdatedAt) <= interimDisplayHoldWindow {
            transcriptStore.updateInterim(displayedInterimResult)
            return
        }
        
        self.displayedInterimResult = nil
        self.displayedInterimUpdatedAt = nil
        transcriptStore.interimResult = nil
    }
    
    private func shouldSuppressMicInterim(_ micPreview: TranscriptionResult) -> Bool {
        if let systemInterim = latestInterimBySource[.system],
           textLikelyEcho(micPreview.text, systemInterim.text) {
            return true
        }
        
        let recentSystemFinals = pendingFinalChunksBySource[.system, default: []].suffix(3)
        for systemFinal in recentSystemFinals {
            if textLikelyEcho(micPreview.text, systemFinal.text) {
                return true
            }
        }
        
        return false
    }
    
    private func textLikelyEcho(_ a: String, _ b: String) -> Bool {
        let wordsA = Set(normalisedText(a).split(separator: " "))
        let wordsB = Set(normalisedText(b).split(separator: " "))
        guard !wordsA.isEmpty, !wordsB.isEmpty else { return false }
        
        let overlap = wordsA.intersection(wordsB).count
        let smaller = min(wordsA.count, wordsB.count)
        guard smaller > 0 else { return false }
        
        let ratio = Double(overlap) / Double(smaller)
        return ratio >= (smaller <= 4 ? 0.8 : 0.6)
    }
    
    private func normalisedText(_ text: String) -> String {
        text
            .lowercased()
            .replacingOccurrences(of: "[^a-z0-9\\s]", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
    
    // MARK: - Meeting HUD
    
    private func showMeetingHUD() {
        if meetingHUD == nil {
            meetingHUD = MeetingHUDController(appState: self)
        }
        meetingHUD?.show()
        print("[AppState] Meeting HUD shown")
    }
    
    private func hideMeetingHUD() {
        meetingHUD?.close()
        meetingHUD = nil
        print("[AppState] Meeting HUD hidden")
    }
    
    // MARK: - Meeting Prompt HUD (Browser Detection)
    
    /// Poll the browser monitor service and show/hide the prompt HUD accordingly.
    /// We use a Timer because `@Observable` withObservationTracking doesn't work well
    /// outside of SwiftUI view bodies.
    private func startBrowserMonitorObservation() {
        browserMonitorTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.updateMeetingPromptHUD()
        }
    }
    
    private func updateMeetingPromptHUD() {
        // Don't show the prompt if a meeting is already recording
        guard !isMeetingActive else {
            if meetingPromptHUD?.isVisible == true {
                meetingPromptHUD?.close()
                meetingPromptHUD = nil
            }
            return
        }
        
        let hasDetection = browserMonitorService.detectedMeetingSource != nil
        
        if hasDetection, let source = browserMonitorService.detectedMeetingSource {
            showMeetingPromptHUD(source: source)
        } else if meetingPromptHUD?.isVisible == true {
            meetingPromptHUD?.close()
            meetingPromptHUD = nil
        }
    }
    
    private func showMeetingPromptHUD(source: String) {
        if meetingPromptHUD == nil {
            let controller = MeetingPromptHUDController()
            
            controller.onStartRecording = { [weak self] in
                guard let self else { return }
                self.meetingPromptHUD?.close()
                self.meetingPromptHUD = nil
                self.browserMonitorService.dismissCurrentURL()
                self.startMeeting(title: "\(source) Meeting")
            }
            
            controller.onDismiss = { [weak self] in
                guard let self else { return }
                self.browserMonitorService.dismissCurrentURL()
                self.meetingPromptHUD?.close()
                self.meetingPromptHUD = nil
            }
            
            meetingPromptHUD = controller
        }
        
        meetingPromptHUD?.show(meetingSource: source)
    }
    
    // MARK: - Calendar Event Reminders
    
    /// Poll every 15 seconds for events starting within 1 minute and show a reminder HUD.
    private func startReminderMonitoring() {
        reminderTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            self?.checkForUpcomingReminders()
        }
    }
    
    private func checkForUpcomingReminders() {
        // Don't show reminders while already recording
        guard !isMeetingActive else { return }
        
        let now = Date.now
        let oneMinuteFromNow = now.addingTimeInterval(60)
        
        // Find events starting within the next 60 seconds that we haven't reminded about
        let upcoming = calendarService.upcomingEvents.first { event in
            event.startDate > now &&
            event.startDate <= oneMinuteFromNow &&
            !remindedEventIDs.contains(event.id)
        }
        
        if let event = upcoming {
            remindedEventIDs.insert(event.id)
            showMeetingReminderHUD(event: event)
        }
    }
    
    private func showMeetingReminderHUD(event: CalendarEvent) {
        let controller = MeetingReminderHUDController()
        
        controller.onStartRecording = { [weak self] title, eventId, attendees in
            guard let self else { return }
            self.meetingReminderHUD?.close()
            self.meetingReminderHUD = nil
            self.startMeeting(title: title, calendarEventId: eventId, attendees: attendees)
        }
        
        controller.onDismiss = { [weak self] in
            self?.meetingReminderHUD?.close()
            self?.meetingReminderHUD = nil
        }
        
        meetingReminderHUD = controller
        controller.show(event: event)
    }
    
    // MARK: - To-Do Background Polling
    
    /// Start a 20-second timer that scans for unprocessed email threads
    /// and extracts to-dos from any that haven't been analysed yet.
    private func startTodoPolling() {
        todoPollingTimer?.invalidate()
        let timer = Timer(timeInterval: 20.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { await self.todoPollingTick() }
        }
        RunLoop.main.add(timer, forMode: .common)
        todoPollingTimer = timer
        print("[AppState] To-do polling started (every 20s)")
    }
    
    /// Single tick of the to-do polling cycle.
    /// Checks inbox threads for any unprocessed messages and extracts to-dos.
    private func todoPollingTick() async {
        // Don't scan if Gmail isn't connected
        guard gmailService.isConnected else { return }
        
        await MainActor.run { isTodoScanning = true }
        defer { Task { @MainActor in isTodoScanning = false } }
        
        // Load processed message IDs
        let processedIds = Set(
            UserDefaults.standard.stringArray(forKey: Constants.Defaults.processedTodoEmailMessageIds) ?? []
        )
        
        // Check inbox threads for any unprocessed messages
        let inboxThreads = await MainActor.run { gmailService.inboxThreads }
        let defaultEmail = await MainActor.run { gmailService.connectedEmail ?? "" }
        let excludedSenders = await MainActor.run { todoRepository.excludedSenders() }
        let excludedCategories = await MainActor.run { todoRepository.excludedCategories() }
        
        var unprocessed: [(message: GmailMessage, threadId: String, userEmail: String)] = []
        var newProcessedIds = processedIds
        
        for thread in inboxThreads {
            guard let latestMessage = thread.messages.last else { continue }
            guard !processedIds.contains(latestMessage.id) else { continue }
            
            // Skip emails from excluded senders
            if excludedSenders.contains(latestMessage.fromEmail.lowercased()) {
                newProcessedIds.insert(latestMessage.id)
                continue
            }
            
            // Skip obvious automated/noreply senders
            if Self.isAutomatedSender(latestMessage.fromEmail) {
                newProcessedIds.insert(latestMessage.id)
                continue
            }
            
            // Skip emails matching excluded categories
            if !excludedCategories.isEmpty {
                let detected = EmailCategory.classify(
                    subject: latestMessage.subject,
                    fromEmail: latestMessage.fromEmail,
                    labelIds: latestMessage.labelIds,
                    attachmentFilenames: latestMessage.attachments.map(\.filename),
                    attachmentMimeTypes: latestMessage.attachments.map(\.mimeType)
                )
                if !detected.intersection(excludedCategories).isEmpty {
                    newProcessedIds.insert(latestMessage.id)
                    continue
                }
            }
            
            let email = thread.accountEmail.isEmpty ? defaultEmail : thread.accountEmail
            unprocessed.append((message: latestMessage, threadId: thread.id, userEmail: email))
            newProcessedIds.insert(latestMessage.id)
        }
        
        guard !unprocessed.isEmpty else { return }
        
        // Build existing to-do titles per thread for deduplication
        let existingTodosByThread: [String: [String]] = await MainActor.run {
            var map: [String: [String]] = [:]
            let threadIds = Set(unprocessed.map(\.threadId))
            for threadId in threadIds {
                let existing = todoRepository.fetchTodos(forSourceId: threadId)
                if !existing.isEmpty {
                    map[threadId] = existing.map(\.title)
                }
            }
            return map
        }
        
        let todos = await todoExtractionService.extractFromEmails(
            unprocessed,
            existingTodosByThread: existingTodosByThread,
            excludedCategories: excludedCategories
        )
        
        if !todos.isEmpty {
            await MainActor.run {
                todoRepository.saveTodos(todos)
                notificationService.sendNewTodoNotification(
                    count: todos.count,
                    source: .email
                )
            }
            print("[AppState] [Poll] Extracted \(todos.count) to-dos from \(unprocessed.count) emails")
        }
        
        // Persist processed IDs
        let trimmed = Array(newProcessedIds.suffix(500))
        UserDefaults.standard.set(trimmed, forKey: Constants.Defaults.processedTodoEmailMessageIds)
    }
    
    // MARK: - Automated Sender Detection
    
    /// Returns true if the sender email looks like an automated/noreply address.
    /// These are never actionable so we skip them entirely before calling the AI.
    static func isAutomatedSender(_ email: String) -> Bool {
        let lower = email.lowercased()
        
        // Noreply / no-reply patterns
        let noReplyPrefixes = [
            "noreply@", "no-reply@", "no_reply@", "donotreply@",
            "do-not-reply@", "do_not_reply@", "mailer-daemon@",
            "postmaster@", "notifications@", "notification@",
            "alert@", "alerts@", "info@", "news@", "newsletter@",
            "marketing@", "promo@", "promotions@", "updates@",
            "support@", "hello@", "team@", "billing@", "receipt@",
            "receipts@", "invoice@", "invoices@", "statement@",
            "statements@", "security@", "verify@", "verification@",
            "confirm@", "confirmation@", "account@", "accounts@",
            "service@", "services@", "system@", "auto@", "automated@",
            "digest@", "summary@", "feedback@", "survey@"
        ]
        
        if noReplyPrefixes.contains(where: { lower.hasPrefix($0) }) {
            return true
        }
        
        // Common automated sender domains
        let automatedDomains = [
            "amazonses.com", "sendgrid.net", "mailchimp.com",
            "mandrillapp.com", "mailgun.org", "postmarkapp.com",
            "hubspot.com", "intercom-mail.com", "notify.bugsnag.com",
            "github.com", "gitlab.com", "atlassian.net",
            "jira.com", "linear.app", "notion.so",
            "slack.com", "figma.com", "vercel.com",
            "stripe.com", "paypal.com", "square.com",
            "shopify.com", "calendly.com", "zoom.us",
            "facebookmail.com", "linkedin.com", "twitter.com",
            "twittermail.com", "pinterest.com", "instagram.com",
            "youtube.com", "google.com", "apple.com",
            "microsoft.com", "dropbox.com", "canva.com",
            "trello.com", "asana.com", "monday.com"
        ]
        
        let domain = lower.components(separatedBy: "@").last ?? ""
        if automatedDomains.contains(domain) {
            return true
        }
        
        return false
    }
}

/// Represents an in-progress meeting session.
struct MeetingSession {
    let note: Note
    let startedAt = Date.now
}
