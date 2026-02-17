import Foundation

enum SearchSourceType: String, Codable, CaseIterable, Identifiable {
    case noteSummary = "note_summary"
    case noteChunk = "note_chunk"
    case utteranceChunk = "utterance_chunk"
    case emailSummary = "email_summary"
    case emailChunk = "email_chunk"
    case calendarSummary = "calendar_summary"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .noteSummary: return "Notes"
        case .noteChunk: return "Note Snippets"
        case .utteranceChunk: return "Transcript"
        case .emailSummary: return "Email Summaries"
        case .emailChunk: return "Email Snippets"
        case .calendarSummary: return "Calendar"
        }
    }
}

struct SearchDocumentCandidate: Identifiable, Codable {
    let id: UUID
    let sourceType: SearchSourceType
    let sourceId: String
    let title: String?
    let summaryText: String?
    let chunkText: String?
    let metadata: [String: String]
    let semanticScore: Double
    let lexicalScore: Double
    let fusedScore: Double
}

struct SemanticCitation: Identifiable, Hashable {
    let id = UUID()
    let sourceType: SearchSourceType
    let sourceId: String
    let title: String
    let snippet: String
}

struct SemanticSearchResponse {
    let query: String
    let results: [SearchDocumentCandidate]
    let citations: [SemanticCitation]
    var embeddingLatencyMs: Int = 0
    var searchLatencyMs: Int = 0
}

enum SemanticIntent: String {
    case answerQuestion
    case draftEmail
    case createFollowUp
}

struct SemanticChatResponse {
    let answer: String
    let citations: [SemanticCitation]
    let didRefuse: Bool
}

struct SemanticChatMessage: Identifiable, Hashable {
    enum Role: String {
        case user
        case assistant
    }

    let id = UUID()
    let role: Role
    var content: String
    var citations: [SemanticCitation]
    var isStreaming: Bool
    let createdAt: Date

    init(role: Role, content: String, citations: [SemanticCitation] = [], isStreaming: Bool = false, createdAt: Date = .now) {
        self.role = role
        self.content = content
        self.citations = citations
        self.isStreaming = isStreaming
        self.createdAt = createdAt
    }
}

struct SearchBackfillStatus {
    enum Stage: String {
        case idle
        case indexing
        case completed
        case failed
    }

    var stage: Stage
    var progressPercent: Double
    var processedCount: Int
    var totalCount: Int
    var lastError: String?

    static let idle = SearchBackfillStatus(stage: .idle, progressPercent: 0, processedCount: 0, totalCount: 0, lastError: nil)
}
