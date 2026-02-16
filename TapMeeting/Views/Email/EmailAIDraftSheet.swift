import SwiftUI
import SwiftData

/// AI draft reply card — simple input + multi-draft results.
struct EmailAIDraftSheet: View {
    
    let thread: [GmailMessage]
    let message: GmailMessage
    var onUse: (String) -> Void
    var onDismiss: () -> Void
    
    @Environment(AppState.self) private var appState
    @Query private var styleProfiles: [StyleProfile]
    @Query private var contactRules: [ContactRule]
    
    @State private var instructions: String = ""
    @State private var isGenerating = false
    @State private var error: String?
    
    // Multi-draft state
    @State private var drafts = EmailAIService.MultiDraftResult()
    @State private var selectedVariant: EmailAIService.DraftVariant = .standard
    @State private var hasGenerated = false
    
    // Suggested quick actions
    @State private var suggestedActions: [EmailAIService.SuggestedAction] = []
    @State private var isLoadingActions = false
    
    private let aiService = EmailAIService()
    
    /// The style profile for the current account.
    private var activeStyleProfile: StyleProfile? {
        let email = appState.gmailService.connectedEmail ?? ""
        return styleProfiles.first { $0.accountEmail.lowercased() == email.lowercased() }
    }
    
    /// Contact rules matching the sender of the message being replied to.
    private var matchingContactRule: ContactRule? {
        contactRules.first { $0.matches(email: message.fromEmail) }
    }
    
    /// Global email instructions from UserDefaults.
    private var globalInstructions: String? {
        let value = UserDefaults.standard.string(forKey: Constants.Defaults.globalEmailInstructions)
        return value?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? value : nil
    }
    
    /// Recent one-off instructions from UserDefaults.
    private var recentInstructions: [String] {
        UserDefaults.standard.stringArray(forKey: Constants.Defaults.recentOneOffInstructions) ?? []
    }
    
    /// The currently displayed draft text.
    private var currentDraftText: String {
        drafts.draft(for: selectedVariant)
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header
            HStack {
                HStack(spacing: 5) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.olive)
                    Text("AI Draft Reply")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Theme.textPrimary)
                }
                
                Spacer()
                
                if matchingContactRule != nil {
                    HStack(spacing: 3) {
                        Image(systemName: "person.badge.shield.checkmark")
                            .font(.system(size: 9))
                        Text("Rule active")
                            .font(.system(size: 10))
                    }
                    .foregroundColor(Theme.textTertiary)
                    .help(matchingContactRule?.instructions ?? "")
                }
                
                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Theme.textTertiary)
                }
                .buttonStyle(.plain)
            }
            
            // Input row with inline generate (pre-generation)
            if !hasGenerated {
                HStack(spacing: 8) {
                    TextField("e.g. Decline politely, suggest next week…", text: $instructions)
                        .textFieldStyle(.plain)
                        .font(.system(size: 12))
                        .foregroundColor(Theme.textPrimary)
                        .onSubmit { generate() }
                    
                    Button {
                        generate()
                    } label: {
                        HStack(spacing: 4) {
                            if isGenerating {
                                ProgressView()
                                    .controlSize(.mini)
                            } else {
                                Image(systemName: "sparkles")
                                    .font(.system(size: 10))
                            }
                            Text("Generate")
                                .font(.system(size: 11, weight: .medium))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(isGenerating ? Theme.olive.opacity(0.5) : Theme.olive)
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                    .disabled(isGenerating)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Theme.divider, lineWidth: 1)
                )
                .cornerRadius(6)
                
                // Quick action chips
                if isLoadingActions {
                    HStack(spacing: 6) {
                        ForEach(0..<3, id: \.self) { i in
                            RoundedRectangle(cornerRadius: 6)
                                .fill(Theme.divider.opacity(0.3))
                                .frame(width: [72, 56, 84][i], height: 24)
                        }
                        Spacer()
                    }
                } else if !suggestedActions.isEmpty {
                    FlowLayout(spacing: 6) {
                        ForEach(suggestedActions) { action in
                            Button {
                                instructions = action.instruction
                                generate()
                            } label: {
                                Text(action.label)
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(Theme.textSecondary)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(Color.white)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 6)
                                            .stroke(Theme.divider, lineWidth: 1)
                                    )
                                    .cornerRadius(6)
                            }
                            .buttonStyle(.plain)
                            .disabled(isGenerating)
                        }
                    }
                }
                
                // Loading shimmer
                if isGenerating {
                    ShimmerThinkingView(
                        text: "",
                        icon: "sparkles",
                        lineCount: 3
                    )
                }
            }
            
            // Error
            if let error {
                errorView(error)
            }
            
            // Draft results
            if hasGenerated {
                multiDraftSection
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Theme.sidebarBackground)
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(Theme.divider.opacity(0.5), lineWidth: 1)
        )
        .cornerRadius(6)
        .padding(.horizontal, 24)
        .padding(.vertical, 10)
        .onAppear {
            loadSuggestedActions()
        }
    }
    
    // MARK: - Error View
    
    private func errorView(_ message: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 10))
            Text(message)
                .font(.system(size: 11))
        }
        .foregroundColor(Theme.recording)
    }
    
    // MARK: - Multi-Draft Section
    
    private var multiDraftSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Variant tabs
            HStack(spacing: 0) {
                ForEach(EmailAIService.DraftVariant.allCases) { variant in
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) {
                            selectedVariant = variant
                        }
                    } label: {
                        Text(variant.rawValue)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(selectedVariant == variant ? Theme.textPrimary : Theme.textSecondary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(selectedVariant == variant ? Color.white : Color.clear)
                            .cornerRadius(6)
                            .shadow(color: selectedVariant == variant ? .black.opacity(0.05) : .clear, radius: 1, y: 1)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(2)
            .background(Color.white.opacity(0.5))
            .cornerRadius(6)
            
            // Draft content
            if isGenerating && currentDraftText.isEmpty {
                ShimmerThinkingView(
                    text: "Generating drafts…",
                    icon: "sparkles",
                    lineCount: 4
                )
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Theme.divider, lineWidth: 1)
                )
                .cornerRadius(6)
            } else if !currentDraftText.isEmpty {
                Text(currentDraftText)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.textPrimary)
                    .textSelection(.enabled)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Theme.divider, lineWidth: 1)
                    )
                    .cornerRadius(6)
            }
            
            // Action buttons
            HStack(spacing: 8) {
                Button {
                    onUse(currentDraftText)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 10, weight: .medium))
                        Text("Use This")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(currentDraftText.isEmpty ? Theme.textQuaternary : Theme.olive)
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                .disabled(currentDraftText.isEmpty)
                
                Button {
                    regenerateAll()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.counterclockwise")
                            .font(.system(size: 10))
                        Text("Regenerate")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(Theme.textSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Theme.divider, lineWidth: 1)
                    )
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                .disabled(isGenerating)
                
                Spacer()
            }
        }
    }
    
    // MARK: - Actions
    
    private func generate() {
        isGenerating = true
        error = nil
        saveInstruction()
        
        Task {
            do {
                let result = try await aiService.generateMultiDraft(
                    thread: thread,
                    styleProfile: activeStyleProfile,
                    globalInstructions: globalInstructions,
                    contactInstructions: matchingContactRule?.instructions,
                    oneOffInstructions: instructions.isEmpty ? nil : instructions
                )
                await MainActor.run {
                    drafts = result
                    hasGenerated = true
                    isGenerating = false
                }
            } catch {
                await MainActor.run {
                    self.error = error.localizedDescription
                    isGenerating = false
                }
            }
        }
    }
    
    private func regenerateAll() {
        drafts = .init()
        generate()
    }
    
    private func regenerateCurrent() {
        isGenerating = true
        error = nil
        
        let variant = selectedVariant
        
        Task {
            do {
                let draft = try await aiService.regenerateSingleVariant(
                    variant: variant,
                    thread: thread,
                    styleProfile: activeStyleProfile,
                    globalInstructions: globalInstructions,
                    contactInstructions: matchingContactRule?.instructions,
                    oneOffInstructions: instructions.isEmpty ? nil : instructions
                )
                await MainActor.run {
                    drafts.set(draft, for: variant)
                    isGenerating = false
                }
            } catch {
                await MainActor.run {
                    self.error = error.localizedDescription
                    isGenerating = false
                }
            }
        }
    }
    
    private func loadSuggestedActions() {
        let autoSuggest = UserDefaults.standard.object(forKey: Constants.Defaults.autoSuggestActions) as? Bool ?? true
        guard autoSuggest else { return }
        guard SupabaseService.shared?.isAuthenticated == true else { return }
        
        isLoadingActions = true
        Task {
            do {
                let actions = try await aiService.classifyEmail(message: message)
                await MainActor.run {
                    suggestedActions = actions
                    isLoadingActions = false
                }
            } catch {
                await MainActor.run {
                    isLoadingActions = false
                }
            }
        }
    }
    
    private func saveInstruction() {
        let trimmed = instructions.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        
        var recent = recentInstructions
        recent.removeAll { $0 == trimmed }
        recent.insert(trimmed, at: 0)
        if recent.count > 10 { recent = Array(recent.prefix(10)) }
        
        UserDefaults.standard.set(recent, forKey: Constants.Defaults.recentOneOffInstructions)
    }
    
}

// MARK: - Flow Layout

/// A simple flow layout that wraps children to the next line when they overflow.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6
    
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = computeLayout(proposal: proposal, subviews: subviews)
        return result.size
    }
    
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = computeLayout(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                proposal: .unspecified
            )
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
        
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            
            if currentX + size.width > maxWidth && currentX > 0 {
                currentX = 0
                currentY += lineHeight + spacing
                lineHeight = 0
            }
            
            positions.append(CGPoint(x: currentX, y: currentY))
            lineHeight = max(lineHeight, size.height)
            currentX += size.width + spacing
            totalWidth = max(totalWidth, currentX - spacing)
        }
        
        let totalHeight = currentY + lineHeight
        return LayoutResult(
            size: CGSize(width: totalWidth, height: totalHeight),
            positions: positions
        )
    }
}
