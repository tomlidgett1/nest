import Foundation
import Supabase
import AuthenticationServices

/// Manages Supabase authentication (Google OAuth), session persistence,
/// and shared app configuration (API keys).
///
/// The Supabase Swift SDK automatically persists sessions in Keychain,
/// so users remain logged in across app restarts. Sign-out is explicit only.
///
/// Properties are non-isolated so they can be read from any context.
/// All state **mutations** are dispatched to the main actor so that
/// `@Observable` change notifications never fire off the main thread
/// (which would crash macOS menu-bar updates).
@Observable
final class SupabaseService: NSObject {

    // MARK: - Public State

    /// Whether the user is currently authenticated.
    private(set) var isAuthenticated = false

    /// The authenticated user's ID (matches `auth.uid()` in RLS policies).
    private(set) var currentUserId: UUID?

    /// The authenticated user's email.
    private(set) var currentUserEmail: String?

    /// The authenticated user's display name.
    private(set) var currentUserDisplayName: String?

    /// The authenticated user's avatar URL.
    private(set) var currentUserAvatarURL: String?

    /// Whether a sign-in is currently in progress.
    var isSigningIn = false

    /// Error message from the most recent auth attempt.
    var authError: String?

    /// Shared API keys fetched from the `app_config` table.
    private(set) var appConfig: [String: String] = [:]

    // MARK: - Supabase Client

    let client: SupabaseClient

    // MARK: - Init

    override init() {
        self.client = SupabaseClient(
            supabaseURL: URL(string: Constants.Supabase.url)!,
            supabaseKey: Constants.Supabase.anonKey
        )

        super.init()

        // Check for existing session on launch
        Task { await restoreSession() }
    }

    // MARK: - Session Restore

    /// Attempt to restore a persisted session from Keychain.
    /// Called on app launch — if a valid session exists, the user stays logged in.
    private func restoreSession() async {
        do {
            let session = try await client.auth.session
            await applySession(session)
            await fetchAppConfig()
            print("[SupabaseService] Session restored for \(session.user.email ?? "unknown")")
        } catch {
            print("[SupabaseService] No existing session: \(error.localizedDescription)")
            await MainActor.run { isAuthenticated = false }
        }
    }

    // MARK: - Google Sign-In

    /// Start Google OAuth sign-in via ASWebAuthenticationSession.
    /// Opens a browser for Google consent, then returns to the app via deep link.
    @MainActor
    func signInWithGoogle() async {
        isSigningIn = true
        authError = nil

        do {
            let session = try await client.auth.signInWithOAuth(
                provider: .google,
                redirectTo: URL(string: Constants.Supabase.redirectURL),
                scopes: Constants.Supabase.googleScopes,
                launchFlow: { url in
                    try await self.openOAuthURL(url)
                }
            )

            applySession(session)
            cacheGoogleTokens(from: session)
            await fetchAppConfig()
            print("[SupabaseService] Google sign-in successful: \(session.user.email ?? "unknown")")
        } catch {
            authError = error.localizedDescription
            print("[SupabaseService] Google sign-in failed: \(error.localizedDescription)")
        }

        isSigningIn = false
    }

    /// Handle the OAuth callback URL (nest://auth/callback?...).
    /// Called from `onOpenURL` in the app entry point.
    func handleOAuthCallback(_ url: URL) async {
        do {
            let session = try await client.auth.session(from: url)
            await applySession(session)
            cacheGoogleTokens(from: session)
            await fetchAppConfig()
            print("[SupabaseService] OAuth callback handled successfully")
        } catch {
            await MainActor.run { authError = error.localizedDescription }
            print("[SupabaseService] OAuth callback failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Sign Out

    /// Explicitly sign out. Clears the persisted session.
    func signOut() async {
        do {
            try await client.auth.signOut()
        } catch {
            print("[SupabaseService] Sign out error: \(error.localizedDescription)")
        }

        // Clear cached Google tokens
        KeychainHelper.delete(key: Self.googleTokenKey)
        KeychainHelper.delete(key: Self.googleRefreshTokenKey)
        KeychainHelper.delete(key: Self.googleTokenExpiryKey)

        await MainActor.run {
            isAuthenticated = false
            currentUserId = nil
            currentUserEmail = nil
            currentUserDisplayName = nil
            currentUserAvatarURL = nil
            appConfig = [:]
        }

        print("[SupabaseService] Signed out")
    }

    // MARK: - Google Provider Token

    /// Keychain keys for caching Google OAuth tokens across session restores.
    private static let googleTokenKey = "google_provider_token"
    private static let googleRefreshTokenKey = "google_provider_refresh_token"
    /// Stores the Unix timestamp (seconds) when the cached Google token expires.
    private static let googleTokenExpiryKey = "google_provider_token_expiry"

    /// Returns the Google OAuth access token if it is still valid.
    ///
    /// Priority:
    /// 1. Live Supabase session `providerToken` (set right after sign-in)
    /// 2. Keychain-cached token **only** if it hasn't expired
    /// 3. `nil` — caller should invoke `refreshGoogleAccessToken()`.
    func getGoogleAccessToken() async -> String? {
        // 1. Try the live session (available right after sign-in / OAuth callback)
        do {
            let session = try await client.auth.session
            if let token = session.providerToken, !token.isEmpty {
                cacheGoogleTokens(from: session)
                return token
            }
        } catch {
            print("[SupabaseService] Failed to get session: \(error.localizedDescription)")
        }

        // 2. Keychain-cached token — only return if not expired
        if let cached = KeychainHelper.get(key: Self.googleTokenKey), !cached.isEmpty,
           !isGoogleTokenExpired() {
            return cached
        }

        // Expired or missing — caller must refresh
        return nil
    }

    /// Obtain a fresh Google access token.
    ///
    /// Priority:
    /// 1. Supabase `refreshSession()` — sometimes returns a new provider token
    /// 2. Direct Google OAuth2 token refresh using the cached refresh token
    /// 3. `nil` — no way to obtain a valid token
    func refreshGoogleAccessToken() async -> String? {
        // 1. Try Supabase session refresh (occasionally returns a provider token)
        do {
            let session = try await client.auth.refreshSession()
            await applySession(session)
            if let token = session.providerToken, !token.isEmpty {
                cacheGoogleTokens(from: session)
                print("[SupabaseService] Got Google token from Supabase session refresh")
                return token
            }
        } catch {
            print("[SupabaseService] Supabase session refresh failed: \(error.localizedDescription)")
        }

        // 2. Direct Google token refresh using the stored refresh token
        if let token = await refreshGoogleTokenDirectly() {
            return token
        }

        print("[SupabaseService] Unable to refresh Google access token")
        return nil
    }

    // MARK: - Direct Google Token Refresh

    /// Refresh the Google access token by POSTing the refresh token directly
    /// to Google's OAuth2 endpoint. This is needed because Supabase's
    /// `refreshSession()` only refreshes the Supabase JWT, not the Google token.
    ///
    /// Requires `google_client_id` (and optionally `google_client_secret`) in
    /// Keychain — these can come from the `app_config` table or user preferences.
    private func refreshGoogleTokenDirectly() async -> String? {
        guard let refreshToken = KeychainHelper.get(key: Self.googleRefreshTokenKey),
              !refreshToken.isEmpty else {
            print("[SupabaseService] No Google refresh token available")
            return nil
        }

        guard let clientId = KeychainHelper.get(key: "google_client_id"),
              !clientId.isEmpty else {
            print("[SupabaseService] No Google client ID — cannot refresh directly")
            return nil
        }

        let clientSecret = KeychainHelper.get(key: "google_client_secret") ?? ""

        // Build the token request
        let params: [(String, String)] = [
            ("client_id", clientId),
            ("client_secret", clientSecret),
            ("refresh_token", refreshToken),
            ("grant_type", "refresh_token")
        ]
        let bodyString = params
            .map { "\($0.0)=\($0.1.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0.1)" }
            .joined(separator: "&")

        guard let url = URL(string: "https://oauth2.googleapis.com/token") else { return nil }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = bodyString.data(using: .utf8)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0

            guard status == 200 else {
                let body = String(data: data, encoding: .utf8) ?? ""
                print("[SupabaseService] Direct Google refresh failed: HTTP \(status) — \(body)")
                return nil
            }

            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let accessToken = json["access_token"] as? String,
                  !accessToken.isEmpty else {
                print("[SupabaseService] Direct Google refresh: unexpected response format")
                return nil
            }

            // Cache the new token + expiry
            let expiresIn = json["expires_in"] as? Int ?? 3600
            KeychainHelper.set(key: Self.googleTokenKey, value: accessToken)
            let expiryTimestamp = Int(Date().timeIntervalSince1970) + expiresIn - 60 // 60s safety margin
            KeychainHelper.set(key: Self.googleTokenExpiryKey, value: String(expiryTimestamp))

            print("[SupabaseService] Refreshed Google token directly (expires in \(expiresIn)s)")
            return accessToken
        } catch {
            print("[SupabaseService] Direct Google refresh error: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Token Helpers

    /// Whether the cached Google access token has expired (or expiry is unknown).
    private func isGoogleTokenExpired() -> Bool {
        guard let expiryString = KeychainHelper.get(key: Self.googleTokenExpiryKey),
              let expiry = Int(expiryString) else {
            // No expiry stored — treat as expired so we refresh
            return true
        }
        return Int(Date().timeIntervalSince1970) >= expiry
    }

    /// Persist provider tokens in Keychain so they survive session restores.
    private func cacheGoogleTokens(from session: Session) {
        if let token = session.providerToken, !token.isEmpty {
            KeychainHelper.set(key: Self.googleTokenKey, value: token)
            // Google access tokens are valid for 3600s; store expiry with 60s safety margin
            let expiryTimestamp = Int(Date().timeIntervalSince1970) + 3540
            KeychainHelper.set(key: Self.googleTokenExpiryKey, value: String(expiryTimestamp))
        }
        if let refresh = session.providerRefreshToken, !refresh.isEmpty {
            KeychainHelper.set(key: Self.googleRefreshTokenKey, value: refresh)
        }
    }

    // MARK: - App Config

    /// Fetch shared API keys from the `app_config` table.
    func fetchAppConfig() async {
        do {
            let rows: [AppConfigRow] = try await client
                .from("app_config")
                .select()
                .execute()
                .value

            var config: [String: String] = [:]
            for row in rows {
                config[row.key] = row.value
            }

            await MainActor.run { appConfig = config }

            // Cache API keys in Keychain so existing services (DeepgramService,
            // NoteEnhancementService, etc.) work without modification.
            for (key, value) in config where !value.isEmpty {
                KeychainHelper.set(key: key, value: value)
            }

            print("[SupabaseService] App config loaded: \(config.keys.sorted())")
        } catch {
            print("[SupabaseService] Failed to fetch app config: \(error.localizedDescription)")
        }
    }

    /// Convenience accessors for API keys.
    var deepgramAPIKey: String? { appConfig["deepgram_api_key"] }
    var openAIAPIKey: String? { appConfig["openai_api_key"] }
    var anthropicAPIKey: String? { appConfig["anthropic_api_key"] }

    // MARK: - Private

    @MainActor
    private func applySession(_ session: Session) {
        isAuthenticated = true
        currentUserId = session.user.id
        currentUserEmail = session.user.email
        currentUserDisplayName = session.user.userMetadata["full_name"]?.stringValue
        currentUserAvatarURL = session.user.userMetadata["avatar_url"]?.stringValue
    }

    /// Opens the OAuth URL using ASWebAuthenticationSession for macOS.
    @MainActor
    private func openOAuthURL(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: Constants.Supabase.redirectScheme
            ) { callbackURL, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else {
                    continuation.resume(throwing: URLError(.badServerResponse))
                }
            }

            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            session.start()
        }
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension SupabaseService: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApplication.shared.keyWindow ?? ASPresentationAnchor()
    }
}

// MARK: - App Config Row

private struct AppConfigRow: Decodable {
    let key: String
    let value: String
}

// AnyJSON from the Supabase SDK already provides .stringValue
