import SwiftUI

/// Horizontal row of formatting buttons for the markdown editor.
/// Bold, Italic, Heading, Bullet, Checkbox, Code.
struct MarkdownFormattingToolbar: View {
    
    @Binding var text: String
    
    var body: some View {
        HStack(spacing: 2) {
            ToolbarButton(icon: "bold", tooltip: "Bold (⌘B)") {
                wrapSelection(with: "**")
            }
            
            ToolbarButton(icon: "italic", tooltip: "Italic (⌘I)") {
                wrapSelection(with: "*")
            }
            
            Divider()
                .frame(height: 16)
                .padding(.horizontal, 4)
            
            ToolbarButton(icon: "number", tooltip: "Heading (⌘⇧H)") {
                toggleLinePrefix("## ")
            }
            
            ToolbarButton(icon: "list.bullet", tooltip: "Bullet list") {
                toggleLinePrefix("- ")
            }
            
            ToolbarButton(icon: "checklist", tooltip: "Checkbox") {
                toggleLinePrefix("- [ ] ")
            }
            
            Divider()
                .frame(height: 16)
                .padding(.horizontal, 4)
            
            ToolbarButton(icon: "chevron.left.forwardslash.chevron.right", tooltip: "Inline code") {
                wrapSelection(with: "`")
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Theme.cardBackground)
        .cornerRadius(8)
        .shadow(color: .black.opacity(0.04), radius: 2, y: 1)
    }
    
    // MARK: - Text Manipulation
    
    /// Wrap selected text (or insert wrapper pair at cursor equivalent).
    private func wrapSelection(with wrapper: String) {
        // Since we don't have direct NSTextView access here,
        // append the wrapper syntax at the end as a quick-add.
        // Real wrapping is handled by keyboard shortcuts in MarkdownNSTextView.
        text += wrapper + wrapper
    }
    
    /// Toggle a line prefix (e.g. "## ", "- ").
    private func toggleLinePrefix(_ prefix: String) {
        let lines = text.components(separatedBy: "\n")
        guard let lastLine = lines.last else { return }
        
        if lastLine.hasPrefix(prefix) {
            // Remove prefix from last line
            var newLines = lines.dropLast()
            newLines.append(String(lastLine.dropFirst(prefix.count)))
            text = newLines.joined(separator: "\n")
        } else {
            // Add prefix to a new line if current line isn't empty, or to current line
            if lastLine.isEmpty {
                text += prefix
            } else {
                text += "\n" + prefix
            }
        }
    }
}

// MARK: - Toolbar Button

private struct ToolbarButton: View {
    let icon: String
    let tooltip: String
    let action: () -> Void
    
    @State private var isHovered = false
    
    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(isHovered ? Theme.textPrimary : Theme.textSecondary)
                .frame(width: 28, height: 28)
                .background(isHovered ? Theme.sidebarSelection : .clear)
                .cornerRadius(6)
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
        .help(tooltip)
    }
}
