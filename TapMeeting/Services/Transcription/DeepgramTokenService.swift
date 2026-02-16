import Foundation

/// Fetches a Deepgram API token from the server-side `deepgram-token` Edge Function.
///
/// The actual API key lives as an environment variable on the server.
/// The client authenticates with its Supabase JWT to obtain the token.
final class DeepgramTokenService {
    
    static let shared = DeepgramTokenService()
    
    /// Fetch a Deepgram token from the Edge Function.
    /// - Returns: The Deepgram API key string.
    func fetchToken() async throws -> String {
        guard let jwt = await SupabaseService.shared.supabaseAccessTokenForFunctionCall() else {
            throw AIProxyError.notAuthenticated
        }
        
        let url = URL(string: Constants.Supabase.deepgramTokenPath)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
        request.setValue(Constants.Supabase.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = "{}".data(using: .utf8)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        
        guard status == 200 else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw AIProxyError.apiError("Failed to fetch Deepgram token (HTTP \(status)): \(body)")
        }
        
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["token"] as? String,
              !token.isEmpty else {
            throw AIProxyError.apiError("Deepgram token response missing token field")
        }
        
        return token
    }
}
