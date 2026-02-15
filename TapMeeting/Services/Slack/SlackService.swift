import Foundation
import AppKit

// MARK: - Slack Account Model

/// A connected Slack workspace with per-account token storage.
struct SlackAccount: Codable, Equatable {
    let userId: String
    let teamId: String
    let teamName: String
    let userName: String
    let addedAt: Date
    
    /// Keychain key for this account's user access token.
    var accessTokenKey: String { "slack_user_token_\(teamId)" }
}

// MARK: - Slack Conversation Model

/// A Slack conversation (channel, DM, group DM, or private channel).
struct SlackConversation: Identifiable, Equatable {
    let id: String
    let name: String
    let isIM: Bool
    let isMPIM: Bool
    let isPrivate: Bool
    let isChannel: Bool
    let isMember: Bool
    let isArchived: Bool
    /// For DMs, the other user's ID.
    let userId: String?
    /// Number of members (may be 0 for DMs).
    let numMembers: Int
    
    /// Display name — uses resolved user name for DMs.
    var displayName: String {
        if isIM, let resolvedName = resolvedUserName, !resolvedName.isEmpty {
            return resolvedName
        }
        return name.isEmpty ? "Direct Message" : name
    }
    
    /// Resolved user name for DM conversations. Set externally after user lookup.
    var resolvedUserName: String?
    
    static func == (lhs: SlackConversation, rhs: SlackConversation) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Slack Message Model

/// A single Slack message.
struct SlackMessage: Identifiable, Equatable {
    let id: String        // "ts" value — unique per channel
    let userId: String?
    let text: String
    let timestamp: Date
    let subtype: String?
    
    /// Resolved user display name. Set after user lookup.
    var userName: String?
    
    static func == (lhs: SlackMessage, rhs: SlackMessage) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Slack Service

/// Slack client service: OAuth user-token flow, conversation listing, and message history.
///
/// Uses the Slack Web API:
/// - `POST /api/oauth.v2.access`            — exchange code for user token
/// - `GET  /api/auth.test`                   — verify token & get user/team info
/// - `GET  /api/conversations.list`          — list conversations (channels, DMs, etc.)
/// - `GET  /api/conversations.history`       — fetch messages from a conversation
/// - `GET  /api/users.info`                  — resolve user ID to display name
///
/// Reference: https://docs.slack.dev/apis/web-api/using-the-conversations-api
@Observable
final class SlackService {
    
    // MARK: - State
    
    /// The connected Slack account (single workspace).
    private(set) var account: SlackAccount?
    
    /// Whether a Slack account is connected.
    var isConnected: Bool { account != nil }
    
    var isAuthenticating = false
    var authError: String?
    
    /// All conversations the user is a member of, sorted by type.
    private(set) var conversations: [SlackConversation] = []
    
    /// Messages for the currently selected conversation.
    private(set) var messages: [SlackMessage] = []
    
    /// Currently selected conversation ID.
    var selectedConversationId: String? {
        didSet {
            if let id = selectedConversationId {
                Task { await fetchMessages(channelId: id) }
            }
        }
    }
    
    /// Whether conversations are being fetched.
    private(set) var isFetchingConversations = false
    
    /// Whether messages are being fetched.
    private(set) var isFetchingMessages = false
    
    // MARK: - Private
    
    /// Cache of user ID → display name to avoid repeated API calls.
    private var userNameCache: [String: String] = [:]
    
    // MARK: - Init
    
    init() {
        loadAccount()
    }
    
    // MARK: - Account Storage
    
    private func loadAccount() {
        if let data = UserDefaults.standard.data(forKey: Constants.Defaults.slackAccount),
           let decoded = try? JSONDecoder().decode(SlackAccount.self, from: data) {
            account = decoded
        }
    }
    
    private func saveAccount() {
        if let account, let data = try? JSONEncoder().encode(account) {
            UserDefaults.standard.set(data, forKey: Constants.Defaults.slackAccount)
        } else {
            UserDefaults.standard.removeObject(forKey: Constants.Defaults.slackAccount)
        }
    }
    
    // MARK: - OAuth Sign-In (Browser)
    
    /// Begin the Slack OAuth flow by opening the user's browser.
    ///
    /// The flow:
    /// 1. Open `https://slack.com/oauth/v2/authorize` with user_scope, client_id, redirect_uri
    /// 2. User approves in browser → Slack redirects to `https://firegrid.co/slack/callback?code=…`
    /// 3. The HTML page at that URL redirects to `tapmeeting://slack/callback?code=…`
    /// 4. macOS hands the URL to our app via `.onOpenURL`, which calls `handleOAuthCallback`
    ///
    /// Reference: https://docs.slack.dev/authentication/installing-with-oauth
    func signIn() {
        guard !Constants.Slack.clientID.isEmpty else {
            authError = "Slack is not configured. Please contact the developer."
            return
        }
        
        var components = URLComponents(string: Constants.Slack.authURL)!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: Constants.Slack.clientID),
            URLQueryItem(name: "user_scope", value: Constants.Slack.userScopes),
            URLQueryItem(name: "redirect_uri", value: Constants.Slack.redirectURI),
        ]
        
        guard let url = components.url else {
            authError = "Failed to build authorisation URL."
            return
        }
        
        isAuthenticating = true
        authError = nil
        NSWorkspace.shared.open(url)
    }
    
    // MARK: - OAuth Callback
    
    /// Handle the `tapmeeting://slack/callback?code=…` URL sent by the redirect page.
    ///
    /// Extracts the authorisation code and exchanges it for a user access token via
    /// `POST /api/oauth.v2.access`.
    ///
    /// Reference: https://docs.slack.dev/reference/methods/oauth.v2.access
    func handleOAuthCallback(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.host == "slack",
              components.path == "/callback" else { return }
        
        guard let code = components.queryItems?.first(where: { $0.name == "code" })?.value else {
            authError = "No authorisation code received."
            isAuthenticating = false
            return
        }
        
        Task { await exchangeCodeForToken(code: code) }
    }
    
    // MARK: - Token Exchange
    
    /// Exchange an authorisation code for a user access token.
    ///
    /// `POST https://slack.com/api/oauth.v2.access`
    /// Body (form-encoded): `client_id`, `client_secret`, `code`, `redirect_uri`
    ///
    /// On success the response contains `authed_user.access_token`, `team.id`, `team.name`.
    /// We then call `auth.test` to get the user name.
    ///
    /// Reference: https://docs.slack.dev/reference/methods/oauth.v2.access
    private func exchangeCodeForToken(code: String) async {
        let cid = Constants.Slack.clientID
        let secret = Constants.Slack.clientSecret
        
        guard !cid.isEmpty, !secret.isEmpty else {
            await MainActor.run {
                isAuthenticating = false
                authError = "Slack is not configured. Please contact the developer."
            }
            return
        }
        
        guard let url = URL(string: Constants.Slack.tokenURL) else {
            await MainActor.run {
                isAuthenticating = false
                authError = "Invalid token URL."
            }
            return
        }
        
        // Build form body
        let bodyParams = [
            "client_id=\(cid)",
            "client_secret=\(secret)",
            "code=\(code)",
            "redirect_uri=\(Constants.Slack.redirectURI)",
        ].joined(separator: "&")
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = bodyParams.data(using: .utf8)
        
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  json["ok"] as? Bool == true else {
                let errorMsg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String ?? "Token exchange failed"
                await MainActor.run {
                    isAuthenticating = false
                    authError = "OAuth error: \(errorMsg)"
                }
                print("[Slack] ✗ oauth.v2.access error: \(errorMsg)")
                return
            }
            
            // Extract the user access token from authed_user
            guard let authedUser = json["authed_user"] as? [String: Any],
                  let accessToken = authedUser["access_token"] as? String else {
                await MainActor.run {
                    isAuthenticating = false
                    authError = "No user access token in response."
                }
                return
            }
            
            let userId = authedUser["id"] as? String ?? ""
            
            // Get team info from the top-level response
            let team = json["team"] as? [String: Any]
            let teamId = team?["id"] as? String ?? ""
            let teamName = team?["name"] as? String ?? ""
            
            // Call auth.test to get the user's display name
            let userName = await fetchUserName(token: accessToken)
            
            let acct = SlackAccount(
                userId: userId,
                teamId: teamId,
                teamName: teamName,
                userName: userName,
                addedAt: .now
            )
            
            KeychainHelper.set(key: acct.accessTokenKey, value: accessToken)
            
            await MainActor.run {
                self.account = acct
                self.saveAccount()
                self.isAuthenticating = false
                self.authError = nil
            }
            
            print("[Slack] ✓ Connected: \(userName) @ \(teamName)")
            
            await fetchConversations()
            
        } catch {
            await MainActor.run {
                isAuthenticating = false
                authError = "Connection failed: \(error.localizedDescription)"
            }
            print("[Slack] ✗ oauth.v2.access failed: \(error)")
        }
    }
    
    // MARK: - auth.test
    
    /// Fetch the authenticated user's display name via `auth.test`.
    /// Reference: https://docs.slack.dev/reference/methods/auth.test
    private func fetchUserName(token: String) async -> String {
        guard let url = URL(string: "\(Constants.Slack.apiBase)/auth.test") else { return "" }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  json["ok"] as? Bool == true else { return "" }
            return json["user"] as? String ?? ""
        } catch {
            print("[Slack] auth.test error: \(error)")
            return ""
        }
    }
    
    /// Disconnect the Slack account and clear all stored data.
    func disconnect() {
        guard let acct = account else { return }
        
        KeychainHelper.delete(key: acct.accessTokenKey)
        account = nil
        conversations = []
        messages = []
        selectedConversationId = nil
        userNameCache = [:]
        saveAccount()
        
        print("[Slack] Disconnected: \(acct.userName) (\(acct.teamName))")
    }
    
    // MARK: - conversations.list
    
    /// Fetch all conversations the user is a member of.
    ///
    /// Uses `GET /api/conversations.list` with:
    /// - `types=public_channel,private_channel,mpim,im` to get all conversation types
    /// - `exclude_archived=true` to skip archived channels
    /// - Pagination via `cursor` and `limit`
    ///
    /// Reference: https://docs.slack.dev/reference/methods/conversations.list
    /// Reference: https://docs.slack.dev/apis/web-api/using-the-conversations-api
    func fetchConversations() async {
        guard let acct = account,
              let token = KeychainHelper.get(key: acct.accessTokenKey) else { return }
        
        await MainActor.run { isFetchingConversations = true }
        
        var allConversations: [SlackConversation] = []
        var cursor: String? = nil
        
        // Paginate through all conversations.
        // Per the API doc: include `next_cursor` from `response_metadata` as `cursor` param.
        repeat {
            var components = URLComponents(string: "\(Constants.Slack.apiBase)/conversations.list")!
            components.queryItems = [
                URLQueryItem(name: "types", value: "public_channel,private_channel,mpim,im"),
                URLQueryItem(name: "exclude_archived", value: "true"),
                URLQueryItem(name: "limit", value: "200"),
            ]
            
            if let cursor, !cursor.isEmpty {
                components.queryItems?.append(URLQueryItem(name: "cursor", value: cursor))
            }
            
            guard let url = components.url else { break }
            
            var request = URLRequest(url: url)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            
            do {
                let (data, response) = try await URLSession.shared.data(for: request)
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                
                guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    print("[Slack] conversations.list: invalid JSON (HTTP \(statusCode))")
                    break
                }
                
                guard json["ok"] as? Bool == true else {
                    let error = json["error"] as? String ?? "unknown"
                    let needed = json["needed"] as? String ?? ""
                    print("[Slack] conversations.list API error: \(error) (needed: \(needed)) — HTTP \(statusCode)")
                    print("[Slack] Full response: \(json)")
                    break
                }
                
                guard let channels = json["channels"] as? [[String: Any]] else {
                    print("[Slack] conversations.list: 'channels' key missing from response")
                    break
                }
                
                print("[Slack] conversations.list page: \(channels.count) channels")
                
                for channel in channels {
                    let conv = parseConversation(channel)
                    allConversations.append(conv)
                }
                
                // Check for next page cursor.
                // Per the API doc: `response_metadata.next_cursor`
                if let metadata = json["response_metadata"] as? [String: Any],
                   let nextCursor = metadata["next_cursor"] as? String,
                   !nextCursor.isEmpty {
                    cursor = nextCursor
                } else {
                    cursor = nil
                }
                
            } catch {
                print("[Slack] conversations.list error: \(error)")
                break
            }
        } while cursor != nil
        
        // Resolve DM user names
        var resolved = allConversations
        for i in resolved.indices where resolved[i].isIM {
            if let uid = resolved[i].userId {
                let name = await resolveUserName(userId: uid, token: token)
                resolved[i].resolvedUserName = name
            }
        }
        
        // Sort: DMs first, then channels alphabetically
        let sorted = resolved
            .filter { $0.isMember || $0.isIM || $0.isMPIM }
            .sorted { a, b in
                if a.isIM != b.isIM { return a.isIM }
                if a.isMPIM != b.isMPIM { return a.isMPIM }
                return a.displayName.localizedCaseInsensitiveCompare(b.displayName) == .orderedAscending
            }
        
        await MainActor.run {
            self.conversations = sorted
            self.isFetchingConversations = false
        }
        
        print("[Slack] Fetched \(sorted.count) conversations")
    }
    
    private func parseConversation(_ json: [String: Any]) -> SlackConversation {
        SlackConversation(
            id: json["id"] as? String ?? "",
            name: json["name"] as? String ?? "",
            isIM: json["is_im"] as? Bool ?? false,
            isMPIM: json["is_mpim"] as? Bool ?? false,
            isPrivate: json["is_private"] as? Bool ?? false,
            isChannel: json["is_channel"] as? Bool ?? false,
            isMember: json["is_member"] as? Bool ?? false,
            isArchived: json["is_archived"] as? Bool ?? false,
            userId: json["user"] as? String,
            numMembers: json["num_members"] as? Int ?? 0
        )
    }
    
    // MARK: - conversations.history
    
    /// Fetch message history for a specific conversation.
    ///
    /// Uses `GET /api/conversations.history` with:
    /// - `channel` (required) — the conversation ID
    /// - `limit` — max messages to return
    ///
    /// Reference: https://docs.slack.dev/reference/methods/conversations.history
    func fetchMessages(channelId: String) async {
        guard let acct = account,
              let token = KeychainHelper.get(key: acct.accessTokenKey) else { return }
        
        await MainActor.run { isFetchingMessages = true }
        
        var components = URLComponents(string: "\(Constants.Slack.apiBase)/conversations.history")!
        components.queryItems = [
            URLQueryItem(name: "channel", value: channelId),
            URLQueryItem(name: "limit", value: "50"),
        ]
        
        guard let url = components.url else {
            await MainActor.run { isFetchingMessages = false }
            return
        }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  json["ok"] as? Bool == true,
                  let rawMessages = json["messages"] as? [[String: Any]] else {
                await MainActor.run { isFetchingMessages = false }
                return
            }
            
            var parsed: [SlackMessage] = []
            
            for msg in rawMessages {
                let ts = msg["ts"] as? String ?? ""
                let userId = msg["user"] as? String
                let text = msg["text"] as? String ?? ""
                let subtype = msg["subtype"] as? String
                
                // Convert Slack timestamp (epoch.sequence) to Date
                let timestamp: Date
                if let epochSeconds = Double(ts.components(separatedBy: ".").first ?? ts) {
                    timestamp = Date(timeIntervalSince1970: epochSeconds)
                } else {
                    timestamp = .now
                }
                
                var message = SlackMessage(
                    id: ts,
                    userId: userId,
                    text: text,
                    timestamp: timestamp,
                    subtype: subtype
                )
                
                // Resolve user name
                if let uid = userId {
                    message.userName = await resolveUserName(userId: uid, token: token)
                }
                
                parsed.append(message)
            }
            
            // Messages come newest-first from the API, reverse for chronological order
            let chronological = parsed.reversed()
            
            await MainActor.run {
                self.messages = Array(chronological)
                self.isFetchingMessages = false
            }
            
            print("[Slack] Fetched \(parsed.count) messages for \(channelId)")
            
        } catch {
            print("[Slack] conversations.history error: \(error)")
            await MainActor.run { isFetchingMessages = false }
        }
    }
    
    // MARK: - users.info
    
    /// Resolve a Slack user ID to a display name.
    /// Uses `GET /api/users.info?user=USER_ID`.
    ///
    /// Reference: https://docs.slack.dev/reference/methods/users.info
    private func resolveUserName(userId: String, token: String) async -> String {
        // Return cached name if available
        if let cached = userNameCache[userId] {
            return cached
        }
        
        var components = URLComponents(string: "\(Constants.Slack.apiBase)/users.info")!
        components.queryItems = [
            URLQueryItem(name: "user", value: userId),
        ]
        
        guard let url = components.url else { return userId }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  json["ok"] as? Bool == true,
                  let user = json["user"] as? [String: Any] else {
                return userId
            }
            
            // Prefer display_name from profile, fall back to real_name, then name
            let profile = user["profile"] as? [String: Any]
            let displayName = profile?["display_name"] as? String
            let realName = user["real_name"] as? String
            let name = user["name"] as? String
            
            let resolved = [displayName, realName, name]
                .compactMap { $0 }
                .first { !$0.isEmpty } ?? userId
            
            userNameCache[userId] = resolved
            return resolved
            
        } catch {
            print("[Slack] users.info error for \(userId): \(error)")
            return userId
        }
    }
    
    // MARK: - Helpers
    
    /// Get the display name for the currently selected conversation.
    var selectedConversationName: String? {
        guard let id = selectedConversationId else { return nil }
        return conversations.first { $0.id == id }?.displayName
    }
    
    /// Grouped conversations for the sidebar — DMs and Channels separately.
    var directMessages: [SlackConversation] {
        conversations.filter { $0.isIM || $0.isMPIM }
    }
    
    var channels: [SlackConversation] {
        conversations.filter { !$0.isIM && !$0.isMPIM }
    }
}

// MARK: - Errors

enum SlackError: LocalizedError {
    case apiError(String)
    
    var errorDescription: String? {
        switch self {
        case .apiError(let message): return message
        }
    }
}
