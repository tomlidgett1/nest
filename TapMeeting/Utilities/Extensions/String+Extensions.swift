import Foundation

extension String {
    
    /// Truncate the string to a maximum number of characters, appending "…" if needed.
    func truncated(to maxLength: Int) -> String {
        if count <= maxLength { return self }
        return String(prefix(maxLength)) + "…"
    }
    
    /// Remove excessive whitespace and newlines.
    var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }
    
    /// Whether the string is empty or contains only whitespace.
    var isBlank: Bool {
        trimmed.isEmpty
    }
}
