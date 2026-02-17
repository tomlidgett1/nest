import SwiftUI

/// Renders streaming markdown text with each new line fading in as it arrives.
///
/// Lines are visible immediately as the AI streams them. New lines get a smooth
/// fade+slide entrance. Uses `AttributedString(markdown:)` for bold/inline styles.
struct StreamingMarkdownView: View {
    
    let text: String
    let isStreaming: Bool
    
    /// Track how many lines we've already seen so we know which are "new".
    @State private var seenLineCount: Int = 0
    
    var body: some View {
        let lines = parseLines(text)
        
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                let isNew = index >= seenLineCount
                
                lineView(line, index: index, totalLines: lines.count)
                    .opacity(isNew && isStreaming ? 0 : 1)
                    .offset(y: isNew && isStreaming ? 4 : 0)
                    .animation(.easeOut(duration: 0.35), value: seenLineCount)
            }
        }
        .textSelection(.enabled)
        .onChange(of: lines.count) { _, newCount in
            // Mark lines as "seen" after a tiny delay so the animation triggers
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) {
                withAnimation(.easeOut(duration: 0.35)) {
                    seenLineCount = newCount
                }
            }
        }
        .onAppear {
            if !isStreaming {
                seenLineCount = lines.count
            }
        }
    }
    
    // MARK: - Line rendering
    
    @ViewBuilder
    private func lineView(_ line: ParsedLine, index: Int, totalLines: Int) -> some View {
        switch line {
        case .heading(let text):
            Text(text)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
                .padding(.top, index > 0 ? 6 : 0)
            
        case .bullet(let content):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("•")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textTertiary)
                
                inlineMarkdown(content)
                    .font(Theme.bodyFont(13))
                    .foregroundColor(Theme.textSecondary)
            }
            
        case .paragraph(let content):
            inlineMarkdown(content)
                .font(Theme.bodyFont(13))
                .foregroundColor(Theme.textPrimary)
        }
    }
    
    /// Renders inline markdown (**bold**, *italic*, etc.) via AttributedString.
    @ViewBuilder
    private func inlineMarkdown(_ content: String) -> some View {
        if let attributed = try? AttributedString(
            markdown: content,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        ) {
            Text(attributed)
        } else {
            Text(content)
        }
    }
    
    // MARK: - Parsing
    
    private enum ParsedLine {
        case heading(String)
        case bullet(String)
        case paragraph(String)
    }
    
    /// Split raw text into typed lines, skipping empties.
    private func parseLines(_ raw: String) -> [ParsedLine] {
        raw.components(separatedBy: "\n").compactMap { line in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty else { return nil }
            
            if trimmed.hasPrefix("### ") {
                return .heading(String(trimmed.dropFirst(4)))
            } else if trimmed.hasPrefix("## ") {
                return .heading(String(trimmed.dropFirst(3)))
            } else if trimmed.hasPrefix("- ") {
                return .bullet(String(trimmed.dropFirst(2)))
            } else if trimmed.hasPrefix("* ") {
                return .bullet(String(trimmed.dropFirst(2)))
            } else {
                return .paragraph(trimmed)
            }
        }
    }
}
