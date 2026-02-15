import Foundation
import SwiftData

/// Stores the user's extracted writing style profile from analysing sent emails.
///
/// Used to inject style context into AI email generation prompts so drafts
/// sound like the user, not a robot.
@Model
final class StyleProfile {
    var id: UUID
    var accountEmail: String
    var createdAt: Date
    var updatedAt: Date
    
    // MARK: - Extracted Patterns (stored as JSON-encoded strings)
    
    /// Common greeting patterns, e.g. ["Hey", "Hi", ""]
    var greetingsRaw: String
    
    /// Common sign-off patterns, e.g. ["Cheers,", "Thanks,"]
    var signOffsRaw: String
    
    /// How the user signs their name, e.g. "Ryan" vs "Ryan Smith"
    var signatureName: String
    
    /// Average sentence length in words.
    var averageSentenceLength: Int
    
    /// 0.0 (very casual) to 1.0 (very formal)
    var formalityScore: Float
    
    /// Whether the user typically uses contractions (don't, can't, etc.)
    var usesContractions: Bool
    
    /// Whether the user uses emoji in emails.
    var usesEmoji: Bool
    
    /// Whether the user prefers bullet points over paragraphs.
    var prefersBulletPoints: Bool
    
    /// Phrases the user commonly uses, e.g. ["happy to", "sounds good", "let me know"]
    var commonPhrasesRaw: String
    
    /// Phrases the user never uses / should be avoided.
    var avoidedPhrasesRaw: String
    
    /// Locale identifier, e.g. "en-AU"
    var locale: String
    
    /// Natural language summary of the user's writing style for prompt injection.
    var styleSummary: String
    
    /// 3-5 representative sent email excerpts (anonymised) for few-shot examples.
    var sampleExcerptsRaw: String
    
    /// Number of sent emails analysed to build this profile.
    var emailsAnalysed: Int
    
    // MARK: - Computed Accessors
    
    var greetings: [String] {
        get { (try? JSONDecoder().decode([String].self, from: Data(greetingsRaw.utf8))) ?? [] }
        set { greetingsRaw = (try? String(data: JSONEncoder().encode(newValue), encoding: .utf8)) ?? "[]" }
    }
    
    var signOffs: [String] {
        get { (try? JSONDecoder().decode([String].self, from: Data(signOffsRaw.utf8))) ?? [] }
        set { signOffsRaw = (try? String(data: JSONEncoder().encode(newValue), encoding: .utf8)) ?? "[]" }
    }
    
    var commonPhrases: [String] {
        get { (try? JSONDecoder().decode([String].self, from: Data(commonPhrasesRaw.utf8))) ?? [] }
        set { commonPhrasesRaw = (try? String(data: JSONEncoder().encode(newValue), encoding: .utf8)) ?? "[]" }
    }
    
    var avoidedPhrases: [String] {
        get { (try? JSONDecoder().decode([String].self, from: Data(avoidedPhrasesRaw.utf8))) ?? [] }
        set { avoidedPhrasesRaw = (try? String(data: JSONEncoder().encode(newValue), encoding: .utf8)) ?? "[]" }
    }
    
    var sampleExcerpts: [String] {
        get { (try? JSONDecoder().decode([String].self, from: Data(sampleExcerptsRaw.utf8))) ?? [] }
        set { sampleExcerptsRaw = (try? String(data: JSONEncoder().encode(newValue), encoding: .utf8)) ?? "[]" }
    }
    
    // MARK: - Init
    
    init(
        id: UUID = UUID(),
        accountEmail: String,
        createdAt: Date = .now,
        updatedAt: Date = .now,
        greetings: [String] = [],
        signOffs: [String] = [],
        signatureName: String = "",
        averageSentenceLength: Int = 12,
        formalityScore: Float = 0.5,
        usesContractions: Bool = true,
        usesEmoji: Bool = false,
        prefersBulletPoints: Bool = false,
        commonPhrases: [String] = [],
        avoidedPhrases: [String] = [],
        locale: String = "en-AU",
        styleSummary: String = "",
        sampleExcerpts: [String] = [],
        emailsAnalysed: Int = 0
    ) {
        self.id = id
        self.accountEmail = accountEmail
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.greetingsRaw = (try? String(data: JSONEncoder().encode(greetings), encoding: .utf8)) ?? "[]"
        self.signOffsRaw = (try? String(data: JSONEncoder().encode(signOffs), encoding: .utf8)) ?? "[]"
        self.signatureName = signatureName
        self.averageSentenceLength = averageSentenceLength
        self.formalityScore = formalityScore
        self.usesContractions = usesContractions
        self.usesEmoji = usesEmoji
        self.prefersBulletPoints = prefersBulletPoints
        self.commonPhrasesRaw = (try? String(data: JSONEncoder().encode(commonPhrases), encoding: .utf8)) ?? "[]"
        self.avoidedPhrasesRaw = (try? String(data: JSONEncoder().encode(avoidedPhrases), encoding: .utf8)) ?? "[]"
        self.locale = locale
        self.styleSummary = styleSummary
        self.sampleExcerptsRaw = (try? String(data: JSONEncoder().encode(sampleExcerpts), encoding: .utf8)) ?? "[]"
        self.emailsAnalysed = emailsAnalysed
    }
}
