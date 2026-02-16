import Foundation

/// AI-powered tag suggestion service using GPT-4.1-mini via server-side proxy.
/// Suggests 1–4 tags for a note, preferring to reuse existing tags.
final class AutoTaggingService {
    
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
    func suggestTags(noteContent: String, existingTags: [String]) async throws -> [String] {
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
        
        let data = try await AIProxyClient.shared.request(
            provider: .openai,
            endpoint: "/v1/responses",
            body: requestBody
        )
        
        let response = try JSONDecoder().decode(SimpleResponse.self, from: data)
        guard let text = response.text?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else {
            return []
        }
        
        guard let jsonData = extractJSONArray(from: text) else { return [] }
        let tags = try JSONDecoder().decode([String].self, from: jsonData)
        return Array(tags.prefix(4))
    }
    
    // MARK: - Related Notes
    
    /// Find notes related to the given content.
    func findRelatedNotes(content: String, candidates: [String]) async throws -> [String] {
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
        
        let data = try await AIProxyClient.shared.request(
            provider: .openai,
            endpoint: "/v1/responses",
            body: requestBody
        )
        
        let response = try JSONDecoder().decode(SimpleResponse.self, from: data)
        guard let text = response.text?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else {
            return []
        }
        
        guard let jsonData = extractJSONArray(from: text) else { return [] }
        return (try? JSONDecoder().decode([String].self, from: jsonData)) ?? []
    }
    
    // MARK: - Private
    
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
