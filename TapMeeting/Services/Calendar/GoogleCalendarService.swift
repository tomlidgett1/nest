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
    }
    
    // MARK: - Account Storage
    
    private func loadAccounts() {
        if let data = UserDefaults.standard.data(forKey: Constants.Defaults.googleCalendarAccounts),
           let decoded = try? JSONDecoder().decode([GoogleCalendarAccount].self, from: data) {
            accounts = decoded
        } else {
            migrateLegacyAccount()
        }
    }
    
    private func saveAccounts() {
        // Only persist non-Supabase accounts — the Supabase account is managed dynamically
        let legacyAccounts = accounts.filter { $0.id != "supabase" }
        if let data = try? JSONEncoder().encode(legacyAccounts) {
            UserDefaults.standard.set(data, forKey: Constants.Defaults.googleCalendarAccounts)
        }
    }
    
    /// Ensure the Supabase-authenticated Google account is represented in the accounts array.
    /// Called when `supabaseService` is set or when authentication state may have changed.
    func ensureSupabaseAccount() {
        guard let supa = supabaseService, supa.isAuthenticated else {
            // Remove Supabase account when signed out
            if accounts.contains(where: { $0.id == "supabase" }) {
                accounts.removeAll { $0.id == "supabase" }
            }
            return
        }
        
        let email = supa.currentUserEmail ?? "user"
        
        if let existingIdx = accounts.firstIndex(where: { $0.id == "supabase" }) {
            // Update email if it changed
            if accounts[existingIdx].email != email {
                accounts[existingIdx] = GoogleCalendarAccount(id: "supabase", email: email, addedAt: accounts[existingIdx].addedAt)
            }
        } else {
            // Insert at the beginning so it's the primary/default account
            accounts.insert(GoogleCalendarAccount(id: "supabase", email: email, addedAt: .now), at: 0)
        }
    }
    
    /// Migrate from the old single-account storage to multi-account.
    /// Runs once — moves tokens to per-account keys and cleans up legacy keys.
    private func migrateLegacyAccount() {
        guard UserDefaults.standard.bool(forKey: Constants.Defaults.googleCalendarConnected) else { return }
        
        let email = UserDefaults.standard.string(forKey: Constants.Defaults.googleCalendarEmail) ?? "Unknown"
        let accountId = UUID().uuidString
        
        // Move tokens to per-account keys
        if let accessToken = KeychainHelper.get(key: Constants.Keychain.googleAccessToken) {
            KeychainHelper.set(key: "google_access_token_\(accountId)", value: accessToken)
            KeychainHelper.delete(key: Constants.Keychain.googleAccessToken)
        }
        if let refreshToken = KeychainHelper.get(key: Constants.Keychain.googleRefreshToken) {
            KeychainHelper.set(key: "google_refresh_token_\(accountId)", value: refreshToken)
            KeychainHelper.delete(key: Constants.Keychain.googleRefreshToken)
        }
        
        let account = GoogleCalendarAccount(id: accountId, email: email, addedAt: .now)
        accounts = [account]
        saveAccounts()
        
        // Clean up legacy keys
        UserDefaults.standard.removeObject(forKey: Constants.Defaults.googleCalendarConnected)
        UserDefaults.standard.removeObject(forKey: Constants.Defaults.googleCalendarEmail)
        
        print("[GoogleCalendar] Migrated legacy account: \(email)")
    }
    
    // MARK: - OAuth Flow
    
    /// Start the Google OAuth sign-in flow to add a new account.
    /// Opens the consent screen in the browser and waits for the callback.
    func signIn() {
        guard !clientID.isEmpty else {
            authError = "No Google Client ID configured."
            return
        }
        guard !clientSecret.isEmpty else {
            authError = "No Google Client Secret configured."
            return
        }
        
        isAuthenticating = true
        authError = nil
        
        // 1. Start loopback server
        loopbackServer = LoopbackServer(
            port: Constants.GoogleCalendar.loopbackPort,
            successTitle: "Connected to Google Calendar"
        ) { [weak self] code in
            self?.loopbackServer?.stop()
            self?.loopbackServer = nil
            Task { await self?.exchangeCodeForTokens(code) }
        }
        loopbackServer?.start()
        
        // 2. Open browser to Google consent with account chooser
        var components = URLComponents(string: Constants.GoogleCalendar.authURL)!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: Constants.GoogleCalendar.redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: Constants.GoogleCalendar.scopes),
            URLQueryItem(name: "access_type", value: "offline"),
            URLQueryItem(name: "prompt", value: "consent select_account"),
        ]
        
        if let url = components.url {
            NSWorkspace.shared.open(url)
        }
    }
    
    /// Disconnect a specific account by ID.
    func disconnect(accountId: String) {
        // Don't allow disconnecting the Supabase primary account (sign out via Supabase instead)
        guard accountId != "supabase" else { return }
        guard let account = accounts.first(where: { $0.id == accountId }) else { return }
        
        KeychainHelper.delete(key: account.accessTokenKey)
        KeychainHelper.delete(key: account.refreshTokenKey)
        accounts.removeAll { $0.id == accountId }
        saveAccounts()
        
        // Refresh combined events list
        Task { await fetchEvents() }
        
        print("[GoogleCalendar] Disconnected: \(account.email)")
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
        print("[GoogleCalendar] All accounts signed out")
    }
    
    /// Save the user-provided client ID.
    func setClientID(_ id: String) {
        KeychainHelper.set(key: Constants.Keychain.googleClientID, value: id)
    }
    
    /// Save the user-provided client secret.
    func setClientSecret(_ secret: String) {
        KeychainHelper.set(key: Constants.Keychain.googleClientSecret, value: secret)
    }
    
    // MARK: - Token Exchange
    
    /// Exchange the authorisation code for access + refresh tokens, then add the account.
    private func exchangeCodeForTokens(_ code: String) async {
        let body = [
            "code": code,
            "client_id": clientID,
            "client_secret": clientSecret,
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
        
        let body = [
            "refresh_token": refreshToken,
            "client_id": clientID,
            "client_secret": clientSecret,
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
    
    // MARK: - Fetch Events
    
    /// Fetch upcoming events from all connected Google Calendar accounts.
    func fetchEvents() async {
        // Ensure the Supabase account is up to date before fetching
        await MainActor.run { ensureSupabaseAccount() }

        guard !accounts.isEmpty else {
            await MainActor.run {
                events = []
                onEventsFetched?()
            }
            return
        }

        // Fetch from all accounts concurrently
        let allEvents: [CalendarEvent] = await withTaskGroup(of: [CalendarEvent].self) { group in
            for account in accounts {
                group.addTask { [self] in
                    await self.fetchEvents(for: account)
                }
            }

            var collected: [CalendarEvent] = []
            for await accountEvents in group {
                collected.append(contentsOf: accountEvents)
            }
            return collected
        }

        await MainActor.run {
            self.events = allEvents
            self.onEventsFetched?()
        }

        print("[GoogleCalendar] Fetched \(allEvents.count) total events from \(accounts.count) account(s)")
    }
    
    /// Fetch events for a single account.
    private func fetchEvents(for account: GoogleCalendarAccount) async -> [CalendarEvent] {
        // Route to the correct token source based on account type
        var accessToken: String?
        if account.id == "supabase", let supa = supabaseService {
            // Supabase-managed primary account
            accessToken = await supa.getGoogleAccessToken()
            if accessToken == nil {
                accessToken = await supa.refreshGoogleAccessToken()
            }
        } else {
            // Legacy account — use per-account Keychain tokens
            accessToken = KeychainHelper.get(key: account.accessTokenKey)
            if accessToken == nil || accessToken?.isEmpty == true {
                accessToken = await refreshAccessToken(for: account)
            }
        }

        guard let token = accessToken, !token.isEmpty else {
            print("[GoogleCalendar] No valid access token for \(account.email)")
            return []
        }
        
        let now = ISO8601DateFormatter().string(from: Date.now)
        let tomorrow = ISO8601DateFormatter().string(
            from: Calendar.current.date(byAdding: .hour, value: 24, to: .now)!
        )
        
        var components = URLComponents(string: "\(Constants.GoogleCalendar.calendarAPIBase)/calendars/primary/events")!
        components.queryItems = [
            URLQueryItem(name: "timeMin", value: now),
            URLQueryItem(name: "timeMax", value: tomorrow),
            URLQueryItem(name: "singleEvents", value: "true"),
            URLQueryItem(name: "orderBy", value: "startTime"),
            URLQueryItem(name: "maxResults", value: "20"),
        ]
        
        guard let url = components.url else { return [] }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            
            // If 401, try refreshing token once
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 401 {
                if let newToken = await refreshAccessToken(for: account) {
                    var retryRequest = URLRequest(url: url)
                    retryRequest.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
                    let (retryData, _) = try await URLSession.shared.data(for: retryRequest)
                    return tagEvents(parseEvents(from: retryData), account: account)
                }
                return []
            }
            
            return tagEvents(parseEvents(from: data), account: account)
            
        } catch {
            print("[GoogleCalendar] Fetch events failed for \(account.email): \(error)")
            return []
        }
    }
    
    /// Tag parsed events with the account they came from.
    private func tagEvents(_ events: [CalendarEvent], account: GoogleCalendarAccount) -> [CalendarEvent] {
        events.map { event in
            var e = event
            e.calendarSource = account.email
            return e
        }
    }
    
    /// Parse a Google Calendar API events response into CalendarEvent models.
    private func parseEvents(from data: Data) -> [CalendarEvent] {
        guard let decoded = try? JSONDecoder().decode(GoogleEventsResponse.self, from: data) else {
            return []
        }
        
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        
        return (decoded.items ?? []).compactMap { item in
            // Skip all-day events
            guard item.start?.dateTime != nil else { return nil }
            
            guard let startStr = item.start?.dateTime,
                  let endStr = item.end?.dateTime,
                  let startDate = formatter.date(from: startStr),
                  let endDate = formatter.date(from: endStr) else {
                return nil
            }
            
            // Extract meeting URL: prefer hangoutLink, fall back to conferenceData video entry
            let meetingURLString = item.hangoutLink
                ?? item.conferenceData?.entryPoints?.first(where: { $0.entryPointType == "video" })?.uri
            let meetingURL = meetingURLString.flatMap { URL(string: $0) }
            
            // Extract attendee display names, excluding the calendar owner
            let attendeeNames: [String] = (item.attendees ?? [])
                .filter { $0.`self` != true }
                .compactMap { attendee in
                    if let name = attendee.displayName, !name.isEmpty {
                        return name
                    }
                    // Fall back to the part before @ in the email
                    if let email = attendee.email {
                        return email.components(separatedBy: "@").first?.replacingOccurrences(of: ".", with: " ").capitalized
                    }
                    return nil
                }
            
            return CalendarEvent(
                id: item.id ?? UUID().uuidString,
                title: item.summary ?? "Untitled Event",
                startDate: startDate,
                endDate: endDate,
                attendeeCount: item.attendees?.count ?? 0,
                isAllDay: false,
                meetingURL: meetingURL,
                attendeeNames: attendeeNames
            )
        }
    }
    
    // MARK: - User Info
    
    private func fetchUserEmail(accessToken: String) async -> String? {
        guard let url = URL(string: "https://www.googleapis.com/oauth2/v2/userinfo") else { return nil }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
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
        
        let (data, _) = try await URLSession.shared.data(for: request)
        
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

private struct GoogleEventsResponse: Decodable {
    let items: [GoogleEventItem]?
}

private struct GoogleEventItem: Decodable {
    let id: String?
    let summary: String?
    let start: GoogleEventTime?
    let end: GoogleEventTime?
    let attendees: [GoogleAttendee]?
    let hangoutLink: String?
    let conferenceData: GoogleConferenceData?
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
}

