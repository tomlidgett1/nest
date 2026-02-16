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

    /// Lightweight telemetry counters for Google token refresh health.
    private var googleRefreshAttempts = 0
    private var googleRefreshSuccesses = 0
    private var googleRefreshFailures = 0

    // MARK: - Shared Instance
    
    /// Global accessor so services like `AIProxyClient` can obtain the Supabase JWT
    /// without needing the SwiftUI environment. Set automatically during init.
    nonisolated(unsafe) static var shared: SupabaseService!
    
    // MARK: - Supabase Client

    let client: SupabaseClient

    // MARK: - Init

    override init() {
        self.client = SupabaseClient(
            supabaseURL: URL(string: Constants.Supabase.url)!,
            supabaseKey: Constants.Supabase.anonKey
        )

        super.init()
        Self.shared = self

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
                queryParams: Constants.Supabase.googleOAuthQueryParams,
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

        // Clear cached Google user tokens (NOT app credentials — those come from app_config)
        KeychainHelper.delete(key: Self.googleTokenKey)
        KeychainHelper.delete(key: Self.googleRefreshTokenKey)
        KeychainHelper.delete(key: Self.googleTokenExpiryKey)
        KeychainHelper.delete(key: Constants.Keychain.googleAccessToken)
        KeychainHelper.delete(key: Constants.Keychain.googleRefreshToken)

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

    /// Returns the Google OAuth access token if available.
    ///
    /// Priority:
    /// 1. Live Supabase session `providerToken` (set right after sign-in)
    /// 2. Keychain-cached token if not definitively expired
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

        // 2. Keychain-cached token — return it unless we *know* it's expired.
        //    If no expiry is stored (legacy cache), optimistically return the token
        //    and let the API reject it with 401 if it's actually expired.
        if let cached = KeychainHelper.get(key: Self.googleTokenKey), !cached.isEmpty {
            if !isGoogleTokenDefinitelyExpired() {
                return cached
            }
            print("[SupabaseService] Cached Google token is expired")
        }

        return nil
    }

    /// Obtain a fresh Google access token.
    ///
    /// Priority:
    /// 1. Supabase `refreshSession()` — sometimes returns a new provider token
    /// 2. Direct Google OAuth2 token refresh using the cached refresh token
    /// 3. Cached token as last resort (might still work; API will 401 if not)
    /// 4. `nil` — no way to obtain a valid token
    func refreshGoogleAccessToken() async -> String? {
        // 1. Try Supabase session refresh (updates Supabase auth state)
        do {
            let session = try await client.auth.refreshSession()
            await applySession(session)
            if let token = session.providerToken, !token.isEmpty {
                cacheGoogleTokens(from: session)
                logGoogleRefreshEvent("provider_token_from_session_refresh")
                return token
            }
        } catch {
            print("[SupabaseService] Supabase session refresh failed: \(error.localizedDescription)")
        }

        // 2. Refresh via server-side token broker (production path)
        if let token = await refreshGoogleTokenViaBrokerWithRetry() {
            return token
        }
        // 3. Use cached token only when it is not known-expired.
        if let cached = KeychainHelper.get(key: Self.googleTokenKey), !cached.isEmpty {
            if !isGoogleTokenDefinitelyExpired() {
                logGoogleRefreshEvent("cached_token_fallback")
                return cached
            }
            print("[SupabaseService] Skipping cached token fallback because token is expired")
        }

        logGoogleRefreshEvent("refresh_failed_no_token")
        return nil
    }

    // MARK: - Token Helpers

    /// Returns `true` only when we **know** the token is expired (stored expiry has passed).
    /// If no expiry is stored (legacy token), returns `false` — we optimistically try it
    /// and let the API reject with 401 if it's actually expired.
    private func isGoogleTokenDefinitelyExpired() -> Bool {
        guard let expiryString = KeychainHelper.get(key: Self.googleTokenExpiryKey),
              let expiry = Int(expiryString) else {
            // No expiry stored — don't assume expired; let the API decide
            return false
        }
        return Int(Date().timeIntervalSince1970) >= expiry
    }

    /// Returns the best currently valid Google token, refreshing if needed.
    func validGoogleAccessToken() async -> String? {
        if let token = await getGoogleAccessToken(), !token.isEmpty, !isGoogleTokenDefinitelyExpired() {
            return token
        }
        return await refreshGoogleAccessToken()
    }

    /// Refresh via Supabase Edge Function with bounded retries and exponential backoff.
    private func refreshGoogleTokenViaBrokerWithRetry() async -> String? {
        let maxAttempts = 3
        for attempt in 1...maxAttempts {
            googleRefreshAttempts += 1
            if let token = await refreshGoogleTokenViaBroker() {
                googleRefreshSuccesses += 1
                logGoogleRefreshEvent("broker_refresh_success_attempt_\(attempt)")
                return token
            }

            if attempt < maxAttempts {
                let backoffSeconds = pow(2.0, Double(attempt - 1)) * 0.5
                let jitterSeconds = Double(Int.random(in: 0...250)) / 1000.0
                try? await Task.sleep(nanoseconds: UInt64((backoffSeconds + jitterSeconds) * 1_000_000_000))
            }
        }
        googleRefreshFailures += 1
        logGoogleRefreshEvent("broker_refresh_failed")
        return nil
    }

    /// Request a fresh Google access token from the server-side broker.
    private func refreshGoogleTokenViaBroker() async -> String? {
        guard let functionURL = URL(string: Constants.Supabase.googleTokenBrokerPath) else {
            print("[SupabaseService] Invalid token broker URL")
            return nil
        }

        do {
            guard let supabaseJWT = await supabaseAccessTokenForFunctionCall() else {
                print("[SupabaseService] Cannot call token broker: no valid Supabase JWT")
                return nil
            }
            var request = URLRequest(url: functionURL)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(Constants.Supabase.anonKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(supabaseJWT)", forHTTPHeaderField: "Authorization")
            request.httpBody = "{}".data(using: .utf8)

            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard status == 200 else {
                let body = String(data: data, encoding: .utf8) ?? ""
                print("[SupabaseService] Broker refresh failed: HTTP \(status) — \(body)")
                return nil
            }

            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let accessToken = json["access_token"] as? String,
                  !accessToken.isEmpty else {
                print("[SupabaseService] Broker refresh response missing access_token")
                return nil
            }

            let expiresIn = json["expires_in"] as? Int ?? 3600
            cacheGoogleAccessToken(accessToken, expiresInSeconds: expiresIn)
            return accessToken
        } catch {
            print("[SupabaseService] Broker refresh error: \(error.localizedDescription)")
            return nil
        }
    }

    /// Returns a Supabase access token suitable for Edge Function auth.
    /// Uses the current token if still valid; only refreshes when expired or about to expire.
    func supabaseAccessTokenForFunctionCall() async -> String? {
        // 1. Try the current session first — avoids unnecessary refresh calls
        //    which can trigger Supabase Auth rate limits.
        do {
            let session = try await client.auth.session
            if !isJWTDefinitelyExpired(session.accessToken, leewaySeconds: 60) {
                return session.accessToken
            }
            print("[SupabaseService] Current JWT is expired or expiring soon, will refresh")
        } catch {
            print("[SupabaseService] No current session: \(error.localizedDescription)")
        }

        // 2. Session is expired or missing — try to refresh.
        do {
            let refreshed = try await client.auth.refreshSession()
            await applySession(refreshed)
            return refreshed.accessToken
        } catch {
            print("[SupabaseService] refreshSession failed: \(error.localizedDescription)")
        }

        // 3. Last resort: if refresh fails, check session one more time
        //    (the SDK may have refreshed internally).
        do {
            let session = try await client.auth.session
            if !isJWTDefinitelyExpired(session.accessToken, leewaySeconds: 10) {
                return session.accessToken
            }
            print("[SupabaseService] JWT still expired after refresh attempt")
            return nil
        } catch {
            print("[SupabaseService] No Supabase session available: \(error.localizedDescription)")
            return nil
        }
    }

    /// Best-effort JWT expiry check based on `exp` claim.
    private func isJWTDefinitelyExpired(_ jwt: String, leewaySeconds: Int = 0) -> Bool {
        let parts = jwt.split(separator: ".")
        guard parts.count >= 2 else { return true }
        var payload = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = payload.count % 4
        if remainder > 0 {
            payload += String(repeating: "=", count: 4 - remainder)
        }
        guard let data = Data(base64Encoded: payload),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let exp = json["exp"] as? TimeInterval else {
            return true
        }
        let now = Date().timeIntervalSince1970 + TimeInterval(leewaySeconds)
        return now >= exp
    }

    /// Cache an access token with pre-emptive refresh window and jitter.
    private func cacheGoogleAccessToken(_ token: String, expiresInSeconds: Int) {
        KeychainHelper.set(key: Self.googleTokenKey, value: token)

        // Refresh slightly before expiry with jitter to avoid refresh spikes at scale.
        let jitterSeconds = Int.random(in: 0...120)
        let safetyBuffer = 300 + jitterSeconds
        let effectiveTTL = max(60, expiresInSeconds - safetyBuffer)
        let expiryTimestamp = Int(Date().timeIntervalSince1970) + effectiveTTL
        KeychainHelper.set(key: Self.googleTokenExpiryKey, value: String(expiryTimestamp))
    }

    /// Persist provider tokens in Keychain so they survive session restores.
    private func cacheGoogleTokens(from session: Session) {
        if let token = session.providerToken, !token.isEmpty {
            cacheGoogleAccessToken(token, expiresInSeconds: 3600)
        }
        if let refresh = session.providerRefreshToken, !refresh.isEmpty {
            KeychainHelper.set(key: Self.googleRefreshTokenKey, value: refresh)
            Task { await persistGoogleRefreshToken(refresh, userId: session.user.id) }
        }
    }

    /// Persist the Google provider refresh token in Supabase for durable server-side refresh.
    private func persistGoogleRefreshToken(_ refreshToken: String, userId: UUID) async {
        guard !refreshToken.isEmpty else { return }
        do {
            try await client
                .from("google_oauth_tokens")
                .upsert(GoogleOAuthTokenRow(userID: userId, refreshToken: refreshToken), onConflict: "user_id")
                .execute()
            print("[SupabaseService] Persisted Google refresh token to Supabase")
        } catch {
            print("[SupabaseService] Failed to persist Google refresh token: \(error.localizedDescription)")
        }
    }

    private func logGoogleRefreshEvent(_ event: String) {
        print(
            "[SupabaseService] google_refresh_event=\(event) attempts=\(googleRefreshAttempts) successes=\(googleRefreshSuccesses) failures=\(googleRefreshFailures)"
        )
    }

    // MARK: - App Config

    /// Fetch shared app configuration from the `app_config` table.
    /// AI provider API keys are no longer stored here — they live as
    /// Edge Function environment variables on the server.
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

            // Sync non-AI config values to Keychain (e.g. Google client credentials).
            let aiKeys: Set<String> = ["openai_api_key", "anthropic_api_key", "deepgram_api_key"]
            for (key, value) in config where !value.isEmpty && !aiKeys.contains(key) {
                KeychainHelper.set(key: key, value: value)
            }

            // Clean up any legacy AI API keys from Keychain (they now live server-side only).
            for legacyKey in aiKeys {
                KeychainHelper.delete(key: legacyKey)
            }

            print("[SupabaseService] App config loaded: \(config.keys.sorted())")
        } catch {
            print("[SupabaseService] Failed to fetch app config: \(error.localizedDescription)")
        }
    }

    /// Convenience accessors for non-AI config values.
    var googleClientID: String? { appConfig["google_client_id"] }
    var googleClientSecret: String? { appConfig["google_client_secret"] }

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

private struct GoogleOAuthTokenRow: Encodable {
    let userID: UUID
    let refreshToken: String

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case refreshToken = "refresh_token"
    }
}

// AnyJSON from the Supabase SDK already provides .stringValue
