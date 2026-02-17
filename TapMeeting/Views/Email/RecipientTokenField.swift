import SwiftUI

// MARK: - Recipient Token Model

/// A single confirmed recipient shown as a removable chip in the token field.
struct RecipientToken: Identifiable, Equatable {
    let id: String
    let name: String
    let email: String
    
    init(id: String = UUID().uuidString, name: String = "", email: String) {
        self.id = id
        self.name = name
        self.email = email
    }
}

// MARK: - Recipient Token Field

/// Gmail-style chip-based recipient input field.
///
/// Confirmed emails appear as removable pills. An inline text field at the end
/// handles typing and triggers parent-managed autocomplete.
/// - Comma, semicolon, or Enter commits the current input as a new chip.
/// - Pasting multiple comma-separated emails creates multiple chips at once.
struct RecipientTokenField: View {
    @Binding var tokens: [RecipientToken]
    @Binding var inputText: String
    let placeholder: String
    
    /// Called whenever the current search query changes (the text being typed, after any separator processing).
    var onSearchQueryChanged: ((String) -> Void)?
    
    /// Called when the user presses arrow keys or Enter while suggestions are visible.
    /// Return `true` from the handler if the key was consumed (e.g. arrow navigation or Enter to select).
    var onKeyboardNavigation: ((KeyboardNavigationEvent) -> Bool)?
    
    enum KeyboardNavigationEvent {
        case arrowDown
        case arrowUp
        case enterSelection
    }
    
    @FocusState private var isInputFocused: Bool
    
    var body: some View {
        TokenFlowLayout(spacing: 4) {
            ForEach(tokens) { token in
                tokenChip(token)
                    .transition(.asymmetric(
                        insertion: .scale(scale: 0.8).combined(with: .opacity),
                        removal: .scale(scale: 0.8).combined(with: .opacity)
                    ))
            }
            
            TextField(tokens.isEmpty ? placeholder : "", text: $inputText)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .foregroundColor(Theme.textPrimary)
                .focused($isInputFocused)
                .frame(minWidth: 120)
                .onChange(of: inputText) { _, newValue in
                    let currentQuery = handleTextChange(newValue)
                    onSearchQueryChanged?(currentQuery)
                }
                .onSubmit {
                    // If a suggestion is highlighted, select it instead of committing raw text
                    if let handler = onKeyboardNavigation, handler(.enterSelection) {
                        return
                    }
                    commitCurrentInput()
                    onSearchQueryChanged?("")
                }
                .onKeyPress(.downArrow) {
                    if let handler = onKeyboardNavigation, handler(.arrowDown) {
                        return .handled
                    }
                    return .ignored
                }
                .onKeyPress(.upArrow) {
                    if let handler = onKeyboardNavigation, handler(.arrowUp) {
                        return .handled
                    }
                    return .ignored
                }
        }
        .padding(.vertical, tokens.isEmpty ? 0 : 2)
        .onChange(of: isInputFocused) { _, focused in
            if !focused {
                commitCurrentInput()
                onSearchQueryChanged?("")
            }
        }
    }
    
    // MARK: - Token Chip
    
    private func tokenChip(_ token: RecipientToken) -> some View {
        HStack(spacing: 3) {
            ZStack {
                Circle()
                    .fill(Color(nsColor: .systemGray).opacity(0.12))
                    .frame(width: 18, height: 18)
                
                Text(chipInitial(for: token))
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(Theme.textSecondary)
            }
            
            Text(token.name.isEmpty ? token.email : token.name)
                .font(.system(size: 11.5, weight: .medium))
                .foregroundColor(Theme.textPrimary)
                .lineLimit(1)
            
            Button {
                withAnimation(.easeInOut(duration: 0.15)) {
                    tokens.removeAll { $0.id == token.id }
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 7, weight: .bold))
                    .foregroundColor(Theme.textTertiary)
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 2)
        .padding(.trailing, 6)
        .padding(.vertical, 2)
        .background(Theme.sidebarBackground)
        .clipShape(Capsule())
    }
    
    // MARK: - Text Handling
    
    /// Handles text changes, auto-committing on separator characters and handling paste of multiple emails.
    /// Returns the current search query after processing.
    @discardableResult
    private func handleTextChange(_ newValue: String) -> String {
        let separators = CharacterSet(charactersIn: ",;\n\t")
        let parts = newValue.components(separatedBy: separators)
        
        guard parts.count > 1 else { return newValue }
        
        // User typed a separator or pasted multiple emails
        for part in parts.dropLast() {
            let email = part.trimmingCharacters(in: .whitespacesAndNewlines)
            if !email.isEmpty {
                addTokenIfUnique(name: "", email: email)
            }
        }
        // Keep the last fragment as current input (may be partial)
        let remaining = parts.last?.trimmingCharacters(in: .whitespaces) ?? ""
        inputText = remaining
        return remaining
    }
    
    /// Commits whatever is currently in the text field as a new chip.
    func commitCurrentInput() {
        let raw = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return }
        addTokenIfUnique(name: "", email: raw)
        inputText = ""
    }
    
    /// Adds a token only if the email isn't already present.
    private func addTokenIfUnique(name: String, email: String) {
        let isDuplicate = tokens.contains { $0.email.lowercased() == email.lowercased() }
        guard !isDuplicate else { return }
        withAnimation(.easeInOut(duration: 0.15)) {
            tokens.append(RecipientToken(name: name, email: email))
        }
    }
    
    private func chipInitial(for token: RecipientToken) -> String {
        let source = token.name.isEmpty ? token.email : token.name
        return String(source.prefix(1)).uppercased()
    }
}

// MARK: - Token Flow Layout

/// A flow layout that wraps items to new lines when they exceed the available width.
/// The last item (the text field) stretches to fill remaining space on its line.
struct TokenFlowLayout: Layout {
    var spacing: CGFloat = 4
    
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = computeLayout(proposal: proposal, subviews: subviews)
        return result.size
    }
    
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = computeLayout(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            // Give the last item (text field) the remaining width on its line
            if index == subviews.count - 1 {
                let remainingWidth = max(
                    (proposal.width ?? bounds.width) - position.x,
                    subviews[index].sizeThatFits(.unspecified).width
                )
                let size = CGSize(width: remainingWidth, height: subviews[index].sizeThatFits(.unspecified).height)
                subviews[index].place(
                    at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                    proposal: ProposedViewSize(size)
                )
            } else {
                subviews[index].place(
                    at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                    proposal: .unspecified
                )
            }
        }
    }
    
    private struct LayoutResult {
        var size: CGSize
        var positions: [CGPoint]
    }
    
    private func computeLayout(proposal: ProposedViewSize, subviews: Subviews) -> LayoutResult {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0
        var totalWidth: CGFloat = 0
        
        for (index, subview) in subviews.enumerated() {
            let size = subview.sizeThatFits(.unspecified)
            let isLastItem = index == subviews.count - 1
            
            // For the last item (text field), check if there's enough space (minWidth)
            let requiredWidth = isLastItem ? max(size.width, 120) : size.width
            
            if currentX + requiredWidth > maxWidth && currentX > 0 {
                currentX = 0
                currentY += lineHeight + spacing
                lineHeight = 0
            }
            
            positions.append(CGPoint(x: currentX, y: currentY))
            currentX += size.width + spacing
            lineHeight = max(lineHeight, size.height)
            totalWidth = max(totalWidth, currentX)
        }
        
        return LayoutResult(
            size: CGSize(width: max(totalWidth - spacing, 0), height: currentY + lineHeight),
            positions: positions
        )
    }
}
