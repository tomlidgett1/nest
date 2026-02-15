import SwiftUI
import SwiftData

/// Enhanced AI email draft panel with multi-draft variants, quick actions,
/// contact rule indicators, and instruction history.
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
    
    // Suggested actions
    @State private var suggestedActions: [EmailAIService.SuggestedAction] = []
    @State private var isLoadingActions = false
    
    // Instruction history
    @State private var showRecentInstructions = false
    
    // Summary state
    @State private var showSummary = false
    @State private var summaryText: String?
    @State private var isSummarising = false
    
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
        VStack(spacing: 0) {
            // Header
            header
            
            Rectangle()
                .fill(Theme.divider)
                .frame(height: 1)
            
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    // Email summary section
                    emailSummarySection
                    
                    // Quick action chips (or skeleton while loading)
                    if isLoadingActions {
                        QuickActionSkeletonView()
                    } else if !suggestedActions.isEmpty {
                        quickActionsSection
                    }
                    
                    // Contact rule indicator
                    if let rule = matchingContactRule {
                        contactRuleIndicator(rule)
                    }
                    
                    // Instructions input
                    instructionsSection
                    
                    // Recent instructions chips
                    if !recentInstructions.isEmpty && !hasGenerated {
                        recentInstructionsSection
                    }
                    
                    // Generate button
                    if !hasGenerated {
                        generateButton
                    }
                    
                    // Error
                    if let error {
                        errorView(error)
                    }
                    
                    // Multi-draft results
                    if hasGenerated {
                        multiDraftSection
                    }
                }
                .padding(16)
            }
        }
        .background(Theme.cardBackground)
        .onAppear {
            loadSuggestedActions()
        }
    }
    
    // MARK: - Header
    
    private var header: some View {
        HStack {
            HStack(spacing: 5) {
                Image(systemName: "sparkles")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.olive)
                Text("AI Draft Reply")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.textPrimary)
            }
            
            Spacer()
            
            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Theme.textTertiary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.sidebarBackground)
    }
    
    // MARK: - Email Summary
    
    private var emailSummarySection: some View {
        VStack(alignment: .leading, spacing: 6) {
            if showSummary {
                // Summary card
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        HStack(spacing: 5) {
                            Image(systemName: "text.alignleft")
                                .font(.system(size: 10))
                                .foregroundColor(Theme.olive)
                            Text("Summary")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(Theme.textPrimary)
                        }
                        
                        Spacer()
                        
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                showSummary = false
                            }
                        } label: {
                            Image(systemName: "chevron.up")
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(Theme.textTertiary)
                        }
                        .buttonStyle(.plain)
                    }
                    
                    if isSummarising {
                        ShimmerThinkingView(
                            text: "Analysing email…",
                            icon: "text.alignleft",
                            lineCount: 3
                        )
                    } else if let summary = summaryText {
                        SummaryMarkdownView(text: summary)
                    }
                }
                .padding(12)
                .background(Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Theme.divider, lineWidth: 1)
                )
                .cornerRadius(6)
            } else if isSummarising {
                // Shimmer loading while summary generates (collapsed state)
                HStack(spacing: 0) {
                    ShimmerThinkingView(
                        text: "Summarising…",
                        icon: "text.alignleft"
                    )
                    Spacer()
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Theme.divider, lineWidth: 1)
                )
                .cornerRadius(6)
            } else {
                // "Generate Summary" button
                Button {
                    generateSummary()
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "text.alignleft")
                            .font(.system(size: 10))
                        Text("Show Summary")
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
            }
        }
    }
    
    // MARK: - Quick Actions
    
    private var quickActionsSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Quick Actions")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Theme.textTertiary)
            
            FlowLayout(spacing: 6) {
                ForEach(suggestedActions) { action in
                    Button {
                        instructions = action.instruction
                        generate()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: action.icon)
                                .font(.system(size: 10))
                            Text(action.label)
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
                }
            }
        }
    }
    
    // MARK: - Contact Rule Indicator
    
    private func contactRuleIndicator(_ rule: ContactRule) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "person.badge.shield.checkmark")
                .font(.system(size: 10))
                .foregroundColor(Theme.olive)
            
            Text("Contact rule active:")
                .font(.system(size: 11))
                .foregroundColor(Theme.textTertiary)
            
            Text("\"\(rule.instructions.prefix(50))\(rule.instructions.count > 50 ? "…" : "")\"")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Theme.textSecondary)
                .lineLimit(1)
            
            Spacer()
        }
        .padding(10)
        .background(Color.white)
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(Theme.divider, lineWidth: 1)
        )
        .cornerRadius(6)
    }
    
    // MARK: - Instructions
    
    private var instructionsSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Instructions (optional)")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Theme.textTertiary)
            
            TextField("e.g. Decline politely, suggest next week instead", text: $instructions)
                .textFieldStyle(.plain)
                .font(.system(size: 12))
                .foregroundColor(Theme.textPrimary)
                .padding(10)
                .background(Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Theme.divider, lineWidth: 1)
                )
                .cornerRadius(6)
                .onSubmit {
                    if !instructions.isEmpty {
                        generate()
                    }
                }
        }
    }
    
    // MARK: - Recent Instructions
    
    private var recentInstructionsSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Recent")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Theme.textTertiary)
            
            FlowLayout(spacing: 4) {
                ForEach(recentInstructions.prefix(5), id: \.self) { instruction in
                    Button {
                        instructions = instruction
                    } label: {
                        Text(instruction)
                            .font(.system(size: 11))
                            .foregroundColor(Theme.textSecondary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Theme.sidebarBackground)
                            .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
    
    // MARK: - Generate Button
    
    private var generateButton: some View {
        Button {
            generate()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "sparkles")
                    .font(.system(size: 11))
                Text("Generate 3 Drafts")
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(isGenerating ? Theme.olive.opacity(0.5) : Theme.olive)
            .cornerRadius(6)
        }
        .buttonStyle(.plain)
        .disabled(isGenerating)
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
                // Tab container
                HStack(spacing: 0) {
                    ForEach(EmailAIService.DraftVariant.allCases) { variant in
                        Button {
                            withAnimation(.easeInOut(duration: 0.15)) {
                                selectedVariant = variant
                            }
                        } label: {
                            Text(variant.rawValue)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(selectedVariant == variant ? Theme.textPrimary : Theme.textTertiary)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 7)
                                .background(selectedVariant == variant ? Color.white : Color.clear)
                                .cornerRadius(6)
                                .shadow(color: selectedVariant == variant ? .black.opacity(0.05) : .clear, radius: 1, y: 1)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(2)
                .background(Theme.sidebarBackground)
                .cornerRadius(8)
                
                Spacer()
            }
            
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
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
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
                        Text("Regenerate All")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Theme.textSecondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Theme.sidebarSelection)
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                .disabled(isGenerating)
                
                Button {
                    regenerateCurrent()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 10))
                        Text("Regenerate This")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Theme.textSecondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Theme.sidebarSelection)
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
    
    private func generateSummary() {
        // If we already have a summary, just show it
        if summaryText != nil {
            withAnimation(.easeInOut(duration: 0.2)) {
                showSummary = true
            }
            return
        }
        
        isSummarising = true
        withAnimation(.easeInOut(duration: 0.2)) {
            showSummary = true
        }
        
        Task {
            do {
                let summary = try await aiService.summariseThread(thread: thread)
                await MainActor.run {
                    summaryText = summary
                    isSummarising = false
                }
            } catch {
                await MainActor.run {
                    summaryText = "Failed to summarise: \(error.localizedDescription)"
                    isSummarising = false
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
    
    private func saveInstruction() {
        let trimmed = instructions.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        
        var recent = recentInstructions
        recent.removeAll { $0 == trimmed }
        recent.insert(trimmed, at: 0)
        if recent.count > 10 { recent = Array(recent.prefix(10)) }
        
        UserDefaults.standard.set(recent, forKey: Constants.Defaults.recentOneOffInstructions)
    }
    
    private func loadSuggestedActions() {
        let autoSuggest = UserDefaults.standard.object(forKey: Constants.Defaults.autoSuggestActions) as? Bool ?? true
        guard autoSuggest else { return }
        
        // Check we have an API key first
        guard let key = KeychainHelper.get(key: Constants.Keychain.anthropicAPIKey), !key.isEmpty else { return }
        
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
