import Foundation

/// AI provider that the server-side proxy routes to.
enum AIProvider: String {
    case openai
    case anthropic
}

/// Shared networking client that routes all AI API calls through the
/// Supabase Edge Function `ai-proxy`, which holds the API keys server-side.
///
/// The client authenticates using the Supabase JWT — no AI provider
/// API keys ever exist on the device.
final class AIProxyClient {
    
    static let shared = AIProxyClient()
    
    // MARK: - Networking
    
    /// Session with generous timeouts for AI calls (long transcripts / large payloads).
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 300
        config.waitsForConnectivity = true
        return URLSession(configuration: config)
    }()
    
    /// Maximum number of automatic retries for transient errors.
    private let maxRetries = 2
    
    // MARK: - Standard Request
    
    /// Send a request through the AI proxy and return the raw response data
    /// from the upstream AI provider.
    ///
    /// - Parameters:
    ///   - provider: Which AI provider to route to (.openai or .anthropic).
    ///   - endpoint: The provider-relative endpoint path (e.g. "/v1/responses").
    ///   - body: The request body as a JSON-serialisable dictionary.
    /// - Returns: Raw response `Data` from the upstream provider.
    func request(
        provider: AIProvider,
        endpoint: String,
        body: [String: Any]
    ) async throws -> Data {
        let request = try await buildProxyRequest(
            provider: provider,
            endpoint: endpoint,
            body: body,
            stream: false
        )
        return try await performRequest(request)
    }
    
    // MARK: - Streaming Request
    
    /// Send a streaming request through the AI proxy and return raw
    /// async bytes for SSE consumption.
    ///
    /// - Parameters:
    ///   - provider: Which AI provider to route to.
    ///   - endpoint: The provider-relative endpoint path.
    ///   - body: The request body as a JSON-serialisable dictionary.
    /// - Returns: A tuple of `(AsyncBytes, HTTPURLResponse)` for streaming.
    func stream(
        provider: AIProvider,
        endpoint: String,
        body: [String: Any]
    ) async throws -> (URLSession.AsyncBytes, HTTPURLResponse) {
        let request = try await buildProxyRequest(
            provider: provider,
            endpoint: endpoint,
            body: body,
            stream: true
        )
        
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AIProxyError.apiError("Invalid response from proxy")
        }
        print("[AIProxyClient] Stream response: HTTP \(http.statusCode)")
        if http.statusCode == 502 {
            throw AIProxyError.apiError("AI provider error during streaming")
        }
        guard (200...299).contains(http.statusCode) else {
            throw AIProxyError.apiError("Proxy returned HTTP \(http.statusCode)")
        }
        return (bytes, http)
    }
    
    // MARK: - Private Helpers
    
    /// Build the proxy request with JWT authentication.
    private func buildProxyRequest(
        provider: AIProvider,
        endpoint: String,
        body: [String: Any],
        stream: Bool
    ) async throws -> URLRequest {
        guard let service = SupabaseService.shared else {
            print("[AIProxyClient] SupabaseService.shared is nil — has the app finished initialising?")
            throw AIProxyError.notAuthenticated
        }
        
        print("[AIProxyClient] Requesting JWT for \(provider.rawValue) → \(endpoint)")
        guard let jwt = await service.supabaseAccessTokenForFunctionCall() else {
            print("[AIProxyClient] No JWT available — user may not be signed in")
            throw AIProxyError.notAuthenticated
        }
        print("[AIProxyClient] Got JWT, building proxy request")
        
        let url = URL(string: Constants.Supabase.aiProxyPath)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
        request.setValue(Constants.Supabase.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let wrapper: [String: Any] = [
            "provider": provider.rawValue,
            "endpoint": endpoint,
            "body": body,
            "stream": stream
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: wrapper)
        return request
    }
    
    /// Execute a request with automatic retry for transient network failures.
    private func performRequest(_ request: URLRequest) async throws -> Data {
        var lastError: Error?
        
        for attempt in 0...maxRetries {
            do {
                let (data, response) = try await session.data(for: request)
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw AIProxyError.apiError("Invalid response from server")
                }
                
                let statusCode = httpResponse.statusCode
                print("[AIProxyClient] Response: HTTP \(statusCode) (\(data.count) bytes)")
                
                if statusCode == 401 {
                    throw AIProxyError.notAuthenticated
                }
                
                if statusCode == 502 {
                    // 502 = upstream AI provider error (not our auth).
                    // Parse the wrapped error from the Edge Function.
                    let body = String(data: data, encoding: .utf8) ?? ""
                    print("[AIProxyClient] Upstream error: \(body.prefix(500))")
                    throw AIProxyError.apiError("AI provider error: \(body.prefix(500))")
                }
                
                if (400...499).contains(statusCode) {
                    let body = String(data: data, encoding: .utf8) ?? ""
                    print("[AIProxyClient] Client error: \(body.prefix(500))")
                    throw AIProxyError.apiError("Request rejected (\(statusCode)): \(body.prefix(300))")
                }
                
                guard (200...299).contains(statusCode) else {
                    let body = String(data: data, encoding: .utf8) ?? ""
                    print("[AIProxyClient] Server error: \(body.prefix(500))")
                    throw AIProxyError.apiError("Server error (\(statusCode))")
                }
                
                return data
                
            } catch let error as AIProxyError {
                throw error
            } catch {
                lastError = error
                print("[AIProxyClient] Network error (attempt \(attempt + 1)/\(maxRetries + 1)): \(error.localizedDescription)")
                if attempt < maxRetries {
                    let delay = UInt64(pow(2.0, Double(attempt))) * 1_000_000_000
                    try await Task.sleep(nanoseconds: delay)
                }
            }
        }
        
        throw AIProxyError.networkError(lastError)
    }
}

// MARK: - Errors

enum AIProxyError: LocalizedError {
    case notAuthenticated
    case apiError(String)
    case emptyResponse
    case networkError(Error?)
    
    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "You must be signed in to use AI features. Please sign in and try again."
        case .apiError(let message):
            return "AI request failed: \(message)"
        case .emptyResponse:
            return "AI returned an empty response."
        case .networkError(let underlying):
            let detail = underlying?.localizedDescription ?? "Unknown error"
            return "Network connection failed. Please check your internet connection and try again. (\(detail))"
        }
    }
}
