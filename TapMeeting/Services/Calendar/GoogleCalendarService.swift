import Foundation
import AppKit

// MARK: - Google Calendar Account Model

/// A connected Google Calendar account with per-account token storage.
struct GoogleCalendarAccount: Identifiable, Codable, Equatable {
    let id: String
    let email: String
    let addedAt: Date
    
    /// Keychain key for this account's access token.
    var accessTokenKey: String { "google_access_token_\(id)" }
    /// Keychain key for this account's refresh token.
    var refreshTokenKey: String { "google_refresh_token_\(id)" }
}

// MARK: - Google Calendar Service

/// Handles Google Calendar OAuth 2.0 (desktop loopback flow) and event fetching.
///
/// Supports multiple Google accounts. Each account stores its own tokens in
/// Keychain using account-specific keys. Events from all accounts are merged.
///
/// Flow:
/// 1. Start a tiny local HTTP server on 127.0.0.1:8234
/// 2. Open the Google consent screen in the user's default browser
/// 3. Google redirects back to the loopback server with an auth code
/// 4. Exchange the code for access + refresh tokens
/// 5. Store tokens in Keychain; use refresh token to renew silently
@Observable
final class GoogleCalendarService {
    
    // MARK: - State

    /// All connected Google Calendar accounts.
    private(set) var accounts: [GoogleCalendarAccount] = []

    /// Whether any Google account is connected.
    var isConnected: Bool { !accounts.isEmpty }

    /// First connected email (backward compatibility).
    var connectedEmail: String? { accounts.first?.email }

    var isAuthenticating = false
    var authError: String?

    /// Combined Google Calendar events from all connected accounts.
    private(set) var events: [CalendarEvent] = []

    /// Called after events are fetched so the merged calendar service can refresh.
    var onEventsFetched: (() -> Void)?

    // MARK: - Calendar List State

    /// All sub-calendars from all connected accounts (e.g. "Work", "Personal", "Birthdays").
    private(set) var calendars: [GoogleCalendar] = []

    /// Whether the service is currently loading events for the calendar view.
    var isLoadingCalendarEvents = false

    // MARK: - Event Cache

    /// In-memory cache for calendar view events, keyed by date range.
    private struct CachedRange {
        let events: [CalendarEvent]
        let fetchedAt: Date
    }

    /// Cache keyed by "startTimestamp-endTimestamp".
    private var eventCache: [String: CachedRange] = [:]

    /// How long cached events remain valid before a background refresh.
    private let cacheTTL: TimeInterval = 5 * 60 // 5 minutes

    /// Events filtered by calendar visibility toggles.
    var visibleEvents: [CalendarEvent] {
        let visibleCalIds = Set(calendars.filter(\.isVisible).map(\.id))
        return events.filter { event in
            guard let calId = event.calendarId else { return true }
            return visibleCalIds.contains(calId)
        }
    }
    
    // MARK: - Supabase Integration

    /// When set, Google access tokens come from Supabase auth for the primary account.
    /// Additional accounts use per-account Keychain tokens via the legacy OAuth flow.
    var supabaseService: SupabaseService? {
        didSet { ensureSupabaseAccount() }
    }

    /// Whether connected via Supabase (single Google login) or legacy multi-account.
    var isConnectedViaSupabase: Bool { supabaseService?.isAuthenticated ?? false }
    
    /// Whether the given account is the Supabase-managed primary account.
    func isSupabaseAccount(_ account: GoogleCalendarAccount) -> Bool {
        account.id == "supabase"
    }

    // MARK: - Private

    private var loopbackServer: LoopbackServer?

    /// Whether a client ID is configured (user-provided or built-in).
    var hasClientID: Bool { !clientID.isEmpty }

    /// Whether both client ID and secret are configured (needed for adding additional accounts).
    var hasCredentials: Bool { !clientID.isEmpty && !clientSecret.isEmpty }

    /// The effective client ID — either user-provided or built-in.
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
        loadCalendarVisibility()
    }
    
    // MARK: - Account Storage
    
    private func loadAccounts() {
        // Load persisted additional (non-Supabase) accounts.
        if let data = UserDefaults.standard.data(forKey: Constants.Defaults.googleCalendarAccounts),
           let decoded = try? JSONDecoder().decode([GoogleCalendarAccount].self, from: data) {
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
            UserDefaults.standard.set(data, forKey: Constants.Defaults.googleCalendarAccounts)
        }
    }
    
    /// Ensure the Supabase-authenticated Google account is represented in the accounts array.
    /// Called when `supabaseService` is set or when authentication state may have changed.
    func ensureSupabaseAccount() {
        guard let supa = supabaseService, supa.isAuthenticated else {
            accounts.removeAll { $0.id == "supabase" }
            return
        }
        
        let email = supa.currentUserEmail ?? "user"
        let addedAt = accounts.first(where: { $0.id == "supabase" })?.addedAt ?? .now
        let supabaseAccount = GoogleCalendarAccount(id: "supabase", email: email, addedAt: addedAt)
        
        let additional = accounts.filter { $0.id != "supabase" }
        accounts = [supabaseAccount] + additional
    }
    
    /// Add an additional account that was authenticated via GmailService's combined OAuth flow.
    /// Tokens are already stored in Keychain by the caller.
    func addAdditionalAccount(_ account: GoogleCalendarAccount) {
        guard !accounts.contains(where: { $0.email.lowercased() == account.email.lowercased() && $0.id != "supabase" }) else {
            print("[GoogleCalendar] \(account.email) already connected, skipping")
            return
        }
        accounts.append(account)
        saveAccounts()
        print("[GoogleCalendar] ✓ Added additional account: \(account.email)")
    }
    
    /// Remove an additional account (called when Gmail disconnects it).
    func removeAdditionalAccount(id: String) {
        guard id != "supabase" else { return }
        if let account = accounts.first(where: { $0.id == id }) {
            KeychainHelper.delete(key: account.accessTokenKey)
            KeychainHelper.delete(key: account.refreshTokenKey)
        }
        accounts.removeAll { $0.id == id }
        saveAccounts()
    }

    // MARK: - OAuth Flow (Additional Accounts)
    
    /// Start the Google OAuth sign-in flow to add an additional account.
    /// Uses loopback OAuth with Google credentials from app_config.
    func signInAdditionalAccount() {
        guard let cid = supabaseService?.googleClientID, !cid.isEmpty,
              let secret = supabaseService?.googleClientSecret, !secret.isEmpty else {
            authError = "Google credentials not configured. Contact your admin."
            return
        }
        
        guard !isAuthenticating else { return }
        isAuthenticating = true
        authError = nil
        
        loopbackServer?.stop()
        loopbackServer = LoopbackServer(
            port: Constants.GoogleCalendar.loopbackPort,
            successTitle: "Google Calendar Account Connected"
        ) { [weak self] code in
            guard let self else { return }
            Task { await self.exchangeCodeForTokens(code) }
        }
        loopbackServer?.start()
        
        var components = URLComponents(string: Constants.GoogleCalendar.authURL)!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: cid),
            URLQueryItem(name: "redirect_uri", value: Constants.GoogleCalendar.redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: Constants.GoogleCalendar.scopes),
            URLQueryItem(name: "access_type", value: "offline"),
            URLQueryItem(name: "prompt", value: "consent"),
        ]
        
        if let url = components.url {
            NSWorkspace.shared.open(url)
        }
    }
    
    /// Start the Google OAuth sign-in flow to add a new account.
    /// Opens the consent screen in the browser and waits for the callback.
    func signIn() {
        signInAdditionalAccount()
    }
    
    /// Disconnect a specific account by ID.
    func disconnect(accountId: String) {
        guard accountId != "supabase" else { return }
        
        if let account = accounts.first(where: { $0.id == accountId }) {
            KeychainHelper.delete(key: account.accessTokenKey)
            KeychainHelper.delete(key: account.refreshTokenKey)
        }
        accounts.removeAll { $0.id == accountId }
        saveAccounts()
        invalidateEventCache()
        print("[GoogleCalendar] Disconnected additional account: \(accountId)")
    }
    
    /// Sign out — disconnect all accounts.
    func signOut() {
        for account in accounts {
            KeychainHelper.delete(key: account.accessTokenKey)
            KeychainHelper.delete(key: account.refreshTokenKey)
        }
        accounts = []
        events = []
        saveAccounts()
        invalidateEventCache()
        print("[GoogleCalendar] All accounts signed out")
    }
    
    // MARK: - Token Exchange
    
    /// Exchange the authorisation code for access + refresh tokens, then add the account.
    private func exchangeCodeForTokens(_ code: String) async {
        let cid = supabaseService?.googleClientID ?? clientID
        let secret = supabaseService?.googleClientSecret ?? clientSecret
        let body = [
            "code": code,
            "client_id": cid,
            "client_secret": secret,
            "redirect_uri": Constants.GoogleCalendar.redirectURI,
            "grant_type": "authorization_code",
        ]
        
        do {
            let tokenResponse: TokenResponse = try await postForm(
                url: Constants.GoogleCalendar.tokenURL,
                body: body
            )
            
            // Fetch the user's email
            let email = await fetchUserEmail(accessToken: tokenResponse.accessToken)
            let emailStr = email ?? "Unknown"
            
            // Prevent duplicate accounts
            if accounts.contains(where: { $0.email.lowercased() == emailStr.lowercased() }) {
                await MainActor.run {
                    isAuthenticating = false
                    authError = "\(emailStr) is already connected."
                }
                return
            }
            
            // Create a new account entry
            let accountId = UUID().uuidString
            let account = GoogleCalendarAccount(id: accountId, email: emailStr, addedAt: .now)
            
            // Store tokens with account-specific keys
            KeychainHelper.set(key: account.accessTokenKey, value: tokenResponse.accessToken)
            if let refresh = tokenResponse.refreshToken {
                KeychainHelper.set(key: account.refreshTokenKey, value: refresh)
            }
            
            await MainActor.run {
                accounts.append(account)
                saveAccounts()
                isAuthenticating = false
                authError = nil
            }
            
            print("[GoogleCalendar] ✓ Connected: \(emailStr)")
            
            // Fetch events from all accounts
            await fetchEvents()
            
        } catch {
            await MainActor.run {
                isAuthenticating = false
                authError = "Authentication failed: \(error.localizedDescription)"
            }
            print("[GoogleCalendar] ✗ Token exchange failed: \(error)")
        }
    }
    
    /// Refresh the access token for a specific account.
    private func refreshAccessToken(for account: GoogleCalendarAccount) async -> String? {
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
                url: Constants.GoogleCalendar.tokenURL,
                body: body
            )
            KeychainHelper.set(key: account.accessTokenKey, value: response.accessToken)
            return response.accessToken
        } catch {
            print("[GoogleCalendar] Token refresh failed for \(account.email): \(error)")
            return nil
        }
    }
    
    // MARK: - Cancellation-Resistant Network
    
    /// Callback-based URLSession wrapper immune to Swift Task cancellation.
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
    
    // MARK: - Fetch Events (Legacy — 24h ahead for MenuBar)

    /// Fetch upcoming events from all connected Google Calendar accounts (24h window).
    /// Used by MenuBar and CalendarService for meeting detection.
    func fetchEvents() async {
        await MainActor.run { ensureSupabaseAccount() }

        guard !accounts.isEmpty else {
            await MainActor.run {
                events = []
                onEventsFetched?()
            }
            return
        }

        let now = Date.now
        let tomorrow = Calendar.current.date(byAdding: .hour, value: 24, to: now)!
        let fetched = await fetchEventsForRange(start: now, end: tomorrow)

        await MainActor.run {
            self.events = fetched
            self.onEventsFetched?()
        }

        print("[GoogleCalendar] Fetched \(fetched.count) events from \(accounts.count) account(s)")
    }

    // MARK: - Calendar List

    /// Fetch the list of sub-calendars from all accounts concurrently.
    func fetchAllCalendars() async {
        await MainActor.run { ensureSupabaseAccount() }
        guard !accounts.isEmpty else { return }

        let allCalendars: [GoogleCalendar] = await withTaskGroup(of: [GoogleCalendar].self) { group in
            for account in accounts {
                group.addTask { [self] in
                    await self.fetchCalendarList(for: account)
                }
            }
            var collected: [GoogleCalendar] = []
            for await cals in group {
                collected.append(contentsOf: cals)
            }
            return collected
        }

        // Merge with persisted visibility state
        let hiddenIds = loadHiddenCalendarIds()

        await MainActor.run {
            self.calendars = allCalendars.map { cal in
                var c = cal
                c.isVisible = !hiddenIds.contains(cal.id)
                return c
            }
        }

        print("[GoogleCalendar] Loaded \(allCalendars.count) calendars from \(accounts.count) account(s)")
    }

    /// Fetch sub-calendars for a single account.
    private func fetchCalendarList(for account: GoogleCalendarAccount) async -> [GoogleCalendar] {
        guard let token = await validAccessToken(for: account) else { return [] }

        var components = URLComponents(string: Constants.GoogleCalendar.calendarListEndpoint)!
        components.queryItems = [
            URLQueryItem(name: "minAccessRole", value: "reader"),
            URLQueryItem(name: "showHidden", value: "false"),
        ]

        guard let url = components.url else { return [] }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        do {
            let (data, response) = try await resilientData(for: request)

            if let http = response as? HTTPURLResponse, http.statusCode == 401 {
                if let newToken = await refreshTokenAfterUnauthorised(for: account) {
                    var retry = URLRequest(url: url)
                    retry.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
                    let (retryData, _) = try await resilientData(for: retry)
                    return parseCalendarList(from: retryData, accountId: account.id)
                }
                return []
            }

            return parseCalendarList(from: data, accountId: account.id)
        } catch {
            print("[GoogleCalendar] Fetch calendar list failed for \(account.email): \(error)")
            return []
        }
    }

    private func parseCalendarList(from data: Data, accountId: String) -> [GoogleCalendar] {
        guard let decoded = try? JSONDecoder().decode(GoogleCalendarListResponse.self, from: data) else {
            return []
        }
        return (decoded.items ?? []).map { item in
            GoogleCalendar(
                id: item.id,
                accountId: accountId,
                summary: item.summary ?? "Untitled",
                backgroundColor: item.backgroundColor,
                foregroundColor: item.foregroundColor,
                isPrimary: item.primary ?? false
            )
        }
    }

    // MARK: - Calendar Visibility

    /// Toggle a sub-calendar on or off.
    func toggleCalendarVisibility(calendarId: String) {
        guard let index = calendars.firstIndex(where: { $0.id == calendarId }) else { return }
        calendars[index].isVisible.toggle()
        saveCalendarVisibility()
    }

    /// Show all calendars.
    func showAllCalendars() {
        for i in calendars.indices { calendars[i].isVisible = true }
        saveCalendarVisibility()
    }

    /// Hide all calendars.
    func hideAllCalendars() {
        for i in calendars.indices { calendars[i].isVisible = false }
        saveCalendarVisibility()
    }

    private func saveCalendarVisibility() {
        let hidden = calendars.filter { !$0.isVisible }.map(\.id)
        if let data = try? JSONEncoder().encode(hidden) {
            UserDefaults.standard.set(data, forKey: Constants.Defaults.calendarVisibilityState)
        }
    }

    private func loadCalendarVisibility() {
        // Applied after calendars are fetched — see fetchAllCalendars()
    }

    private func loadHiddenCalendarIds() -> Set<String> {
        guard let data = UserDefaults.standard.data(forKey: Constants.Defaults.calendarVisibilityState),
              let ids = try? JSONDecoder().decode([String].self, from: data) else {
            return []
        }
        return Set(ids)
    }

    // MARK: - Fetch Events for Date Range (Calendar View)

    /// Fetch events within a specific date range from all accounts, across all visible calendars.
    /// Returns cached results instantly if available and fresh; fetches from API otherwise.
    func fetchEventsForRange(start: Date, end: Date, forceRefresh: Bool = false) async -> [CalendarEvent] {
        await MainActor.run { ensureSupabaseAccount() }
        guard !accounts.isEmpty else { return [] }

        let cacheKey = "\(Int(start.timeIntervalSince1970))-\(Int(end.timeIntervalSince1970))"

        // Return cached events if still fresh
        if !forceRefresh, let cached = eventCache[cacheKey],
           Date.now.timeIntervalSince(cached.fetchedAt) < cacheTTL {
            return cached.events
        }

        // Ensure calendars are loaded
        if calendars.isEmpty {
            await fetchAllCalendars()
        }

        let iso = ISO8601DateFormatter()
        let timeMin = iso.string(from: start)
        let timeMax = iso.string(from: end)

        let allEvents: [CalendarEvent] = await withTaskGroup(of: [CalendarEvent].self) { group in
            for account in accounts {
                let accountCalendars = calendars.filter { $0.accountId == account.id }
                let calIds = accountCalendars.isEmpty ? ["primary"] : accountCalendars.map(\.id)

                for calId in calIds {
                    group.addTask { [self] in
                        await self.fetchEventsFromCalendar(
                            calendarId: calId,
                            account: account,
                            timeMin: timeMin,
                            timeMax: timeMax
                        )
                    }
                }
            }

            var collected: [CalendarEvent] = []
            for await batch in group {
                collected.append(contentsOf: batch)
            }
            return collected
        }

        // Deduplicate by event ID and sort
        var seen = Set<String>()
        let unique = allEvents.filter { seen.insert($0.id).inserted }
        let sorted = unique.sorted { $0.startDate < $1.startDate }

        // Store in cache
        eventCache[cacheKey] = CachedRange(events: sorted, fetchedAt: .now)

        return sorted
    }

    /// Clear the event cache (e.g. after calendar visibility changes or account changes).
    func invalidateEventCache() {
        eventCache.removeAll()
    }

    /// Fetch events from a specific calendar for a specific account.
    private func fetchEventsFromCalendar(
        calendarId: String,
        account: GoogleCalendarAccount,
        timeMin: String,
        timeMax: String
    ) async -> [CalendarEvent] {
        guard let token = await validAccessToken(for: account) else { return [] }

        let encodedCalId = calendarId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? calendarId
        var components = URLComponents(string: "\(Constants.GoogleCalendar.calendarAPIBase)/calendars/\(encodedCalId)/events")!
        components.queryItems = [
            URLQueryItem(name: "timeMin", value: timeMin),
            URLQueryItem(name: "timeMax", value: timeMax),
            URLQueryItem(name: "singleEvents", value: "true"),
            URLQueryItem(name: "orderBy", value: "startTime"),
            URLQueryItem(name: "maxResults", value: "250"),
        ]

        guard let url = components.url else { return [] }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        do {
            let (data, response) = try await resilientData(for: request)

            if let http = response as? HTTPURLResponse, http.statusCode == 401 {
                if let newToken = await refreshTokenAfterUnauthorised(for: account) {
                    var retry = URLRequest(url: url)
                    retry.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
                    let (retryData, _) = try await resilientData(for: retry)
                    return parseEventsEnriched(from: retryData, calendarId: calendarId, accountEmail: account.email)
                }
                return []
            }

            return parseEventsEnriched(from: data, calendarId: calendarId, accountEmail: account.email)
        } catch {
            print("[GoogleCalendar] Fetch events failed for \(account.email)/\(calendarId): \(error)")
            return []
        }
    }

    /// Get a valid access token for the account, refreshing if needed.
    private func validAccessToken(for account: GoogleCalendarAccount) async -> String? {
        if account.id == "supabase", let supa = supabaseService {
            return await supa.validGoogleAccessToken()
        }
        let token = KeychainHelper.get(key: account.accessTokenKey)
        if let t = token, !t.isEmpty { return t }
        return await refreshAccessToken(for: account)
    }

    /// Tag parsed events with the account they came from.
    private func tagEvents(_ events: [CalendarEvent], account: GoogleCalendarAccount) -> [CalendarEvent] {
        events.map { event in
            var e = event
            e.calendarSource = account.email
            return e
        }
    }

    /// Parse events with enriched fields (location, description, organizer, attendee details).
    private func parseEventsEnriched(from data: Data, calendarId: String, accountEmail: String) -> [CalendarEvent] {
        guard let decoded = try? JSONDecoder().decode(GoogleEventsResponse.self, from: data) else {
            return []
        }

        let isoFull = ISO8601DateFormatter()
        isoFull.formatOptions = [.withInternetDateTime]

        let dateOnly = DateFormatter()
        dateOnly.dateFormat = "yyyy-MM-dd"

        return (decoded.items ?? []).compactMap { item in
            let isAllDay = item.start?.date != nil && item.start?.dateTime == nil

            let startDate: Date
            let endDate: Date

            if isAllDay {
                guard let startStr = item.start?.date,
                      let sd = dateOnly.date(from: startStr) else { return nil }
                startDate = sd
                if let endStr = item.end?.date, let ed = dateOnly.date(from: endStr) {
                    endDate = ed
                } else {
                    endDate = Foundation.Calendar.current.date(byAdding: .day, value: 1, to: sd)!
                }
            } else {
                guard let startStr = item.start?.dateTime,
                      let endStr = item.end?.dateTime,
                      let sd = isoFull.date(from: startStr),
                      let ed = isoFull.date(from: endStr) else { return nil }
                startDate = sd
                endDate = ed
            }

            // Meeting URL
            let meetingURLString = item.hangoutLink
                ?? item.conferenceData?.entryPoints?.first(where: { $0.entryPointType == "video" })?.uri
            let meetingURL = meetingURLString.flatMap { URL(string: $0) }

            // Attendees
            let allAttendees = item.attendees ?? []
            let nonSelfAttendees = allAttendees.filter { $0.`self` != true }

            let attendeeNames: [String] = nonSelfAttendees.compactMap { att in
                if let name = att.displayName, !name.isEmpty { return name }
                if let email = att.email {
                    return email.components(separatedBy: "@").first?
                        .replacingOccurrences(of: ".", with: " ").capitalized
                }
                return nil
            }

            let attendeeEmails: [String] = nonSelfAttendees.compactMap(\.email)

            var responseStatuses: [String: String] = [:]
            for att in allAttendees {
                if let email = att.email, let status = att.responseStatus {
                    responseStatuses[email] = status
                }
            }

            // Organizer
            let organizer: String? = item.organizer?.displayName ?? item.organizer?.email
            let organizerEmail: String? = item.organizer?.email

            return CalendarEvent(
                id: item.id ?? UUID().uuidString,
                title: item.summary ?? "Untitled Event",
                startDate: startDate,
                endDate: endDate,
                attendeeCount: allAttendees.count,
                isAllDay: isAllDay,
                meetingURL: meetingURL,
                attendeeNames: attendeeNames,
                calendarSource: accountEmail,
                calendarId: calendarId,
                location: item.location,
                eventDescription: item.description,
                organizer: organizer,
                organizerEmail: organizerEmail,
                htmlLink: item.htmlLink,
                colorId: item.colorId,
                attendeeEmails: attendeeEmails,
                responseStatuses: responseStatuses
            )
        }
    }

    /// Parse events (legacy format — used by fetchEvents for MenuBar compatibility).
    private func parseEvents(from data: Data) -> [CalendarEvent] {
        parseEventsEnriched(from: data, calendarId: "primary", accountEmail: "")
            .filter { !$0.isAllDay }
    }
    
    // MARK: - User Info
    
    private func fetchUserEmail(accessToken: String) async -> String? {
        guard let url = URL(string: "https://www.googleapis.com/oauth2/v2/userinfo") else { return nil }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        
        do {
            let (data, _) = try await resilientData(for: request)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            return json?["email"] as? String
        } catch {
            return nil
        }
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
        
        let (data, _) = try await resilientData(for: request)
        
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: data)
    }

    /// Refresh token through the appropriate path (Supabase primary vs legacy account).
    private func refreshTokenAfterUnauthorised(for account: GoogleCalendarAccount) async -> String? {
        if account.id == "supabase" {
            return await supabaseService?.refreshGoogleAccessToken()
        }
        return await refreshAccessToken(for: account)
    }
}

// MARK: - Response Models

private struct TokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String?
    let expiresIn: Int?
    let tokenType: String?
}

private struct GoogleEventsResponse: Decodable {
    let items: [GoogleEventItem]?
}

private struct GoogleEventItem: Decodable {
    let id: String?
    let summary: String?
    let description: String?
    let location: String?
    let start: GoogleEventTime?
    let end: GoogleEventTime?
    let attendees: [GoogleAttendee]?
    let hangoutLink: String?
    let htmlLink: String?
    let colorId: String?
    let conferenceData: GoogleConferenceData?
    let organizer: GoogleEventOrganizer?
}

private struct GoogleEventOrganizer: Decodable {
    let email: String?
    let displayName: String?
}

private struct GoogleConferenceData: Decodable {
    let entryPoints: [GoogleEntryPoint]?
}

private struct GoogleEntryPoint: Decodable {
    let entryPointType: String?
    let uri: String?
}

private struct GoogleEventTime: Decodable {
    let dateTime: String?
    let date: String?
}

private struct GoogleAttendee: Decodable {
    let email: String?
    let displayName: String?
    let `self`: Bool?
    let responseStatus: String?
}

// MARK: - Calendar List Response

private struct GoogleCalendarListResponse: Decodable {
    let items: [GoogleCalendarListItem]?
}

private struct GoogleCalendarListItem: Decodable {
    let id: String
    let summary: String?
    let backgroundColor: String?
    let foregroundColor: String?
    let primary: Bool?
    let selected: Bool?
}

