import Foundation

/// AI-powered tag suggestion service using GPT-4.1-mini.
/// Suggests 1–4 tags for a note, preferring to reuse existing tags.
final class AutoTaggingService {
    
    // MARK: - Networking
    
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        config.waitsForConnectivity = true
        return URLSession(configuration: config)
    }()
    
    private let maxRetries = 2
    
    /// System prompt for tag suggestion.
    private let systemPrompt = """
    You are a tagging assistant. Given note content and a list of existing tags, \
    suggest 1–4 tags that categorise the note. STRONGLY prefer reusing existing tags \
    when they fit. Only create new tags when none of the existing tags are relevant. \
    Tags should be short (1–3 words), lowercase, and descriptive. \
    Return ONLY a JSON array of strings, e.g. ["tag1", "tag2"]. No explanation.
    """
    
    /// System prompt for finding related notes.
    private let relatedNotesPrompt = """
    You are a notes assistant. Given the content of a note and a list of candidate notes \
    (each formatted as "UUID:::title — snippet"), return the UUIDs of the 1–5 most \
    related notes based on content similarity, shared topics, or context. \
    Return ONLY a JSON array of UUID strings, e.g. ["uuid1", "uuid2"]. No explanation. \
    If none are related, return an empty array [].
    """
    
    // MARK: - Tag Suggestion
    
    /// Suggest tags for a note's content.
    /// - Parameters:
    ///   - noteContent: The note text (truncated to 2000 chars internally).
    ///   - existingTags: Names of all existing tags to promote reuse.
    /// - Returns: Array of suggested tag names.
    func suggestTags(noteContent: String, existingTags: [String]) async throws -> [String] {
        let apiKey = KeychainHelper.get(key: Constants.Keychain.openAIAPIKey) ?? ""
        guard !apiKey.isEmpty else {
            throw EnhancementError.missingAPIKey
        }
        
        let trimmedContent = String(noteContent.prefix(2000))
        
        let userMessage = """
        Existing tags: \(existingTags.isEmpty ? "(none yet)" : existingTags.joined(separator: ", "))
        
        Note content:
        \(trimmedContent)
        """
        
        let requestBody: [String: Any] = [
            "model": Constants.AI.autoTaggingModel,
            "instructions": systemPrompt,
            "input": userMessage,
            "max_output_tokens": Constants.AI.maxTaggingTokens,
            "store": false
        ]
        
        let data = try await performRequest(apiKey: apiKey, body: requestBody)
        
        // Parse the JSON array response
        let response = try JSONDecoder().decode(SimpleResponse.self, from: data)
        guard let text = response.text?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else {
            return []
        }
        
        // Extract JSON array from response (handles cases where model adds extra text)
        guard let jsonData = extractJSONArray(from: text) else { return [] }
        let tags = try JSONDecoder().decode([String].self, from: jsonData)
        return Array(tags.prefix(4))
    }
    
    // MARK: - Related Notes
    
    /// Find notes related to the given content.
    func findRelatedNotes(content: String, candidates: [String]) async throws -> [String] {
        let apiKey = KeychainHelper.get(key: Constants.Keychain.openAIAPIKey) ?? ""
        guard !apiKey.isEmpty else {
            throw EnhancementError.missingAPIKey
        }
        
        let trimmedContent = String(content.prefix(1500))
        let candidateList = candidates.joined(separator: "\n")
        
        let userMessage = """
        Current note content:
        \(trimmedContent)
        
        Candidate notes:
        \(candidateList)
        """
        
        let requestBody: [String: Any] = [
            "model": Constants.AI.autoTaggingModel,
            "instructions": relatedNotesPrompt,
            "input": userMessage,
            "max_output_tokens": Constants.AI.maxTaggingTokens,
            "store": false
        ]
        
        let data = try await performRequest(apiKey: apiKey, body: requestBody)
        let response = try JSONDecoder().decode(SimpleResponse.self, from: data)
        guard let text = response.text?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else {
            return []
        }
        
        guard let jsonData = extractJSONArray(from: text) else { return [] }
        return (try? JSONDecoder().decode([String].self, from: jsonData)) ?? []
    }
    
    // MARK: - Private
    
    private func performRequest(apiKey: String, body: [String: Any]) async throws -> Data {
        let url = URL(string: Constants.AI.responsesEndpoint)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        var lastError: Error?
        
        for attempt in 0...maxRetries {
            do {
                let (data, response) = try await session.data(for: request)
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw EnhancementError.apiError("Invalid response from server")
                }
                
                if (400...499).contains(httpResponse.statusCode) {
                    let responseBody = String(data: data, encoding: .utf8) ?? ""
                    throw EnhancementError.apiError("Request rejected (\(httpResponse.statusCode)): \(responseBody)")
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
    
    /// Extract a JSON array from a string that may contain surrounding text.
    private func extractJSONArray(from text: String) -> Data? {
        guard let startIndex = text.firstIndex(of: "["),
              let endIndex = text.lastIndex(of: "]") else { return nil }
        let jsonString = String(text[startIndex...endIndex])
        return jsonString.data(using: .utf8)
    }
}

// MARK: - Response Types

private struct SimpleResponse: Decodable {
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
