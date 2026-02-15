import SwiftUI
import AppKit

/// NSViewRepresentable wrapping NSTextView for WYSIWYG markdown editing.
/// Stores plain markdown text, renders with NSAttributedString styling.
/// Live syntax-to-styling: **bold**, *italic*, ## headings, - bullets, `code`.
struct MarkdownTextEditor: NSViewRepresentable {
    
    @Binding var text: String
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = false
        scrollView.hasHorizontalScroller = false
        scrollView.scrollerStyle = .overlay
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        
        let textView = MarkdownNSTextView()
        textView.delegate = context.coordinator
        textView.isEditable = true
        textView.isSelectable = true
        textView.isRichText = false
        textView.allowsUndo = true
        textView.drawsBackground = false
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.textContainerInset = NSSize(width: 4, height: 8)
        textView.autoresizingMask = [.width]
        textView.font = NSFont.systemFont(ofSize: 14)
        textView.textColor = NSColor(Theme.textPrimary)
        textView.insertionPointColor = NSColor(Theme.textPrimary)
        textView.isAutomaticSpellingCorrectionEnabled = true
        textView.isAutomaticTextReplacementEnabled = true
        textView.typingAttributes = [
            .font: NSFont.systemFont(ofSize: 14),
            .foregroundColor: NSColor(Theme.textPrimary)
        ]
        
        // Set up text container
        textView.textContainer?.containerSize = NSSize(
            width: scrollView.contentSize.width,
            height: .greatestFiniteMagnitude
        )
        textView.textContainer?.widthTracksTextView = true
        
        // Set placeholder text
        context.coordinator.textView = textView
        
        scrollView.documentView = textView
        
        // Initial text
        textView.string = text
        context.coordinator.applyMarkdownStyling(to: textView)
        
        return scrollView
    }
    
    func updateNSView(_ nsView: NSScrollView, context: Context) {
        guard let textView = nsView.documentView as? NSTextView else { return }
        
        // Only update if the text has changed externally
        if textView.string != text {
            let selectedRange = textView.selectedRange()
            textView.string = text
            context.coordinator.applyMarkdownStyling(to: textView)
            // Restore selection if possible
            let safeRange = NSRange(
                location: min(selectedRange.location, textView.string.count),
                length: 0
            )
            textView.setSelectedRange(safeRange)
        }
    }
    
    // MARK: - Coordinator
    
    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: MarkdownTextEditor
        weak var textView: NSTextView?
        
        init(_ parent: MarkdownTextEditor) {
            self.parent = parent
        }
        
        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            parent.text = textView.string
            applyMarkdownStyling(to: textView)
        }
        
        // MARK: - Markdown Styling
        
        func applyMarkdownStyling(to textView: NSTextView) {
            guard let textStorage = textView.textStorage else { return }
            let fullString = textStorage.string
            let fullRange = NSRange(location: 0, length: textStorage.length)
            
            // Save cursor position
            let selectedRange = textView.selectedRange()
            
            // Reset to default styling
            let defaultFont = NSFont.systemFont(ofSize: 14)
            let defaultColor = NSColor(Theme.textPrimary)
            
            textStorage.beginEditing()
            
            textStorage.addAttributes([
                .font: defaultFont,
                .foregroundColor: defaultColor,
                .paragraphStyle: defaultParagraphStyle()
            ], range: fullRange)
            
            let lines = fullString.components(separatedBy: "\n")
            var currentLocation = 0
            
            for line in lines {
                let lineRange = NSRange(location: currentLocation, length: line.count)
                
                // ## Headings
                if line.hasPrefix("## ") {
                    textStorage.addAttributes([
                        .font: NSFont.systemFont(ofSize: 20, weight: .bold),
                        .foregroundColor: defaultColor
                    ], range: lineRange)
                } else if line.hasPrefix("# ") {
                    textStorage.addAttributes([
                        .font: NSFont.systemFont(ofSize: 24, weight: .bold),
                        .foregroundColor: defaultColor
                    ], range: lineRange)
                } else if line.hasPrefix("### ") {
                    textStorage.addAttributes([
                        .font: NSFont.systemFont(ofSize: 17, weight: .semibold),
                        .foregroundColor: defaultColor
                    ], range: lineRange)
                }
                
                // Bullet points — subtle indent
                if line.hasPrefix("- ") || line.hasPrefix("* ") {
                    let bulletStyle = bulletParagraphStyle(indent: 0)
                    textStorage.addAttribute(.paragraphStyle, value: bulletStyle, range: lineRange)
                } else if line.hasPrefix("  - ") || line.hasPrefix("  * ") {
                    let bulletStyle = bulletParagraphStyle(indent: 1)
                    textStorage.addAttribute(.paragraphStyle, value: bulletStyle, range: lineRange)
                } else if line.hasPrefix("    - ") || line.hasPrefix("    * ") {
                    let bulletStyle = bulletParagraphStyle(indent: 2)
                    textStorage.addAttribute(.paragraphStyle, value: bulletStyle, range: lineRange)
                }
                
                // Checkboxes
                if line.hasPrefix("- [ ] ") || line.hasPrefix("- [x] ") {
                    let checkboxRange = NSRange(location: currentLocation, length: 6)
                    textStorage.addAttribute(.foregroundColor, value: NSColor(Theme.textTertiary), range: checkboxRange)
                }
                
                // Inline bold: **text**
                applyInlinePattern(
                    pattern: "\\*\\*(.+?)\\*\\*",
                    to: textStorage,
                    in: lineRange,
                    fullString: fullString,
                    attributes: [.font: NSFont.systemFont(ofSize: 14, weight: .bold)]
                )
                
                // Inline italic: *text* (but not **)
                let italicFont: NSFont = {
                    let descriptor = NSFontDescriptor.preferredFontDescriptor(forTextStyle: .body)
                        .withSymbolicTraits(.italic)
                    return NSFont(descriptor: descriptor, size: 14) ?? NSFont.systemFont(ofSize: 14)
                }()
                applyInlinePattern(
                    pattern: "(?<!\\*)\\*(?!\\*)(.+?)(?<!\\*)\\*(?!\\*)",
                    to: textStorage,
                    in: lineRange,
                    fullString: fullString,
                    attributes: [.font: italicFont]
                )
                
                // Inline code: `text`
                applyInlinePattern(
                    pattern: "`([^`]+)`",
                    to: textStorage,
                    in: lineRange,
                    fullString: fullString,
                    attributes: [
                        .font: NSFont.monospacedSystemFont(ofSize: 13, weight: .regular),
                        .foregroundColor: NSColor(Theme.textSecondary),
                        .backgroundColor: NSColor(Theme.sidebarSelection)
                    ]
                )
                
                currentLocation += line.count + 1 // +1 for newline
            }
            
            textStorage.endEditing()
            
            // Restore cursor position
            textView.setSelectedRange(selectedRange)
        }
        
        // MARK: - Helpers
        
        private func applyInlinePattern(
            pattern: String,
            to textStorage: NSTextStorage,
            in range: NSRange,
            fullString: String,
            attributes: [NSAttributedString.Key: Any]
        ) {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else { return }
            let matches = regex.matches(in: fullString, options: [], range: range)
            
            for match in matches {
                textStorage.addAttributes(attributes, range: match.range)
            }
        }
        
        private func defaultParagraphStyle() -> NSParagraphStyle {
            let style = NSMutableParagraphStyle()
            style.lineSpacing = 4
            return style
        }
        
        private func bulletParagraphStyle(indent: Int) -> NSParagraphStyle {
            let style = NSMutableParagraphStyle()
            style.lineSpacing = 4
            let baseIndent: CGFloat = CGFloat(indent) * 20 + 8
            style.headIndent = baseIndent + 12
            style.firstLineHeadIndent = baseIndent
            return style
        }
    }
}

// MARK: - Custom NSTextView with Keyboard Shortcuts

/// Custom NSTextView that handles Cmd+B, Cmd+I, and Cmd+Shift+H shortcuts.
final class MarkdownNSTextView: NSTextView {
    
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        
        if flags == .command {
            switch event.charactersIgnoringModifiers {
            case "b":
                toggleMarkdownWrapper("**")
                return true
            case "i":
                toggleMarkdownWrapper("*")
                return true
            default:
                break
            }
        }
        
        if flags == [.command, .shift] {
            switch event.charactersIgnoringModifiers {
            case "H", "h":
                toggleHeading()
                return true
            default:
                break
            }
        }
        
        return super.performKeyEquivalent(with: event)
    }
    
    /// Toggle markdown wrapper (e.g. ** for bold, * for italic) around the selection.
    private func toggleMarkdownWrapper(_ wrapper: String) {
        guard let textStorage = textStorage else { return }
        let selectedRange = selectedRange()
        let fullString = textStorage.string as NSString
        
        guard selectedRange.length > 0 else {
            // No selection — insert wrapper pair and place cursor between
            let insertion = wrapper + wrapper
            insertText(insertion, replacementRange: selectedRange)
            setSelectedRange(NSRange(location: selectedRange.location + wrapper.count, length: 0))
            return
        }
        
        let selectedText = fullString.substring(with: selectedRange)
        
        // Check if already wrapped
        let beforeStart = max(0, selectedRange.location - wrapper.count)
        let afterEnd = min(fullString.length, selectedRange.location + selectedRange.length + wrapper.count)
        
        let beforeText = fullString.substring(with: NSRange(location: beforeStart, length: wrapper.count))
        let afterText: String
        if afterEnd - wrapper.count >= selectedRange.location + selectedRange.length {
            afterText = fullString.substring(with: NSRange(
                location: selectedRange.location + selectedRange.length,
                length: min(wrapper.count, fullString.length - selectedRange.location - selectedRange.length)
            ))
        } else {
            afterText = ""
        }
        
        if beforeText == wrapper && afterText == wrapper {
            // Remove wrapper
            let totalRange = NSRange(location: beforeStart, length: afterEnd - beforeStart)
            replaceCharacters(in: totalRange, with: selectedText)
            setSelectedRange(NSRange(location: beforeStart, length: selectedText.count))
        } else {
            // Add wrapper
            let wrapped = wrapper + selectedText + wrapper
            replaceCharacters(in: selectedRange, with: wrapped)
            setSelectedRange(NSRange(location: selectedRange.location + wrapper.count, length: selectedText.count))
        }
    }
    
    /// Toggle ## heading on the current line.
    private func toggleHeading() {
        guard let textStorage = textStorage else { return }
        let fullString = textStorage.string as NSString
        let cursorLocation = selectedRange().location
        
        // Find current line range
        let lineRange = fullString.lineRange(for: NSRange(location: cursorLocation, length: 0))
        let lineText = fullString.substring(with: lineRange)
        
        if lineText.hasPrefix("## ") {
            // Remove heading
            let newText = String(lineText.dropFirst(3))
            replaceCharacters(in: lineRange, with: newText)
        } else if lineText.hasPrefix("# ") {
            // Upgrade to ##
            let newText = "#" + lineText
            replaceCharacters(in: lineRange, with: newText)
        } else {
            // Add heading
            let newText = "## " + lineText
            replaceCharacters(in: lineRange, with: newText)
        }
    }
}
