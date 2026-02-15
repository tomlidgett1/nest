import Foundation
import SwiftData

/// A saved instruction rule that triggers when emailing specific contacts or domains.
///
/// Examples:
/// - `@bigcorp.com` → "Be formal. Use full sentences."
/// - `john@example.com` → "John prefers bullet points. Keep it brief."
@Model
final class ContactRule {
    var id: UUID
    
    /// Whether this rule matches by full email address or domain.
    var matchTypeRaw: String
    
    /// The value to match against — an email address or domain (e.g. "bigcorp.com").
    var matchValue: String
    
    /// Optional display name for the contact or domain.
    var displayName: String?
    
    /// The instruction text applied when this rule matches.
    var instructions: String
    
    var createdAt: Date
    
    // MARK: - Match Type
    
    enum MatchType: String, Codable, CaseIterable {
        case email
        case domain
    }
    
    var matchType: MatchType {
        get { MatchType(rawValue: matchTypeRaw) ?? .email }
        set { matchTypeRaw = newValue.rawValue }
    }
    
    // MARK: - Init
    
    init(
        id: UUID = UUID(),
        matchType: MatchType = .email,
        matchValue: String,
        displayName: String? = nil,
        instructions: String,
        createdAt: Date = .now
    ) {
        self.id = id
        self.matchTypeRaw = matchType.rawValue
        self.matchValue = matchValue
        self.displayName = displayName
        self.instructions = instructions
        self.createdAt = createdAt
    }
    
    // MARK: - Matching
    
    /// Check if this rule applies to a given email address.
    func matches(email: String) -> Bool {
        let emailLower = email.lowercased()
        switch matchType {
        case .email:
            return emailLower == matchValue.lowercased()
        case .domain:
            let domain = matchValue.lowercased().replacingOccurrences(of: "@", with: "")
            return emailLower.hasSuffix("@\(domain)")
        }
    }
    
    /// Display label for the rule in UI.
    var displayLabel: String {
        if let name = displayName, !name.isEmpty {
            return name
        }
        switch matchType {
        case .email: return matchValue
        case .domain: return "@\(matchValue)"
        }
    }
}
