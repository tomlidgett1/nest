import Foundation

/// A single turn in a chat conversation.
struct ChatMessage: Identifiable {
    let id = UUID()
    let role: Role
    let content: String
    
    enum Role: String {
        case user
        case assistant
    }
}

/// Provides inline chat during a meeting or on a saved note.
/// Maintains conversation history so follow-up questions work naturally.
final class InlineChatService {
    
    /// Configured session with sensible timeouts.
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 120
        config.waitsForConnectivity = true
        return URLSession(configuration: config)
    }()
    
    private let maxRetries = 2
    
    private let systemPrompt = """
    You are a helpful meeting assistant. The user asks quick questions about a meeting transcript. \
    Keep answers SHORT — 1-3 sentences max. Use bullet points only when listing multiple items. \
    Never repeat the question back. Never add filler or preamble. Get straight to the answer. \
    Use Australian English spelling.
    """
    
    /// Ask a question with full conversation history for context.
    /// - Parameters:
    ///   - question: The user's new question.
    ///   - transcriptContext: The meeting transcript text.
    ///   - history: Previous conversation turns to maintain context.
    /// - Returns: The assistant's response text.
    func ask(question: String, transcriptContext: String, history: [ChatMessage] = []) async throws -> String {
        let apiKey = KeychainHelper.get(key: Constants.Keychain.openAIAPIKey) ?? ""
        guard !apiKey.isEmpty else {
            throw EnhancementError.missingAPIKey
        }
        
        // Build the input as a message array so the model sees prior turns.
        var inputMessages: [[String: String]] = []
        
        // First message establishes the transcript context.
        let contextMessage = """
        Transcript so far:
        \(transcriptContext)
        """
        inputMessages.append(["role": "user", "content": contextMessage])
        inputMessages.append(["role": "assistant", "content": "Got it — I've read the transcript. What would you like to know?"])
        
        // Append prior conversation turns.
        for message in history {
            inputMessages.append(["role": message.role.rawValue, "content": message.content])
        }
        
        // Append the new question.
        inputMessages.append(["role": "user", "content": question])
        
        let requestBody: [String: Any] = [
            "model": Constants.AI.enhancementModel,
            "instructions": systemPrompt,
            "input": inputMessages,
            "store": false
        ]
        
        let url = URL(string: Constants.AI.responsesEndpoint)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
        
        let data = try await performRequest(request)
        
        struct SimpleResponse: Decodable {
            let output: [OutputItem]
            struct OutputItem: Decodable {
                let content: [ContentItem]?
                struct ContentItem: Decodable {
                    let text: String?
                }
            }
            
            var text: String? {
                output.compactMap { $0.content?.compactMap { $0.text }.joined() }.joined()
            }
        }
        
        let response = try JSONDecoder().decode(SimpleResponse.self, from: data)
        return response.text ?? "Sorry, I couldn't generate a response."
    }
    
    // MARK: - Private Helpers
    
    /// Execute a request with automatic retry for transient network failures.
    private func performRequest(_ request: URLRequest) async throws -> Data {
        var lastError: Error?
        
        for attempt in 0...maxRetries {
            do {
                let (data, response) = try await session.data(for: request)
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw EnhancementError.apiError("Invalid response from server")
                }
                
                if (400...499).contains(httpResponse.statusCode) {
                    let body = String(data: data, encoding: .utf8) ?? ""
                    throw EnhancementError.apiError("Request rejected (\(httpResponse.statusCode)): \(body)")
                }
                
                guard (200...299).contains(httpResponse.statusCode) else {
                    throw EnhancementError.apiError("Server error (\(httpResponse.statusCode))")
                }
                
                return data
                
            } catch let error as EnhancementError {
                throw error
            } catch {
                lastError = error
                if attempt < maxRetries {
                    let delay = UInt64(pow(2.0, Double(attempt))) * 1_000_000_000
                    try await Task.sleep(nanoseconds: delay)
                }
            }
        }
        
        throw EnhancementError.networkError(lastError)
    }
}
