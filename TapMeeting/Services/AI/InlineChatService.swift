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

/// Provides inline chat during a meeting or on a saved note via server-side proxy.
/// Maintains conversation history so follow-up questions work naturally.
final class InlineChatService {
    
    private let systemPrompt = """
    You are a helpful meeting assistant. The user asks quick questions about a meeting transcript. \
    Keep answers SHORT — 1-3 sentences max. Use bullet points only when listing multiple items. \
    Never repeat the question back. Never add filler or preamble. Get straight to the answer. \
    Use Australian English spelling.
    """
    
    /// Ask a question with full conversation history for context.
    func ask(question: String, transcriptContext: String, history: [ChatMessage] = []) async throws -> String {
        var inputMessages: [[String: String]] = []
        
        let contextMessage = """
        Transcript so far:
        \(transcriptContext)
        """
        inputMessages.append(["role": "user", "content": contextMessage])
        inputMessages.append(["role": "assistant", "content": "Got it — I've read the transcript. What would you like to know?"])
        
        for message in history {
            inputMessages.append(["role": message.role.rawValue, "content": message.content])
        }
        
        inputMessages.append(["role": "user", "content": question])
        
        let requestBody: [String: Any] = [
            "model": Constants.AI.enhancementModel,
            "instructions": systemPrompt,
            "input": inputMessages.map { $0 as Any },
            "store": false
        ]
        
        let data = try await AIProxyClient.shared.request(
            provider: .openai,
            endpoint: "/v1/responses",
            body: requestBody
        )
        
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
    
    // MARK: - Catch-Up (Anthropic / Claude Sonnet)
    
    private let catchUpSystemPrompt = """
    You are a concise meeting catch-up assistant. The user stepped away and wants a quick summary \
    of what was discussed in a specific time window of the meeting transcript. \
    Be articulate but brief — use 2-4 bullet points max. Each bullet should be one sentence. \
    Focus on decisions, key points, and action items. Skip filler and small talk. \
    Never repeat the question. Use Australian English spelling.
    """
    
    /// Summarise a time window of transcript using Claude Sonnet for fast, concise responses.
    func catchUp(transcriptSlice: String, windowLabel: String) async throws -> String {
        guard !transcriptSlice.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return "Nothing was said in the \(windowLabel)."
        }
        
        let userContent = """
        Here is the meeting transcript from the \(windowLabel):
        
        \(transcriptSlice)
        
        Summarise what I missed.
        """
        
        let body: [String: Any] = [
            "model": Constants.AI.anthropicSonnetModel,
            "max_tokens": Constants.AI.maxCatchUpTokens,
            "system": catchUpSystemPrompt,
            "messages": [
                ["role": "user", "content": userContent]
            ]
        ]
        
        let data = try await AIProxyClient.shared.request(
            provider: .anthropic,
            endpoint: "/v1/messages",
            body: body
        )
        
        let response = try JSONDecoder().decode(AnthropicResponse.self, from: data)
        
        guard let text = response.content.first(where: { $0.type == "text" })?.text?
            .trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
            return "Sorry, I couldn't generate a summary."
        }
        
        return text
    }
}
