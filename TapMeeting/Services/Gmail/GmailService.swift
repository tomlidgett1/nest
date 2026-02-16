import Foundation
import AppKit

// MARK: - Gmail Account Model

/// A connected Gmail account with per-account token storage.
struct GmailAccount: Identifiable, Codable, Equatable {
    let id: String
    let email: String
    let addedAt: Date
    
    /// Keychain key for this account's access token.
    var accessTokenKey: String { "gmail_access_token_\(id)" }
    /// Keychain key for this account's refresh token.
    var refreshTokenKey: String { "gmail_refresh_token_\(id)" }
}

// MARK: - Mailbox Enum

/// Gmail label-based mailbox categories.
enum Mailbox: String, CaseIterable, Identifiable {
    case inbox = "INBOX"
    case sent = "SENT"
    case drafts = "DRAFT"
    case archived = "ARCHIVED"
    case bin = "TRASH"
    
    var id: String { rawValue }
    
    var displayName: String {
        switch self {
        case .inbox: return "Inbox"
        case .sent: return "Sent"
        case .drafts: return "Drafts"
        case .archived: return "Archived"
        case .bin: return "Bin"
        }
    }
    
    var icon: String {
        switch self {
        case .inbox: return "tray"
        case .sent: return "paperplane"
        case .drafts: return "doc.text"
        case .archived: return "archivebox"
        case .bin: return "trash"
        }
    }
}

// MARK: - Gmail Attachment Model

/// Metadata for a file attached to a Gmail message.
struct GmailAttachment: Identifiable, Equatable {
    let id: String              // unique ID (attachmentId or generated)
    let messageId: String       // parent message ID
    let filename: String        // original filename
    let mimeType: String        // MIME type (e.g. "application/pdf")
    let size: Int               // size in bytes
    let attachmentId: String    // Gmail attachment ID for download
    
    /// Human-readable file size string.
    var formattedSize: String {
        if size < 1024 { return "\(size) B" }
        let kb = Double(size) / 1024.0
        if kb < 1024 { return String(format: "%.0f KB", kb) }
        let mb = kb / 1024.0
        return String(format: "%.1f MB", mb)
    }
    
    /// SF Symbol name based on MIME type.
    var iconName: String {
        let lower = mimeType.lowercased()
        if lower.hasPrefix("image/") { return "photo" }
        if lower.contains("pdf") { return "doc.richtext" }
        if lower.contains("zip") || lower.contains("compressed") || lower.contains("archive") { return "doc.zipper" }
        if lower.contains("spreadsheet") || lower.contains("excel") || lower.contains("csv") { return "tablecells" }
        if lower.contains("presentation") || lower.contains("powerpoint") { return "play.rectangle" }
        if lower.contains("word") || lower.contains("document") || lower.hasPrefix("text/") { return "doc.text" }
        if lower.hasPrefix("audio/") { return "waveform" }
        if lower.hasPrefix("video/") { return "film" }
        return "paperclip"
    }
}

// MARK: - Email Attachment File (for composing)

/// A local file to attach when sending an email.
struct EmailAttachmentFile: Identifiable, Equatable {
    let id: String
    let filename: String
    let mimeType: String
    let data: Data
    
    /// Human-readable file size string.
    var formattedSize: String {
        let size = data.count
        if size < 1024 { return "\(size) B" }
        let kb = Double(size) / 1024.0
        if kb < 1024 { return String(format: "%.0f KB", kb) }
        let mb = kb / 1024.0
        return String(format: "%.1f MB", mb)
    }
    
    static func == (lhs: EmailAttachmentFile, rhs: EmailAttachmentFile) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Gmail Message Model

/// A single email message fetched from the Gmail API.
struct GmailMessage: Identifiable, Equatable {
    let id: String
    let threadId: String
    let subject: String
    let from: String          // display name
    let fromEmail: String     // raw email address
    let to: [String]          // recipient emails
    let cc: [String]          // CC emails
    let snippet: String
    let bodyPlain: String     // text/plain body
    let bodyHTML: String      // text/html body
    let date: Date
    var isUnread: Bool
    let labelIds: [String]
    let hasAttachments: Bool
    let attachments: [GmailAttachment]  // parsed attachment metadata
    let messageIdHeader: String   // Message-ID header for threading
    let references: String        // References header for threading
    let inReplyTo: String         // In-Reply-To header for threading
    
    static func == (lhs: GmailMessage, rhs: GmailMessage) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Gmail Thread Model

/// A conversation thread containing one or more messages.
/// Fetched via `GET /users/me/threads/{id}?format=full`.
struct GmailThread: Identifiable, Equatable {
    let id: String
    var messages: [GmailMessage]
    /// The account ID this thread was fetched from (used to route API calls to the right token).
    var accountId: String = ""
    /// The email address of the account this thread belongs to (for display).
    var accountEmail: String = ""
    
    /// Subject line — taken from the first message in the thread.
    var subject: String {
        let raw = messages.first?.subject ?? ""
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? "No Subject" : raw
    }
    
    /// The most recent message in the thread.
    var latestMessage: GmailMessage? {
        messages.last
    }
    
    /// Snippet from the most recent message.
    var snippet: String {
        latestMessage?.snippet ?? ""
    }
    
    /// Date of the most recent message (used for sorting).
    var date: Date {
        latestMessage?.date ?? .distantPast
    }
    
    /// Whether any message in the thread is unread.
    var isUnread: Bool {
        messages.contains { $0.isUnread }
    }
    
    /// Number of messages in the thread.
    var messageCount: Int {
        messages.count
    }
    
    /// Whether any message in the thread has attachments.
    var hasAttachments: Bool {
        messages.contains { $0.hasAttachments }
    }
    
    /// Unique sender display names across the thread.
    var participants: [String] {
        var seen = Set<String>()
        var result: [String] = []
        for msg in messages {
            let name = msg.from
            if !seen.contains(name) {
                seen.insert(name)
                result.append(name)
            }
        }
        return result
    }
    
    /// A compact display string for participants, e.g. "Rohit, Tom" or "Rohit +2".
    var participantsSummary: String {
        let names = participants
        if names.count <= 2 {
            return names.joined(separator: ", ")
        }
        return "\(names[0]) +\(names.count - 1)"
    }
    
    static func == (lhs: GmailThread, rhs: GmailThread) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Contact Suggestion Model

/// A suggested contact from the Google People API, used for recipient autocomplete.
struct ContactSuggestion: Identifiable, Equatable {
    let id: String          // People API resourceName or email
    let name: String        // display name (may be empty)
    let email: String       // email address
}

// MARK: - Email Draft Model

/// A draft email ready to send.
struct EmailDraft {
    var to: [String] = []
    var cc: [String] = []
    var bcc: [String] = []
    var subject: String = ""
    var body: String = ""
    var bodyHTML: String?       // HTML version for forwards/replies with rich content
    var inReplyTo: String?      // for replies
    var references: String?     // for reply threading
    var threadId: String?       // for reply threading
    var attachments: [EmailAttachmentFile] = []  // files to attach
}

// MARK: - Gmail Service

/// Full Gmail client service: OAuth, thread-based fetching, reading, sending, modifying.
///
/// Uses the Gmail REST API v1:
/// - `GET  /users/me/threads`                — list thread IDs by label
/// - `GET  /users/me/threads/{id}?format=full` — get full thread with all messages
/// - `POST /users/me/threads/{id}/modify`    — mark thread as read/unread
/// - `POST /users/me/messages/send`          — send an email
/// - `POST /users/me/threads/{id}/trash`     — move thread to bin
/// - `POST /users/me/threads/{id}/untrash`   — restore thread from bin
@Observable
final class GmailService {
    
    // MARK: - State
    
    /// All connected Gmail accounts.
    private(set) var accounts: [GmailAccount] = []
    
    /// Whether any Gmail account is connected.
    var isConnected: Bool { !accounts.isEmpty }
    
    /// First connected email (convenience).
    var connectedEmail: String? { accounts.first?.email }
    
    var isAuthenticating = false
    var authError: String?
    
    /// Per-mailbox thread lists.
    private(set) var inboxThreads: [GmailThread] = []
    private(set) var sentThreads: [GmailThread] = []
    private(set) var draftThreads: [GmailThread] = []
    private(set) var archivedThreads: [GmailThread] = []
    private(set) var trashThreads: [GmailThread] = []
    
    /// Currently selected thread for the detail view.
    var selectedThread: GmailThread?
    
    /// When set, detail view shows only this message and those before it (chronologically).
    /// Cleared when selecting the main thread row.
    var selectedMessageId: String?
    
    /// Current active mailbox.
    var currentMailbox: Mailbox = .inbox
    
    /// When set, only threads from this account are shown. `nil` = all accounts.
    var filterAccountId: String?
    
    /// Called when new unread inbox threads are detected. Set by AppState to show notifications.
    var onNewEmailsDetected: (([GmailThread]) -> Void)?
    /// Called whenever a mailbox thread snapshot is refreshed.
    var onThreadsFetched: ((Mailbox, [GmailThread]) -> Void)?
    
    /// Whether threads are currently being fetched.
    private(set) var isFetching = false
    
    /// Whether an email is currently being sent.
    private(set) var isSending = false
    
    /// User-facing send error.
    var sendError: String?
    
    /// Brief success message after send.
    var sendSuccess: Bool = false
    
    // MARK: - Pagination
    
    /// Next-page tokens per mailbox per account: `[mailbox.rawValue: [account.id: token]]`.
    private var mailboxPageTokens: [String: [String: String?]] = [:]
    
    /// Whether more threads can be loaded for the current mailbox.
    var canLoadMore: Bool {
        let key = currentMailbox.rawValue
        guard let accountTokens = mailboxPageTokens[key] else { return false }
        return accountTokens.values.contains { $0 != nil }
    }
    
    /// Whether a "load more" operation is in progress.
    private(set) var isLoadingMore = false
    
    // MARK: - Search
    
    /// The active search query. Empty string = not searching.
    var searchQuery: String = ""
    
    /// Threads matching the current search query.
    private(set) var searchResults: [GmailThread] = []
    
    /// Whether a search is currently in progress.
    private(set) var isSearching = false
    
    /// Next-page tokens for search results per account: `[account.id: token]`.
    private var searchPageTokens: [String: String?] = [:]
    
    /// Whether more search results can be loaded.
    var canLoadMoreSearch: Bool {
        searchPageTokens.values.contains { $0 != nil }
    }
    
    /// Estimated total result count from the last search (from Gmail's `resultSizeEstimate`).
    private(set) var searchResultEstimate: Int = 0
    
    // MARK: - Polling
    
    /// Background timer that polls for new emails.
    private var pollingTimer: Timer?
    
    /// Stored history ID per account — used for efficient change detection.
    /// Only does a full fetch when Gmail reports changes since this ID.
    private var latestHistoryIds: [String: String] = [:]  // accountId -> historyId
    
    // MARK: - Supabase Integration

    /// When set, Google access tokens come from Supabase auth for the primary account.
    /// Additional accounts use per-account Keychain tokens via the legacy OAuth flow.
    var supabaseService: SupabaseService? {
        didSet { ensureSupabaseAccount() }
    }

    /// Reference to GoogleCalendarService so adding an additional account also adds Calendar access.
    weak var googleCalendarService: GoogleCalendarService?

    /// Whether connected via Supabase (single Google login) or legacy multi-account.
    var isConnectedViaSupabase: Bool { supabaseService?.isAuthenticated ?? false }
    
    /// Whether the given account is the Supabase-managed primary account.
    func isSupabaseAccount(_ account: GmailAccount) -> Bool {
        account.id == "supabase"
    }

    // MARK: - Private

    private var loopbackServer: LoopbackServer?

    /// Whether a client ID is configured (user-provided or built-in).
    var hasClientID: Bool { !clientID.isEmpty }

    /// Whether both client ID and secret are configured (needed for adding additional accounts).
    var hasCredentials: Bool { !clientID.isEmpty && !clientSecret.isEmpty }

    /// The effective client ID — same credentials as Google Calendar.
    private var clientID: String {
        let stored = KeychainHelper.get(key: "google_client_id") ?? ""
        return stored.isEmpty ? "" : stored
    }

    /// The effective client secret — user-provided via Keychain.
    private var clientSecret: String {
        KeychainHelper.get(key: "google_client_secret") ?? ""
    }

    // MARK: - Init

    init() {
        loadAccounts()
    }
    
    // MARK: - Account Storage
    
    private func loadAccounts() {
        // Load persisted additional (non-Supabase) accounts.
        if let data = UserDefaults.standard.data(forKey: Constants.Defaults.gmailAccounts),
           let decoded = try? JSONDecoder().decode([GmailAccount].self, from: data) {
            // Keep only additional accounts — the Supabase account is injected dynamically.
            accounts = decoded.filter { $0.id != "supabase" }
        } else {
            accounts = []
        }
        authError = nil
    }
    
    private func saveAccounts() {
        // Persist only additional (non-Supabase) accounts.
        let additional = accounts.filter { $0.id != "supabase" }
        if let data = try? JSONEncoder().encode(additional) {
            UserDefaults.standard.set(data, forKey: Constants.Defaults.gmailAccounts)
        }
    }
    
    /// Ensure the Supabase-authenticated Google account is represented in the accounts array.
    /// Called when `supabaseService` is set or when authentication state may have changed.
    func ensureSupabaseAccount() {
        guard let supa = supabaseService, supa.isAuthenticated else {
            // Remove the Supabase account but keep any additional accounts.
            accounts.removeAll { $0.id == "supabase" }
            return
        }
        
        let email = supa.currentUserEmail ?? "user"
        let addedAt = accounts.first(where: { $0.id == "supabase" })?.addedAt ?? .now
        let supabaseAccount = GmailAccount(id: "supabase", email: email, addedAt: addedAt)
        
        // Ensure Supabase account is first, followed by any additional accounts.
        let additional = accounts.filter { $0.id != "supabase" }
        accounts = [supabaseAccount] + additional
    }
    
    // MARK: - OAuth Flow (Additional Accounts)
    
    /// Start the Google OAuth sign-in flow to add an additional account.
    /// Requests both Gmail and Calendar scopes so one flow covers everything.
    func signInAdditionalAccount() {
        guard let cid = supabaseService?.googleClientID, !cid.isEmpty,
              let secret = supabaseService?.googleClientSecret, !secret.isEmpty else {
            authError = "Google credentials not configured. Contact your admin."
            return
        }
        
        guard !isAuthenticating else { return }
        isAuthenticating = true
        authError = nil
        
        // Start loopback server to receive the OAuth callback
        loopbackServer?.stop()
        loopbackServer = LoopbackServer(
            port: Constants.Gmail.loopbackPort,
            successTitle: "Google Account Connected"
        ) { [weak self] code in
            guard let self else { return }
            Task { await self.exchangeCodeForTokens(code) }
        }
        loopbackServer?.start()
        
        // Combined scopes: Gmail + Calendar in one consent screen
        let combinedScopes = Constants.Gmail.scopes + " " + Constants.GoogleCalendar.scopes
        
        // Build the Google OAuth URL
        var components = URLComponents(string: Constants.Gmail.authURL)!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: cid),
            URLQueryItem(name: "redirect_uri", value: Constants.Gmail.redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: combinedScopes),
            URLQueryItem(name: "access_type", value: "offline"),
            URLQueryItem(name: "prompt", value: "consent"),
        ]
        
        if let url = components.url {
            NSWorkspace.shared.open(url)
        }
    }
    
    func signIn() {
        // Primary Gmail is connected through Supabase; use signInAdditionalAccount() for extras.
        signInAdditionalAccount()
    }
    
    func disconnect(accountId: String) {
        // Cannot disconnect the Supabase primary account from here.
        guard accountId != "supabase" else { return }
        
        // Remove Gmail tokens and account entry
        if let account = accounts.first(where: { $0.id == accountId }) {
            KeychainHelper.delete(key: account.accessTokenKey)
            KeychainHelper.delete(key: account.refreshTokenKey)
        }
        accounts.removeAll { $0.id == accountId }
        saveAccounts()
        
        // Also remove from Calendar service
        googleCalendarService?.removeAdditionalAccount(id: accountId)
        
        print("[Gmail] Disconnected additional account: \(accountId)")
    }
    
    func signOut() {
        for account in accounts {
            KeychainHelper.delete(key: account.accessTokenKey)
            KeychainHelper.delete(key: account.refreshTokenKey)
        }
        accounts = []
        inboxThreads = []
        sentThreads = []
        draftThreads = []
        archivedThreads = []
        trashThreads = []
        selectedThread = nil
        selectedMessageId = nil
        saveAccounts()
        stopPolling()
        print("[Gmail] All accounts signed out")
    }
    
    // MARK: - Background Polling
    
    /// Start polling for new emails every 30 seconds.
    /// Safe to call multiple times — restarts if already running.
    func startPolling() {
        stopPolling()
        guard isConnected else { return }
        
        let timer = Timer(timeInterval: 30.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { await self.pollForChanges() }
        }
        RunLoop.main.add(timer, forMode: .common)
        pollingTimer = timer
        print("[Gmail] Polling started (every 30s)")
    }
    
    /// Stop background polling.
    func stopPolling() {
        pollingTimer?.invalidate()
        pollingTimer = nil
    }
    
    /// Called on each poll tick. Uses the History API to detect changes
    /// before doing a full mailbox fetch, saving API quota when nothing changed.
    private func pollForChanges() async {
        guard isConnected, !isFetching else { return }
        
        // Check each account for changes via historyId
        var hasChanges = false
        
        for account in accounts {
            guard let token = await validToken(for: account) else { continue }
            
            if let storedHistoryId = latestHistoryIds[account.id] {
                // We have a historyId — use the History API to check for changes
                let changed = await checkHistory(token: token, account: account, startHistoryId: storedHistoryId)
                if changed {
                    hasChanges = true
                }
            } else {
                // No historyId stored yet — need a full fetch to seed it
                hasChanges = true
            }
        }
        
        if hasChanges {
            await fetchMailbox(currentMailbox)
            print("[Gmail] Poll: changes detected, refreshed \(currentMailbox.displayName)")
        }
    }
    
    /// Check Gmail History API for changes since the given historyId.
    /// Returns `true` if there are changes (or if the historyId is stale), `false` if no changes.
    private func checkHistory(token: String, account: GmailAccount, startHistoryId: String) async -> Bool {
        var components = URLComponents(string: "\(Constants.Gmail.apiBase)/users/me/history")!
        components.queryItems = [
            URLQueryItem(name: "startHistoryId", value: startHistoryId),
            URLQueryItem(name: "maxResults", value: "1"),
        ]
        
        guard let url = components.url else { return true }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let (data, response) = try await resilientData(for: request)
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            
            // 404 means the historyId is too old / invalid — need full refresh
            if statusCode == 404 {
                await MainActor.run { _ = latestHistoryIds.removeValue(forKey: account.id) }
                return true
            }
            
            // 401 — token expired, let the full fetch handle refresh
            if statusCode == 401 { return true }
            
            guard statusCode == 200,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return true
            }
            
            // Update the historyId regardless
            if let newHistoryId = json["historyId"] as? String {
                await MainActor.run { latestHistoryIds[account.id] = newHistoryId }
            }
            
            // If "history" key is present and non-empty, there are changes
            if let history = json["history"] as? [[String: Any]], !history.isEmpty {
                return true
            }
            
            // No history records — nothing changed
            return false
            
        } catch {
            // Network error — try a full fetch to be safe
            return true
        }
    }
    
    // MARK: - Token Exchange
    
    private func exchangeCodeForTokens(_ code: String) async {
        // Use appConfig credentials directly (same source as the OAuth URL)
        // to avoid Keychain timing issues.
        let cid = supabaseService?.googleClientID ?? clientID
        let secret = supabaseService?.googleClientSecret ?? clientSecret
        let body = [
            "code": code,
            "client_id": cid,
            "client_secret": secret,
            "redirect_uri": Constants.Gmail.redirectURI,
            "grant_type": "authorization_code",
        ]
        
        do {
            let tokenResponse: TokenResponse = try await postForm(
                url: Constants.Gmail.tokenURL,
                body: body
            )
            
            let email = await fetchUserEmail(accessToken: tokenResponse.accessToken)
            let emailStr = email ?? "Unknown"
            
            if accounts.contains(where: { $0.email.lowercased() == emailStr.lowercased() }) {
                await MainActor.run {
                    isAuthenticating = false
                    authError = "\(emailStr) is already connected."
                }
                return
            }
            
            let accountId = UUID().uuidString
            let account = GmailAccount(id: accountId, email: emailStr, addedAt: .now)
            
            // Store Gmail tokens
            KeychainHelper.set(key: account.accessTokenKey, value: tokenResponse.accessToken)
            if let refresh = tokenResponse.refreshToken {
                KeychainHelper.set(key: account.refreshTokenKey, value: refresh)
            }
            
            // Also register this account in GoogleCalendarService (same tokens, same ID)
            let calAccount = GoogleCalendarAccount(id: accountId, email: emailStr, addedAt: .now)
            KeychainHelper.set(key: calAccount.accessTokenKey, value: tokenResponse.accessToken)
            if let refresh = tokenResponse.refreshToken {
                KeychainHelper.set(key: calAccount.refreshTokenKey, value: refresh)
            }
            
            await MainActor.run {
                accounts.append(account)
                saveAccounts()
                
                // Add to Calendar service
                googleCalendarService?.addAdditionalAccount(calAccount)
                
                isAuthenticating = false
                authError = nil
            }
            
            print("[Gmail] ✓ Connected (Gmail + Calendar): \(emailStr)")
            await fetchMailbox(.inbox)
            await MainActor.run { startPolling() }
            
            // Fetch calendar events for the new account
            await googleCalendarService?.fetchEvents()
            
        } catch {
            await MainActor.run {
                isAuthenticating = false
                authError = "Authentication failed: \(error.localizedDescription)"
            }
            print("[Gmail] ✗ Token exchange failed: \(error)")
        }
    }
    
    private func refreshAccessToken(for account: GmailAccount) async -> String? {
        guard let refreshToken = KeychainHelper.get(key: account.refreshTokenKey) else {
            return nil
        }
        
        let cid = supabaseService?.googleClientID ?? clientID
        let secret = supabaseService?.googleClientSecret ?? clientSecret
        let body = [
            "refresh_token": refreshToken,
            "client_id": cid,
            "client_secret": secret,
            "grant_type": "refresh_token",
        ]
        
        do {
            let response: TokenResponse = try await postForm(
                url: Constants.Gmail.tokenURL,
                body: body
            )
            KeychainHelper.set(key: account.accessTokenKey, value: response.accessToken)
            return response.accessToken
        } catch {
            print("[Gmail] Token refresh failed for \(account.email): \(error)")
            return nil
        }
    }
    
    // MARK: - Fetch Threads by Mailbox
    
    /// Fetch threads for a specific mailbox across all connected accounts.
    func fetchMailbox(_ mailbox: Mailbox) async {
        // Ensure the Supabase account is up to date before fetching
        await MainActor.run { ensureSupabaseAccount() }

        guard !accounts.isEmpty else {
            await MainActor.run { clearMailbox(mailbox) }
            return
        }
        
        // Clear page tokens for this mailbox (fresh fetch)
        await MainActor.run {
            isFetching = true
            mailboxPageTokens[mailbox.rawValue] = [:]
        }
        
        var allThreads: [GmailThread] = []
        
        await withTaskGroup(of: [GmailThread].self) { group in
            for account in accounts {
                group.addTask { [self] in
                    await self.fetchThreadsForMailbox(mailbox, account: account)
                }
            }
            for await accountThreads in group {
                allThreads.append(contentsOf: accountThreads)
            }
        }
        
        let sorted = allThreads.sorted { $0.date > $1.date }
        
        // Snapshot the latest historyId per account (for efficient polling)
        await updateHistoryIds()
        
        // Detect new unread inbox threads for notifications (only when we had a previous snapshot)
        var newThreadsToNotify: [GmailThread] = []
        if mailbox == .inbox, onNewEmailsDetected != nil {
            let previousIds = await MainActor.run { Set(inboxThreads.map(\.id)) }
            let newUnread = sorted.filter { $0.isUnread && !previousIds.contains($0.id) }
            if !previousIds.isEmpty && !newUnread.isEmpty {
                newThreadsToNotify = newUnread
            }
        }
        
        let threadsToNotify = newThreadsToNotify
        await MainActor.run {
            switch mailbox {
            case .inbox: self.inboxThreads = sorted
            case .sent: self.sentThreads = sorted
            case .drafts: self.draftThreads = sorted
            case .archived: self.archivedThreads = sorted
            case .bin: self.trashThreads = sorted
            }
            self.isFetching = false
            self.onThreadsFetched?(mailbox, sorted)
            
            if !threadsToNotify.isEmpty, let callback = self.onNewEmailsDetected {
                callback(threadsToNotify)
            }
        }
        
        print("[Gmail] Fetched \(sorted.count) \(mailbox.displayName) threads")
    }

    // MARK: - Load More (Pagination)
    
    /// Load the next page of threads for the given mailbox and append them.
    func loadMoreThreads(_ mailbox: Mailbox) async {
        let mailboxKey = mailbox.rawValue
        guard let accountTokens = mailboxPageTokens[mailboxKey] else { return }
        
        // Only load accounts that still have a next page
        let accountsWithMore = accounts.filter { accountTokens[$0.id] != nil && accountTokens[$0.id] != nil }
        guard !accountsWithMore.isEmpty else { return }
        
        await MainActor.run { isLoadingMore = true }
        
        var newThreads: [GmailThread] = []
        
        await withTaskGroup(of: [GmailThread].self) { group in
            for account in accountsWithMore {
                let token = accountTokens[account.id] ?? nil
                guard let token else { continue }
                group.addTask { [self] in
                    await self.fetchThreadsForMailbox(mailbox, account: account, pageToken: token)
                }
            }
            for await accountThreads in group {
                newThreads.append(contentsOf: accountThreads)
            }
        }
        
        let sortedNew = newThreads.sorted { $0.date > $1.date }
        
        await MainActor.run {
            switch mailbox {
            case .inbox: self.inboxThreads.append(contentsOf: sortedNew)
            case .sent: self.sentThreads.append(contentsOf: sortedNew)
            case .drafts: self.draftThreads.append(contentsOf: sortedNew)
            case .archived: self.archivedThreads.append(contentsOf: sortedNew)
            case .bin: self.trashThreads.append(contentsOf: sortedNew)
            }
            self.isLoadingMore = false
        }
        
        print("[Gmail] Loaded \(sortedNew.count) more \(mailbox.displayName) threads")
    }
    
    // MARK: - Search
    
    /// Search threads across all connected accounts using Gmail query syntax.
    func searchThreads(_ query: String) async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        
        await MainActor.run {
            searchQuery = trimmed
            searchResults = []
            searchPageTokens = [:]
            searchResultEstimate = 0
        }
        
        guard !trimmed.isEmpty, !accounts.isEmpty else { return }
        
        await MainActor.run { isSearching = true }
        
        // Determine which accounts to search
        let targetAccounts: [GmailAccount]
        if let filterId = filterAccountId,
           let account = accounts.first(where: { $0.id == filterId }) {
            targetAccounts = [account]
        } else {
            targetAccounts = accounts
        }
        
        var allThreads: [GmailThread] = []
        var totalEstimate = 0
        
        await withTaskGroup(of: (account: GmailAccount, threads: [GmailThread], result: ThreadListResult?).self) { group in
            for account in targetAccounts {
                group.addTask { [self] in
                    guard let token = await self.validToken(for: account) else {
                        return (account, [], nil)
                    }
                    let listResult = await self.listThreadIds(
                        token: token,
                        account: account,
                        query: trimmed,
                        maxResults: 50
                    )
                    guard let listResult, !listResult.ids.isEmpty else {
                        return (account, [], listResult)
                    }
                    // Fetch full threads
                    var threads: [GmailThread] = []
                    await withTaskGroup(of: GmailThread?.self) { innerGroup in
                        for threadId in listResult.ids {
                            innerGroup.addTask { [self] in
                                await self.fetchThread(id: threadId, token: token, account: account)
                            }
                        }
                        for await thread in innerGroup {
                            if let t = thread {
                                threads.append(t)
                            }
                        }
                    }
                    // Tag threads
                    let tagged = threads.map { thread -> GmailThread in
                        var t = thread
                        t.accountId = account.id
                        t.accountEmail = account.email
                        return t
                    }
                    return (account, tagged, listResult)
                }
            }
            for await result in group {
                allThreads.append(contentsOf: result.threads)
                if let lr = result.result {
                    totalEstimate += lr.resultSizeEstimate ?? 0
                }
                await MainActor.run {
                    searchPageTokens[result.account.id] = result.result?.nextPageToken
                }
            }
        }
        
        let sorted = allThreads.sorted { $0.date > $1.date }
        
        await MainActor.run {
            searchResults = sorted
            searchResultEstimate = totalEstimate
            isSearching = false
        }
        
        print("[Gmail] Search '\(trimmed)' returned \(sorted.count) threads (est. \(totalEstimate))")
    }
    
    /// Load more search results using stored page tokens.
    func loadMoreSearchResults() async {
        let query = searchQuery
        guard !query.isEmpty else { return }
        
        let accountsWithMore = accounts.filter {
            if let token = searchPageTokens[$0.id] { return token != nil } else { return false }
        }
        guard !accountsWithMore.isEmpty else { return }
        
        await MainActor.run { isLoadingMore = true }
        
        var newThreads: [GmailThread] = []
        
        await withTaskGroup(of: (account: GmailAccount, threads: [GmailThread], result: ThreadListResult?).self) { group in
            for account in accountsWithMore {
                let pageToken = searchPageTokens[account.id] ?? nil
                guard let pageToken else { continue }
                group.addTask { [self] in
                    guard let token = await self.validToken(for: account) else {
                        return (account, [], nil)
                    }
                    let listResult = await self.listThreadIds(
                        token: token,
                        account: account,
                        query: query,
                        maxResults: 50,
                        pageToken: pageToken
                    )
                    guard let listResult, !listResult.ids.isEmpty else {
                        return (account, [], listResult)
                    }
                    var threads: [GmailThread] = []
                    await withTaskGroup(of: GmailThread?.self) { innerGroup in
                        for threadId in listResult.ids {
                            innerGroup.addTask { [self] in
                                await self.fetchThread(id: threadId, token: token, account: account)
                            }
                        }
                        for await thread in innerGroup {
                            if let t = thread {
                                threads.append(t)
                            }
                        }
                    }
                    let tagged = threads.map { thread -> GmailThread in
                        var t = thread
                        t.accountId = account.id
                        t.accountEmail = account.email
                        return t
                    }
                    return (account, tagged, listResult)
                }
            }
            for await result in group {
                newThreads.append(contentsOf: result.threads)
                await MainActor.run {
                    searchPageTokens[result.account.id] = result.result?.nextPageToken
                }
            }
        }
        
        let sorted = newThreads.sorted { $0.date > $1.date }
        
        await MainActor.run {
            searchResults.append(contentsOf: sorted)
            isLoadingMore = false
        }
        
        print("[Gmail] Loaded \(sorted.count) more search results for '\(query)'")
    }
    
    /// Clear the active search and return to normal mailbox view.
    func clearSearch() {
        searchQuery = ""
        searchResults = []
        searchPageTokens = [:]
        searchResultEstimate = 0
    }
    
    func allThreads() -> [GmailThread] {
        var merged = inboxThreads + sentThreads + draftThreads + archivedThreads + trashThreads
        merged.sort { $0.date > $1.date }
        return merged
    }
    
    /// Fetch the current historyId from each account's profile and store it.
    private func updateHistoryIds() async {
        for account in accounts {
            guard let token = await validToken(for: account) else { continue }
            guard let url = URL(string: "\(Constants.Gmail.apiBase)/users/me/profile") else { continue }
            
            var request = URLRequest(url: url)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            
            do {
                let (data, _) = try await resilientData(for: request)
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let historyId = json["historyId"] as? String {
                    await MainActor.run { latestHistoryIds[account.id] = historyId }
                }
            } catch {
                // Non-critical — polling will just do a full fetch next time
            }
        }
    }
    
    /// Legacy: fetch inbox (backward compat with AppState init).
    func fetchMessages() async {
        await fetchMailbox(.inbox)
    }
    
    /// Get the threads array for the given mailbox, respecting search and account filter.
    func threadsForMailbox(_ mailbox: Mailbox) -> [GmailThread] {
        // When a search is active, show search results instead of mailbox contents
        let all: [GmailThread]
        if !searchQuery.isEmpty {
            all = searchResults
        } else {
            switch mailbox {
            case .inbox: all = inboxThreads
            case .sent: all = sentThreads
            case .drafts: all = draftThreads
            case .archived: all = archivedThreads
            case .bin: all = trashThreads
            }
        }
        guard let filterId = filterAccountId else { return all }
        return all.filter { $0.accountId == filterId }
    }
    
    private func clearMailbox(_ mailbox: Mailbox) {
        switch mailbox {
        case .inbox: inboxThreads = []
        case .sent: sentThreads = []
        case .drafts: draftThreads = []
        case .archived: archivedThreads = []
        case .bin: trashThreads = []
        }
    }
    
    private func fetchThreadsForMailbox(_ mailbox: Mailbox, account: GmailAccount, pageToken: String? = nil) async -> [GmailThread] {
        guard let token = await validToken(for: account) else { return [] }
        
        // 1. List thread IDs
        let result: ThreadListResult?
        if mailbox == .archived {
            // Archived = not in any system mailbox. Use Gmail search query.
            result = await listThreadIds(
                token: token,
                account: account,
                query: "-in:inbox -in:sent -in:draft -in:trash -in:spam",
                maxResults: 50,
                pageToken: pageToken
            )
        } else {
            result = await listThreadIds(
                token: token,
                account: account,
                labelId: mailbox.rawValue,
                maxResults: 50,
                pageToken: pageToken
            )
        }
        guard let result else { return [] }
        
        // Store pagination token for this account + mailbox
        let mailboxKey = mailbox.rawValue
        await MainActor.run {
            if mailboxPageTokens[mailboxKey] == nil {
                mailboxPageTokens[mailboxKey] = [:]
            }
            mailboxPageTokens[mailboxKey]?[account.id] = result.nextPageToken
        }
        
        // 2. Fetch each thread's full details concurrently
        var threads: [GmailThread] = []
        
        await withTaskGroup(of: GmailThread?.self) { group in
            for threadId in result.ids {
                group.addTask { [self] in
                    await self.fetchThread(id: threadId, token: token, account: account)
                }
            }
            for await thread in group {
                if let t = thread {
                    threads.append(t)
                }
            }
        }
        
        // 3. Tag each thread with the account it belongs to
        return threads.map { thread in
            var t = thread
            t.accountId = account.id
            t.accountEmail = account.email
            return t
        }
    }
    
    /// Get a valid access token for a specific account, refreshing if needed.
    /// Routes to Supabase tokens for the primary account, or per-account Keychain tokens for others.
    private func validToken(for account: GmailAccount) async -> String? {
        // Supabase-managed primary account — use Supabase-provided Google token
        if account.id == "supabase" {
            guard let supa = supabaseService else { return nil }
            if let token = await supa.validGoogleAccessToken(), !token.isEmpty {
                return token
            }
            print("[Gmail] No valid Supabase Google token")
            return nil
        }

        // Legacy accounts — use per-account Keychain tokens
        var accessToken = KeychainHelper.get(key: account.accessTokenKey)
        if accessToken == nil || accessToken?.isEmpty == true {
            accessToken = await refreshAccessToken(for: account)
        }
        guard let token = accessToken, !token.isEmpty else {
            print("[Gmail] No valid access token for \(account.email)")
            return nil
        }
        return token
    }

    /// Refresh token through the appropriate path (Supabase primary vs legacy account).
    private func refreshTokenAfterUnauthorised(for account: GmailAccount) async -> String? {
        if account.id == "supabase" {
            return await supabaseService?.refreshGoogleAccessToken()
        }
        return await refreshAccessToken(for: account)
    }
    
    /// Find a thread in any mailbox by its ID.
    private func findThreadInAnyMailbox(_ threadId: String) -> GmailThread? {
        for threads in [inboxThreads, sentThreads, draftThreads, archivedThreads, trashThreads, searchResults] {
            if let thread = threads.first(where: { $0.id == threadId }) {
                return thread
            }
        }
        return nil
    }
    
    /// Find the account that owns a specific thread, defaulting to the first account.
    private func accountForThread(threadId: String) -> GmailAccount? {
        if let thread = findThreadInAnyMailbox(threadId),
           !thread.accountId.isEmpty,
           let account = accounts.first(where: { $0.id == thread.accountId }) {
            return account
        }
        return accounts.first
    }
    
    // MARK: - Cancellation-Resistant Network
    
    /// Perform a URL request using the callback-based URLSession API so it is
    /// **not** automatically cancelled when the enclosing Swift `Task` is cancelled.
    /// This prevents SwiftUI view-lifecycle cancellation from killing in-flight
    /// Gmail API requests (NSURLErrorDomain Code=-999).
    private func resilientData(for request: URLRequest) async throws -> (Data, URLResponse) {
        try await withCheckedThrowingContinuation { continuation in
            URLSession.shared.dataTask(with: request) { data, response, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let data, let response {
                    continuation.resume(returning: (data, response))
                } else {
                    continuation.resume(throwing: URLError(.unknown))
                }
            }.resume()
        }
    }
    
    // MARK: - List Thread IDs
    
    /// Result from listing thread IDs — includes pagination token.
    private struct ThreadListResult {
        let ids: [String]
        let nextPageToken: String?
        let resultSizeEstimate: Int?
    }
    
    /// List thread IDs from `GET /users/me/threads`.
    /// Use `labelId` for standard Gmail labels (INBOX, SENT, etc.) or `query` for search-based filtering (e.g. archived).
    private func listThreadIds(token: String, account: GmailAccount, labelId: String? = nil, query: String? = nil, maxResults: Int, pageToken: String? = nil) async -> ThreadListResult? {
        var components = URLComponents(string: "\(Constants.Gmail.apiBase)/users/me/threads")!
        components.queryItems = [
            URLQueryItem(name: "maxResults", value: "\(maxResults)"),
        ]
        
        if let labelId {
            components.queryItems?.append(URLQueryItem(name: "labelIds", value: labelId))
        }
        
        if let query {
            components.queryItems?.append(URLQueryItem(name: "q", value: query))
        }
        
        if labelId == "TRASH" {
            components.queryItems?.append(URLQueryItem(name: "includeSpamTrash", value: "true"))
        }
        
        if let pageToken {
            components.queryItems?.append(URLQueryItem(name: "pageToken", value: pageToken))
        }
        
        guard let url = components.url else { return nil }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let (data, response) = try await resilientData(for: request)
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            
            if statusCode == 401 {
                // Refresh token using the correct path (Supabase vs legacy)
                let newToken = await refreshTokenAfterUnauthorised(for: account)
                if let newToken {
                    var retryRequest = URLRequest(url: url)
                    retryRequest.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
                    let (retryData, _) = try await resilientData(for: retryRequest)
                    return parseThreadListResult(from: retryData)
                }
                return nil
            }
            
            if statusCode != 200 {
                print("[Gmail] List threads \(labelId ?? "nil") HTTP \(statusCode): \(String(data: data, encoding: .utf8)?.prefix(300) ?? "nil")")
            }
            
            return parseThreadListResult(from: data)
            
        } catch {
            print("[Gmail] List threads failed for \(account.email): \(error)")
            return nil
        }
    }
    
    private func parseThreadListResult(from data: Data) -> ThreadListResult {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return ThreadListResult(ids: [], nextPageToken: nil, resultSizeEstimate: nil)
        }
        if let error = json["error"] as? [String: Any] {
            let code = error["code"] as? Int ?? 0
            let message = error["message"] as? String ?? "Unknown error"
            print("[Gmail] API error \(code): \(message)")
            return ThreadListResult(ids: [], nextPageToken: nil, resultSizeEstimate: nil)
        }
        let ids: [String]
        if let threads = json["threads"] as? [[String: Any]] {
            ids = threads.compactMap { $0["id"] as? String }
        } else {
            ids = []
        }
        let nextPageToken = json["nextPageToken"] as? String
        let resultSizeEstimate = json["resultSizeEstimate"] as? Int
        return ThreadListResult(ids: ids, nextPageToken: nextPageToken, resultSizeEstimate: resultSizeEstimate)
    }
    
    // MARK: - Fetch Full Thread
    
    /// Fetch a thread with all messages via `GET /users/me/threads/{id}?format=full`.
    private func fetchThread(id: String, token: String, account: GmailAccount) async -> GmailThread? {
        var components = URLComponents(string: "\(Constants.Gmail.apiBase)/users/me/threads/\(id)")!
        components.queryItems = [
            URLQueryItem(name: "format", value: "full"),
        ]
        
        guard let url = components.url else { return nil }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let (data, response) = try await resilientData(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401, let newToken = await refreshTokenAfterUnauthorised(for: account) {
                var retryRequest = URLRequest(url: url)
                retryRequest.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
                let (retryData, _) = try await resilientData(for: retryRequest)
                return parseThread(from: retryData)
            }
            return parseThread(from: data)
        } catch {
            print("[Gmail] Fetch thread \(id) failed: \(error)")
            return nil
        }
    }
    
    /// Parse a Thread JSON response into a `GmailThread`.
    private func parseThread(from data: Data) -> GmailThread? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        
        guard let threadId = json["id"] as? String else { return nil }
        
        // The thread response includes a "messages" array with full Message resources
        guard let messagesJSON = json["messages"] as? [[String: Any]] else {
            return nil
        }
        
        var messages: [GmailMessage] = []
        for msgJSON in messagesJSON {
            if let msgData = try? JSONSerialization.data(withJSONObject: msgJSON),
               let msg = parseFullMessage(from: msgData) {
                messages.append(msg)
            }
        }
        
        // Sort messages chronologically (oldest first)
        messages.sort { $0.date < $1.date }
        
        guard !messages.isEmpty else { return nil }
        
        return GmailThread(id: threadId, messages: messages)
    }
    
    // MARK: - Parse Full Message
    
    private func parseFullMessage(from data: Data) -> GmailMessage? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        
        let messageId = json["id"] as? String ?? UUID().uuidString
        let threadId = json["threadId"] as? String ?? messageId
        let snippet = json["snippet"] as? String ?? ""
        let labelIds = json["labelIds"] as? [String] ?? []
        let isUnread = labelIds.contains("UNREAD")
        
        // Parse internalDate for reliable ordering
        let internalDate = json["internalDate"] as? String
        let date: Date
        if let ms = internalDate, let timestamp = Double(ms) {
            date = Date(timeIntervalSince1970: timestamp / 1000.0)
        } else {
            date = .now
        }
        
        // Extract headers
        var subject = "No Subject"
        var fromRaw = "Unknown"
        var toRaw = ""
        var ccRaw = ""
        var messageIdHeader = ""
        var references = ""
        var inReplyTo = ""
        
        let payload = json["payload"] as? [String: Any]
        if let headers = payload?["headers"] as? [[String: Any]] {
            for header in headers {
                guard let name = header["name"] as? String,
                      let value = header["value"] as? String else { continue }
                switch name.lowercased() {
                case "subject": subject = value.trimmingCharacters(in: .whitespaces).isEmpty ? "No Subject" : value
                case "from": fromRaw = value
                case "to": toRaw = value
                case "cc": ccRaw = value
                case "message-id": messageIdHeader = value
                case "references": references = value
                case "in-reply-to": inReplyTo = value
                default: break
                }
            }
        }
        
        // Extract body — walk MIME parts recursively
        var bodyPlain = ""
        var bodyHTML = ""
        var hasAttachments = false
        var attachments: [GmailAttachment] = []
        
        if let payload {
            extractBody(from: payload, plain: &bodyPlain, html: &bodyHTML, hasAttachments: &hasAttachments, attachments: &attachments, messageId: messageId)
        }
        
        let fromDisplay = cleanFromHeader(fromRaw)
        let fromEmail = extractEmail(from: fromRaw)
        let toList = parseEmailList(toRaw)
        let ccList = parseEmailList(ccRaw)
        
        return GmailMessage(
            id: messageId,
            threadId: threadId,
            subject: subject,
            from: fromDisplay,
            fromEmail: fromEmail,
            to: toList,
            cc: ccList,
            snippet: snippet,
            bodyPlain: bodyPlain,
            bodyHTML: bodyHTML,
            date: date,
            isUnread: isUnread,
            labelIds: labelIds,
            hasAttachments: hasAttachments,
            attachments: attachments,
            messageIdHeader: messageIdHeader,
            references: references,
            inReplyTo: inReplyTo
        )
    }
    
    /// Recursively walk MIME parts to extract text/plain, text/html bodies, and attachment metadata.
    private func extractBody(from part: [String: Any], plain: inout String, html: inout String, hasAttachments: inout Bool, attachments: inout [GmailAttachment], messageId: String) {
        let mimeType = part["mimeType"] as? String ?? ""
        
        if let filename = part["filename"] as? String, !filename.isEmpty {
            hasAttachments = true
            
            // Extract attachment metadata
            let body = part["body"] as? [String: Any]
            let attachmentId = body?["attachmentId"] as? String ?? ""
            let size = body?["size"] as? Int ?? 0
            
            if !attachmentId.isEmpty {
                let attachment = GmailAttachment(
                    id: attachmentId,
                    messageId: messageId,
                    filename: filename,
                    mimeType: mimeType,
                    size: size,
                    attachmentId: attachmentId
                )
                attachments.append(attachment)
            }
        }
        
        if let body = part["body"] as? [String: Any],
           let encodedData = body["data"] as? String {
            if let decoded = base64URLDecode(encodedData) {
                if mimeType == "text/plain" && plain.isEmpty {
                    plain = decoded
                } else if mimeType == "text/html" && html.isEmpty {
                    html = decoded
                }
            }
        }
        
        if let parts = part["parts"] as? [[String: Any]] {
            for child in parts {
                extractBody(from: child, plain: &plain, html: &html, hasAttachments: &hasAttachments, attachments: &attachments, messageId: messageId)
            }
        }
    }
    
    /// Decode base64url-encoded string to UTF-8.
    private func base64URLDecode(_ input: String) -> String? {
        var base64 = input
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        
        let remainder = base64.count % 4
        if remainder > 0 {
            base64 += String(repeating: "=", count: 4 - remainder)
        }
        
        guard let data = Data(base64Encoded: base64) else { return nil }
        return String(data: data, encoding: .utf8)
    }
    
    // MARK: - Mark Thread as Read
    
    /// Mark all messages in a thread as read.
    /// Per Gmail API: POST /users/me/threads/{id}/modify
    func markThreadAsRead(threadId: String) async {
        guard let account = accountForThread(threadId: threadId),
              let token = await validToken(for: account) else { return }
        
        let url = URL(string: "\(Constants.Gmail.apiBase)/users/me/threads/\(threadId)/modify")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = ["removeLabelIds": ["UNREAD"]]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        do {
            let (_, response) = try await resilientData(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 200 {
                await MainActor.run {
                    updateThreadReadState(threadId: threadId, isUnread: false)
                }
                print("[Gmail] Thread marked as read: \(threadId)")
            } else {
                print("[Gmail] Mark thread as read failed: HTTP \(status)")
            }
        } catch {
            print("[Gmail] Mark thread as read error: \(error)")
        }
    }
    
    /// Update the local thread's unread state across all mailbox arrays.
    private func updateThreadReadState(threadId: String, isUnread: Bool) {
        func updateIn(_ threads: inout [GmailThread]) {
            if let idx = threads.firstIndex(where: { $0.id == threadId }) {
                for i in threads[idx].messages.indices {
                    threads[idx].messages[i].isUnread = isUnread
                }
            }
        }
        updateIn(&inboxThreads)
        updateIn(&sentThreads)
        updateIn(&draftThreads)
        updateIn(&archivedThreads)
        updateIn(&trashThreads)
        
        if selectedThread?.id == threadId {
            for i in (selectedThread?.messages.indices ?? 0..<0) {
                selectedThread?.messages[i].isUnread = isUnread
            }
        }
    }
    
    // MARK: - Send Email
    
    /// Send an email using the Gmail API.
    /// Per Gmail API: POST /users/me/messages/send with { "raw": "<base64url RFC 2822>", "threadId": ... }
    /// Returns true on success, false on failure.
    func sendEmail(_ draft: EmailDraft, fromAccountId: String? = nil) async -> Bool {
        let account: GmailAccount? = {
            if let id = fromAccountId { return accounts.first { $0.id == id } }
            return accounts.first
        }()
        guard let account,
              let token = await validToken(for: account) else {
            await MainActor.run { sendError = "No connected account." }
            return false
        }
        
        await MainActor.run {
            isSending = true
            sendError = nil
            sendSuccess = false
        }
        
        let fromAddress = account.email
        var rfc2822 = ""
        rfc2822 += "From: \(fromAddress)\r\n"
        rfc2822 += "To: \(draft.to.joined(separator: ", "))\r\n"
        if !draft.cc.isEmpty {
            rfc2822 += "Cc: \(draft.cc.joined(separator: ", "))\r\n"
        }
        if !draft.bcc.isEmpty {
            rfc2822 += "Bcc: \(draft.bcc.joined(separator: ", "))\r\n"
        }
        rfc2822 += "Subject: \(draft.subject)\r\n"
        if let inReplyTo = draft.inReplyTo, !inReplyTo.isEmpty {
            rfc2822 += "In-Reply-To: \(inReplyTo)\r\n"
        }
        if let references = draft.references, !references.isEmpty {
            rfc2822 += "References: \(references)\r\n"
        }
        rfc2822 += "MIME-Version: 1.0\r\n"
        
        let hasHTML = draft.bodyHTML != nil && !draft.bodyHTML!.isEmpty
        let hasAttachments = !draft.attachments.isEmpty
        
        if !hasHTML && !hasAttachments {
            // Simple plain-text email
            rfc2822 += "Content-Type: text/plain; charset=\"UTF-8\"\r\n"
            rfc2822 += "\r\n"
            rfc2822 += draft.body
            
        } else if hasHTML && !hasAttachments {
            // multipart/alternative: plain text + HTML (no attachments)
            let altBoundary = "TapAlt-\(UUID().uuidString)"
            rfc2822 += "Content-Type: multipart/alternative; boundary=\"\(altBoundary)\"\r\n"
            rfc2822 += "\r\n"
            
            // Plain text part
            rfc2822 += "--\(altBoundary)\r\n"
            rfc2822 += "Content-Type: text/plain; charset=\"UTF-8\"\r\n"
            rfc2822 += "Content-Transfer-Encoding: 7bit\r\n"
            rfc2822 += "\r\n"
            rfc2822 += draft.body
            rfc2822 += "\r\n"
            
            // HTML part
            rfc2822 += "--\(altBoundary)\r\n"
            rfc2822 += "Content-Type: text/html; charset=\"UTF-8\"\r\n"
            rfc2822 += "Content-Transfer-Encoding: 7bit\r\n"
            rfc2822 += "\r\n"
            rfc2822 += draft.bodyHTML!
            rfc2822 += "\r\n"
            
            rfc2822 += "--\(altBoundary)--\r\n"
            
        } else {
            // multipart/mixed: body + attachments
            // When HTML is present, the body section itself is multipart/alternative
            let mixedBoundary = "TapMixed-\(UUID().uuidString)"
            rfc2822 += "Content-Type: multipart/mixed; boundary=\"\(mixedBoundary)\"\r\n"
            rfc2822 += "\r\n"
            
            if hasHTML {
                // Nested multipart/alternative for text + HTML
                let altBoundary = "TapAlt-\(UUID().uuidString)"
                rfc2822 += "--\(mixedBoundary)\r\n"
                rfc2822 += "Content-Type: multipart/alternative; boundary=\"\(altBoundary)\"\r\n"
                rfc2822 += "\r\n"
                
                rfc2822 += "--\(altBoundary)\r\n"
                rfc2822 += "Content-Type: text/plain; charset=\"UTF-8\"\r\n"
                rfc2822 += "Content-Transfer-Encoding: 7bit\r\n"
                rfc2822 += "\r\n"
                rfc2822 += draft.body
                rfc2822 += "\r\n"
                
                rfc2822 += "--\(altBoundary)\r\n"
                rfc2822 += "Content-Type: text/html; charset=\"UTF-8\"\r\n"
                rfc2822 += "Content-Transfer-Encoding: 7bit\r\n"
                rfc2822 += "\r\n"
                rfc2822 += draft.bodyHTML!
                rfc2822 += "\r\n"
                
                rfc2822 += "--\(altBoundary)--\r\n"
            } else {
                // Plain text only
                rfc2822 += "--\(mixedBoundary)\r\n"
                rfc2822 += "Content-Type: text/plain; charset=\"UTF-8\"\r\n"
                rfc2822 += "Content-Transfer-Encoding: 7bit\r\n"
                rfc2822 += "\r\n"
                rfc2822 += draft.body
                rfc2822 += "\r\n"
            }
            
            // Attachment parts
            for attachment in draft.attachments {
                rfc2822 += "--\(mixedBoundary)\r\n"
                rfc2822 += "Content-Type: \(attachment.mimeType); name=\"\(attachment.filename)\"\r\n"
                rfc2822 += "Content-Disposition: attachment; filename=\"\(attachment.filename)\"\r\n"
                rfc2822 += "Content-Transfer-Encoding: base64\r\n"
                rfc2822 += "\r\n"
                
                let base64Data = attachment.data.base64EncodedString(options: .lineLength76Characters)
                rfc2822 += base64Data
                rfc2822 += "\r\n"
            }
            
            rfc2822 += "--\(mixedBoundary)--\r\n"
        }
        
        guard let messageData = rfc2822.data(using: .utf8) else {
            await MainActor.run {
                isSending = false
                sendError = "Failed to encode message."
            }
            return false
        }
        
        let base64url = messageData.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        
        var requestBody: [String: Any] = ["raw": base64url]
        if let threadId = draft.threadId {
            requestBody["threadId"] = threadId
        }
        
        let url = URL(string: "\(Constants.Gmail.apiBase)/users/me/messages/send")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: requestBody)
        
        do {
            let (data, response) = try await resilientData(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            
            if (200...299).contains(status) {
                var sentThreadId = draft.threadId
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let responseThreadId = json["threadId"] as? String,
                   !responseThreadId.isEmpty {
                    sentThreadId = responseThreadId
                }
                
                if let sentThreadId, !sentThreadId.isEmpty {
                    await refreshThreadAfterSend(threadId: sentThreadId, token: token, account: account)
                }
                
                await MainActor.run {
                    isSending = false
                    sendSuccess = true
                }
                print("[Gmail] ✓ Email sent to \(draft.to.joined(separator: ", "))")
                return true
            } else {
                let errorText = String(data: data, encoding: .utf8) ?? "Unknown error"
                await MainActor.run {
                    isSending = false
                    sendError = "Send failed (HTTP \(status))"
                }
                print("[Gmail] Send failed HTTP \(status): \(errorText.prefix(500))")
                return false
            }
        } catch {
            await MainActor.run {
                isSending = false
                sendError = "Network error: \(error.localizedDescription)"
            }
            print("[Gmail] Send error: \(error)")
            return false
        }
    }
    
    /// Refresh and merge the sent thread into local mailbox state so UI updates immediately.
    private func refreshThreadAfterSend(threadId: String, token: String, account: GmailAccount) async {
        guard let refreshedThread = await fetchThread(id: threadId, token: token, account: account) else { return }
        
        await MainActor.run {
            func replaceThreadIfPresent(_ thread: GmailThread, in threads: inout [GmailThread]) {
                guard let idx = threads.firstIndex(where: { $0.id == thread.id }) else { return }
                threads[idx] = thread
                threads.sort { $0.date > $1.date }
            }
            
            func upsertThread(_ thread: GmailThread, in threads: inout [GmailThread]) {
                if let idx = threads.firstIndex(where: { $0.id == thread.id }) {
                    threads[idx] = thread
                } else {
                    threads.insert(thread, at: 0)
                }
                threads.sort { $0.date > $1.date }
                if threads.count > 25 {
                    threads = Array(threads.prefix(25))
                }
            }
            
            // Sent mailbox should always reflect the newest sent thread immediately.
            upsertThread(refreshedThread, in: &sentThreads)
            
            // Other mailboxes are only updated if this thread is already present there.
            replaceThreadIfPresent(refreshedThread, in: &inboxThreads)
            replaceThreadIfPresent(refreshedThread, in: &draftThreads)
            replaceThreadIfPresent(refreshedThread, in: &archivedThreads)
            replaceThreadIfPresent(refreshedThread, in: &trashThreads)
            
            if selectedThread?.id == refreshedThread.id {
                selectedThread = refreshedThread
            }
        }
    }
    
    // MARK: - Download Attachment
    
    /// Download an attachment's raw data from the Gmail API.
    /// Uses `GET /users/me/messages/{messageId}/attachments/{attachmentId}`.
    func downloadAttachment(_ attachment: GmailAttachment, accountId: String? = nil) async -> Data? {
        let account: GmailAccount? = {
            if let id = accountId { return accounts.first { $0.id == id } }
            return accounts.first
        }()
        guard let account,
              let token = await validToken(for: account) else { return nil }
        
        let urlString = "\(Constants.Gmail.apiBase)/users/me/messages/\(attachment.messageId)/attachments/\(attachment.attachmentId)"
        guard let url = URL(string: urlString) else { return nil }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let (data, response) = try await resilientData(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            
            if status == 401 {
                // Try refresh
                if let newToken = await refreshTokenAfterUnauthorised(for: account) {
                    var retryRequest = URLRequest(url: url)
                    retryRequest.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
                    let (retryData, _) = try await resilientData(for: retryRequest)
                    return parseAttachmentData(from: retryData)
                }
                return nil
            }
            
            guard status == 200 else {
                print("[Gmail] Download attachment failed: HTTP \(status)")
                return nil
            }
            
            return parseAttachmentData(from: data)
        } catch {
            print("[Gmail] Download attachment error: \(error)")
            return nil
        }
    }
    
    /// Parse base64url-encoded attachment data from the Gmail API response.
    private func parseAttachmentData(from data: Data) -> Data? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let base64urlData = json["data"] as? String else {
            return nil
        }
        
        // Decode base64url to raw Data
        var base64 = base64urlData
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        
        let remainder = base64.count % 4
        if remainder > 0 {
            base64 += String(repeating: "=", count: 4 - remainder)
        }
        
        return Data(base64Encoded: base64)
    }
    
    /// Download an attachment and save it to a user-chosen location via NSSavePanel.
    @MainActor
    func saveAttachmentToFile(_ attachment: GmailAttachment) async {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = attachment.filename
        panel.canCreateDirectories = true
        panel.title = "Save Attachment"
        
        let response = panel.runModal()
        guard response == .OK, let saveURL = panel.url else { return }
        
        guard let data = await downloadAttachment(attachment) else {
            print("[Gmail] Failed to download attachment data for saving")
            return
        }
        
        do {
            try data.write(to: saveURL)
            print("[Gmail] Attachment saved: \(saveURL.path)")
            NSWorkspace.shared.activateFileViewerSelecting([saveURL])
        } catch {
            print("[Gmail] Failed to save attachment: \(error)")
        }
    }
    
    /// Download an attachment and open it with the default application using a temp file.
    func openAttachment(_ attachment: GmailAttachment) async {
        guard let data = await downloadAttachment(attachment) else {
            print("[Gmail] Failed to download attachment data for preview")
            return
        }
        
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("TapMeeting-Attachments", isDirectory: true)
        
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        
        let fileURL = tempDir.appendingPathComponent(attachment.filename)
        
        do {
            try data.write(to: fileURL)
            await MainActor.run {
                _ = NSWorkspace.shared.open(fileURL)
            }
            print("[Gmail] Attachment opened: \(fileURL.path)")
        } catch {
            print("[Gmail] Failed to write temp attachment: \(error)")
        }
    }
    
    // MARK: - Trash / Untrash Thread
    
    /// Returns the next thread to select after removing `threadId` from the current mailbox list.
    /// Prefers the thread immediately below; falls back to the one above.
    private func nextThreadAfterRemoval(of threadId: String) -> GmailThread? {
        let threads = threadsForMailbox(currentMailbox)
        guard let idx = threads.firstIndex(where: { $0.id == threadId }) else { return nil }
        let nextIdx = threads.index(after: idx)
        if nextIdx < threads.endIndex { return threads[nextIdx] }
        let prevIdx = threads.index(before: idx)
        if prevIdx >= threads.startIndex { return threads[prevIdx] }
        return nil
    }
    
    /// Move an entire thread to the bin.
    /// Per Gmail API: POST /users/me/threads/{id}/trash
    /// Uses optimistic UI — removes thread immediately, rolls back on failure.
    func trashThread(threadId: String) async {
        // Resolve account synchronously (no await) so we can optimistically update first
        let account = accountForThread(threadId: threadId)
        guard account != nil else { return }
        
        // Optimistic UI: remove thread and update selection BEFORE any async work
        let snapshot = await MainActor.run { () -> (removedInbox: GmailThread?, removedSent: GmailThread?, removedSearch: GmailThread?, inboxIdx: Int?, sentIdx: Int?, searchIdx: Int?) in
            let next = selectedThread?.id == threadId ? nextThreadAfterRemoval(of: threadId) : nil
            
            let inboxIdx = inboxThreads.firstIndex(where: { $0.id == threadId })
            let removedInbox = inboxIdx != nil ? inboxThreads.remove(at: inboxIdx!) : nil
            
            let sentIdx = sentThreads.firstIndex(where: { $0.id == threadId })
            let removedSent = sentIdx != nil ? sentThreads.remove(at: sentIdx!) : nil
            
            let searchIdx = searchResults.firstIndex(where: { $0.id == threadId })
            let removedSearch = searchIdx != nil ? searchResults.remove(at: searchIdx!) : nil
            
            if selectedThread?.id == threadId {
                selectedThread = next
                selectedMessageId = next?.latestMessage?.id
            }
            
            return (removedInbox, removedSent, removedSearch, inboxIdx, sentIdx, searchIdx)
        }
        
        // Now resolve token (may involve async refresh) — UI is already updated
        guard let token = await validToken(for: account!) else {
            await rollbackRemoval(snapshot: snapshot, threadId: threadId)
            return
        }
        
        let url = URL(string: "\(Constants.Gmail.apiBase)/users/me/threads/\(threadId)/trash")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let (_, response) = try await resilientData(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 200 {
                print("[Gmail] Trashed thread: \(threadId)")
            } else {
                await rollbackRemoval(snapshot: snapshot, threadId: threadId)
                print("[Gmail] Trash thread failed: HTTP \(status)")
            }
        } catch {
            await rollbackRemoval(snapshot: snapshot, threadId: threadId)
            print("[Gmail] Trash thread error: \(error)")
        }
    }
    
    /// Restore an entire thread from the bin.
    /// Per Gmail API: POST /users/me/threads/{id}/untrash
    func untrashThread(threadId: String) async {
        guard let account = accountForThread(threadId: threadId),
              let token = await validToken(for: account) else { return }
        
        let url = URL(string: "\(Constants.Gmail.apiBase)/users/me/threads/\(threadId)/untrash")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let (_, response) = try await resilientData(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 200 {
                await MainActor.run {
                    let next = selectedThread?.id == threadId ? nextThreadAfterRemoval(of: threadId) : nil
                    trashThreads.removeAll { $0.id == threadId }
                    if selectedThread?.id == threadId {
                        selectedThread = next
                        selectedMessageId = next?.latestMessage?.id
                    }
                }
                print("[Gmail] Untrashed thread: \(threadId)")
                await fetchMailbox(.inbox)
            }
        } catch {
            print("[Gmail] Untrash thread error: \(error)")
        }
    }
    
    /// Archive an entire thread (remove from Inbox).
    /// Per Gmail API: POST /users/me/threads/{id}/modify — remove INBOX label.
    /// Uses optimistic UI — removes thread immediately, rolls back on failure.
    func archiveThread(threadId: String) async {
        // Resolve account synchronously (no await) so we can optimistically update first
        let account = accountForThread(threadId: threadId)
        guard account != nil else { return }
        
        // Optimistic UI: remove thread and update selection BEFORE any async work
        let snapshot = await MainActor.run { () -> (removedInbox: GmailThread?, removedSent: GmailThread?, removedSearch: GmailThread?, inboxIdx: Int?, sentIdx: Int?, searchIdx: Int?) in
            let next = selectedThread?.id == threadId ? nextThreadAfterRemoval(of: threadId) : nil
            
            let inboxIdx = inboxThreads.firstIndex(where: { $0.id == threadId })
            let removedInbox = inboxIdx != nil ? inboxThreads.remove(at: inboxIdx!) : nil
            
            let searchIdx = searchResults.firstIndex(where: { $0.id == threadId })
            let removedSearch = searchIdx != nil ? searchResults.remove(at: searchIdx!) : nil
            
            if selectedThread?.id == threadId {
                selectedThread = next
                selectedMessageId = next?.latestMessage?.id
            }
            
            return (removedInbox, nil, removedSearch, inboxIdx, nil, searchIdx)
        }
        
        // Now resolve token (may involve async refresh) — UI is already updated
        guard let token = await validToken(for: account!) else {
            await rollbackRemoval(snapshot: snapshot, threadId: threadId)
            return
        }
        
        let url = URL(string: "\(Constants.Gmail.apiBase)/users/me/threads/\(threadId)/modify")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = ["removeLabelIds": ["INBOX"]]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        do {
            let (_, response) = try await resilientData(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 200 {
                print("[Gmail] Archived thread: \(threadId)")
            } else {
                await rollbackRemoval(snapshot: snapshot, threadId: threadId)
                print("[Gmail] Archive thread failed: HTTP \(status)")
            }
        } catch {
            await rollbackRemoval(snapshot: snapshot, threadId: threadId)
            print("[Gmail] Archive thread error: \(error)")
        }
    }
    
    /// Roll back an optimistic removal by re-inserting threads at their original positions.
    @MainActor
    private func rollbackRemoval(snapshot: (removedInbox: GmailThread?, removedSent: GmailThread?, removedSearch: GmailThread?, inboxIdx: Int?, sentIdx: Int?, searchIdx: Int?), threadId: String) {
        if let thread = snapshot.removedInbox, let idx = snapshot.inboxIdx {
            let insertAt = min(idx, inboxThreads.count)
            inboxThreads.insert(thread, at: insertAt)
        }
        if let thread = snapshot.removedSent, let idx = snapshot.sentIdx {
            let insertAt = min(idx, sentThreads.count)
            sentThreads.insert(thread, at: insertAt)
        }
        if let thread = snapshot.removedSearch, let idx = snapshot.searchIdx {
            let insertAt = min(idx, searchResults.count)
            searchResults.insert(thread, at: insertAt)
        }
        // Re-select the thread if nothing else is selected
        if selectedThread == nil {
            let restored = snapshot.removedInbox ?? snapshot.removedSent ?? snapshot.removedSearch
            if let restored {
                selectedThread = restored
                selectedMessageId = restored.latestMessage?.id
            }
        }
    }
    
    // MARK: - Fetch Sent Messages (for Style Analysis)
    
    /// Fetch recent sent messages for writing style analysis.
    /// Returns individual messages (not threads) from the SENT label.
    func fetchSentMessages(limit: Int = 100) async -> [GmailMessage] {
        // Use the primary (first) account for style analysis
        guard let account = accounts.first,
              let token = await validToken(for: account) else { return [] }
        
        // 1. List message IDs from SENT
        var components = URLComponents(string: "\(Constants.Gmail.apiBase)/users/me/messages")!
        components.queryItems = [
            URLQueryItem(name: "maxResults", value: "\(limit)"),
            URLQueryItem(name: "labelIds", value: "SENT"),
        ]
        
        guard let url = components.url else { return [] }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let (data, response) = try await resilientData(for: request)
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            
            var messageIds: [String] = []
            
            if statusCode == 401 {
                // Try refresh
                if let newToken = await refreshTokenAfterUnauthorised(for: account) {
                    var retryRequest = URLRequest(url: url)
                    retryRequest.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
                    let (retryData, _) = try await resilientData(for: retryRequest)
                    messageIds = parseMessageIds(from: retryData)
                }
            } else {
                messageIds = parseMessageIds(from: data)
            }
            
            guard !messageIds.isEmpty else { return [] }
            
            // 2. Fetch each message's full details concurrently
            var messages: [GmailMessage] = []
            
            await withTaskGroup(of: GmailMessage?.self) { group in
                for msgId in messageIds {
                    group.addTask { [self] in
                        await self.fetchMessage(id: msgId, token: token, account: account)
                    }
                }
                for await msg in group {
                    if let m = msg {
                        messages.append(m)
                    }
                }
            }
            
            // Sort by date descending (newest first)
            messages.sort { $0.date > $1.date }
            print("[Gmail] Fetched \(messages.count) sent messages for style analysis")
            return messages
            
        } catch {
            print("[Gmail] Fetch sent messages failed: \(error)")
            return []
        }
    }
    
    /// Parse message IDs from a messages.list response.
    private func parseMessageIds(from data: Data) -> [String] {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let messages = json["messages"] as? [[String: Any]] else {
            return []
        }
        return messages.compactMap { $0["id"] as? String }
    }
    
    /// Fetch a single message via `GET /users/me/messages/{id}?format=full`.
    private func fetchMessage(id: String, token: String, account: GmailAccount) async -> GmailMessage? {
        var components = URLComponents(string: "\(Constants.Gmail.apiBase)/users/me/messages/\(id)")!
        components.queryItems = [
            URLQueryItem(name: "format", value: "full"),
        ]
        
        guard let url = components.url else { return nil }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let (data, response) = try await resilientData(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401, let newToken = await refreshTokenAfterUnauthorised(for: account) {
                var retryRequest = URLRequest(url: url)
                retryRequest.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
                let (retryData, _) = try await resilientData(for: retryRequest)
                return parseFullMessage(from: retryData)
            }
            return parseFullMessage(from: data)
        } catch {
            print("[Gmail] Fetch message \(id) failed: \(error)")
            return nil
        }
    }
    
    // MARK: - Contact Suggestions (People API)
    
    /// Search contacts and "other contacts" (people emailed before) using the Google People API.
    /// Combines both sources and deduplicates by email address.
    func searchContactSuggestions(query: String) async -> [ContactSuggestion] {
        // Use the primary (first) account for contact search
        guard !query.isEmpty,
              let account = accounts.first,
              let token = await validToken(for: account) else { return [] }
        
        // Search saved contacts and "other contacts" in parallel
        async let saved = searchPeopleContacts(query: query, token: token)
        async let other = searchOtherContacts(query: query, token: token)
        
        let all = await saved + other
        
        // Deduplicate by email (case-insensitive), preserving order
        var seen = Set<String>()
        var unique: [ContactSuggestion] = []
        for contact in all {
            let key = contact.email.lowercased()
            if !seen.contains(key) {
                seen.insert(key)
                unique.append(contact)
            }
        }
        
        return unique
    }
    
    /// Search saved Google Contacts via People API.
    /// `GET /v1/people:searchContacts`
    /// Requires scope: `contacts.readonly`
    private func searchPeopleContacts(query: String, token: String) async -> [ContactSuggestion] {
        var components = URLComponents(string: "\(Constants.Gmail.peopleAPIBase)/people:searchContacts")!
        components.queryItems = [
            URLQueryItem(name: "query", value: query),
            URLQueryItem(name: "readMask", value: "names,emailAddresses"),
            URLQueryItem(name: "pageSize", value: "10"),
        ]
        
        guard let url = components.url else { return [] }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let (data, response) = try await resilientData(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            // 403 = scope not granted (user needs to re-authenticate); return empty gracefully
            guard status == 200 else {
                if status != 403 { print("[Gmail] People searchContacts HTTP \(status)") }
                return []
            }
            return parsePeopleSearchResults(from: data)
        } catch {
            print("[Gmail] People searchContacts error: \(error)")
            return []
        }
    }
    
    /// Search "Other Contacts" (people you've emailed but haven't saved) via People API.
    /// `GET /v1/otherContacts:search`
    /// Requires scope: `contacts.other.readonly`
    private func searchOtherContacts(query: String, token: String) async -> [ContactSuggestion] {
        var components = URLComponents(string: "\(Constants.Gmail.peopleAPIBase)/otherContacts:search")!
        components.queryItems = [
            URLQueryItem(name: "query", value: query),
            URLQueryItem(name: "readMask", value: "names,emailAddresses"),
            URLQueryItem(name: "pageSize", value: "10"),
        ]
        
        guard let url = components.url else { return [] }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let (data, response) = try await resilientData(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard status == 200 else {
                if status != 403 { print("[Gmail] People otherContacts:search HTTP \(status)") }
                return []
            }
            return parsePeopleSearchResults(from: data)
        } catch {
            print("[Gmail] People otherContacts:search error: \(error)")
            return []
        }
    }
    
    /// Parse a People API search response (`searchContacts` or `otherContacts:search`).
    /// Both endpoints return `{ "results": [{ "person": { ... } }] }`.
    private func parsePeopleSearchResults(from data: Data) -> [ContactSuggestion] {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let results = json["results"] as? [[String: Any]] else {
            return []
        }
        
        var suggestions: [ContactSuggestion] = []
        
        for result in results {
            guard let person = result["person"] as? [String: Any] else { continue }
            
            // Must have at least one email
            guard let emailAddresses = person["emailAddresses"] as? [[String: Any]],
                  let primaryEmail = emailAddresses.first?["value"] as? String else {
                continue
            }
            
            let names = person["names"] as? [[String: Any]]
            let displayName = names?.first?["displayName"] as? String ?? ""
            let resourceName = person["resourceName"] as? String ?? primaryEmail
            
            suggestions.append(ContactSuggestion(
                id: resourceName,
                name: displayName,
                email: primaryEmail
            ))
        }
        
        return suggestions
    }
    
    // MARK: - Header Parsing Helpers
    
    private func cleanFromHeader(_ raw: String) -> String {
        if let angleBracket = raw.firstIndex(of: "<") {
            let name = raw[raw.startIndex..<angleBracket].trimmingCharacters(in: .whitespaces)
            if !name.isEmpty {
                return name.trimmingCharacters(in: CharacterSet(charactersIn: "\""))
            }
        }
        return raw.trimmingCharacters(in: .whitespaces)
    }
    
    private func extractEmail(from raw: String) -> String {
        if let start = raw.firstIndex(of: "<"),
           let end = raw.firstIndex(of: ">") {
            let emailStart = raw.index(after: start)
            if emailStart < end {
                return String(raw[emailStart..<end])
            }
        }
        return raw.trimmingCharacters(in: .whitespaces)
    }
    
    private func parseEmailList(_ raw: String) -> [String] {
        guard !raw.isEmpty else { return [] }
        return raw
            .components(separatedBy: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }
    
    // MARK: - User Info
    
    private func fetchUserEmail(accessToken: String) async -> String? {
        if let email = await fetchFromUserInfo(accessToken: accessToken) {
            return email
        }
        if let email = await fetchFromGmailProfile(accessToken: accessToken) {
            return email
        }
        return nil
    }
    
    private func fetchFromUserInfo(accessToken: String) async -> String? {
        guard let url = URL(string: "https://www.googleapis.com/oauth2/v2/userinfo") else { return nil }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        do {
            let (data, _) = try await resilientData(for: request)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            return json?["email"] as? String
        } catch { return nil }
    }
    
    private func fetchFromGmailProfile(accessToken: String) async -> String? {
        guard let url = URL(string: "\(Constants.Gmail.apiBase)/users/me/profile") else { return nil }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        do {
            let (data, _) = try await resilientData(for: request)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            return json?["emailAddress"] as? String
        } catch { return nil }
    }
    
    // MARK: - Network Helpers
    
    private func postForm<T: Decodable>(url: String, body: [String: String]) async throws -> T {
        guard let requestURL = URL(string: url) else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        
        let formBody = body.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0.value)" }
            .joined(separator: "&")
        request.httpBody = formBody.data(using: .utf8)
        
        let (data, response) = try await resilientData(for: request)
        
        // Debug: log raw response for token exchange troubleshooting
        let httpStatus = (response as? HTTPURLResponse)?.statusCode ?? -1
        if httpStatus != 200 || T.self == TokenResponse.self {
            let preview = String(data: data.prefix(500), encoding: .utf8) ?? "(non-utf8)"
            print("[Gmail] postForm HTTP \(httpStatus): \(preview)")
        }
        
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: data)
    }
}

// MARK: - Response Models

private struct TokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String?
    let expiresIn: Int?
    let tokenType: String?
}
