import Foundation
import AppKit

/// Handles sharing notes — clipboard copy and (future) link generation.
final class ShareService {
    
    /// Copy note content as markdown to the clipboard.
    func copyAsMarkdown(note: Note) {
        let markdown = buildMarkdown(for: note)
        
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(markdown, forType: .string)
    }
    
    /// Generate a share link by posting to the backend.
    /// - Note: Backend integration pending; returns a placeholder for now.
    func generateShareLink(for note: Note) async throws -> String {
        // TODO: POST to backend API to create a shareable link.
        // POST /api/notes/share { noteId, title, content, transcript }
        // Returns { url: "https://tap.app/share/{id}" }
        
        // Placeholder: return a simulated share URL.
        let shareId = note.id.uuidString.prefix(8).lowercased()
        return "https://tap.app/share/\(shareId)"
    }
    
    // MARK: - Markdown Builder
    
    private func buildMarkdown(for note: Note) -> String {
        var sections: [String] = []
        
        // Title
        sections.append("# \(note.title)")
        sections.append("*\(note.formattedDate)*")
        
        // Enhanced notes (if available)
        if let enhanced = note.enhancedNotes, !enhanced.isEmpty {
            sections.append(enhanced)
        }
        
        // Raw notes
        if !note.rawNotes.isEmpty {
            sections.append("---")
            sections.append("## Raw Notes")
            sections.append(note.rawNotes)
        }
        
        // Transcript summary
        if !note.transcript.isEmpty {
            sections.append("---")
            sections.append("## Transcript")
            
            let transcriptLines = note.transcript.map { utterance in
                "**\(utterance.source.displayLabel):** \(utterance.text)"
            }
            sections.append(transcriptLines.joined(separator: "\n\n"))
        }
        
        return sections.joined(separator: "\n\n")
    }
}
