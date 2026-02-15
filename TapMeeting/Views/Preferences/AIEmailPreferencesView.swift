import SwiftUI
import SwiftData

/// AI Email preferences — style profile management, global instructions,
/// contact rules CRUD, and default settings.
struct AIEmailPreferencesView: View {
    
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Query private var styleProfiles: [StyleProfile]
    @Query(sort: \ContactRule.createdAt, order: .reverse) private var contactRules: [ContactRule]
    
    // Global instructions
    @State private var globalInstructions: String = ""
    @State private var savedGlobal = false
    
    // Style profile
    @State private var isAnalysing = false
    @State private var analysisError: String?
    @State private var showStyleProfile = false
    
    // Contact rules
    @State private var showAddRule = false
    @State private var newRuleMatchType: ContactRule.MatchType = .email
    @State private var newRuleMatchValue: String = ""
    @State private var newRuleDisplayName: String = ""
    @State private var newRuleInstructions: String = ""
    
    // Defaults
    @State private var variantCount: Int = 3
    @State private var autoSuggest: Bool = true
    
    private let aiService = EmailAIService()
    
    /// The style profile for the current Gmail account.
    private var activeProfile: StyleProfile? {
        let email = appState.gmailService.connectedEmail ?? ""
        return styleProfiles.first { $0.accountEmail.lowercased() == email.lowercased() }
    }
    
    var body: some View {
        VStack(spacing: 16) {
            // Writing Style
            styleCard
            
            // Global Instructions
            globalInstructionsCard
            
            // Contact Rules
            contactRulesCard
            
            // Defaults
            defaultsCard
        }
        .onAppear {
            globalInstructions = UserDefaults.standard.string(forKey: Constants.Defaults.globalEmailInstructions) ?? ""
            variantCount = UserDefaults.standard.object(forKey: Constants.Defaults.defaultVariantCount) as? Int ?? 3
            autoSuggest = UserDefaults.standard.object(forKey: Constants.Defaults.autoSuggestActions) as? Bool ?? true
        }
    }
    
    // MARK: - Writing Style Card
    
    private var styleCard: some View {
        SettingsCard(title: "Writing Style", subtitle: "Analyse your sent emails to match your tone and style.") {
            if let profile = activeProfile {
                // Active profile
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(Color(red: 0.30, green: 0.69, blue: 0.31))
                                .frame(width: 6, height: 6)
                            Text("Style profile active")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Theme.textPrimary)
                        }
                        
                        Spacer()
                        
                        Text("Based on \(profile.emailsAnalysed) emails")
                            .font(.system(size: 10))
                            .foregroundColor(Theme.textTertiary)
                    }
                    
                    if showStyleProfile {
                        profileDetails(profile)
                    }
                    
                    HStack(spacing: 10) {
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                showStyleProfile.toggle()
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: showStyleProfile ? "eye.slash" : "eye")
                                    .font(.system(size: 10))
                                Text(showStyleProfile ? "Hide Profile" : "View Profile")
                                    .font(.system(size: 11, weight: .medium))
                            }
                            .foregroundColor(Theme.olive)
                        }
                        .buttonStyle(.plain)
                        
                        Button {
                            analyseStyle()
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "arrow.clockwise")
                                    .font(.system(size: 10))
                                Text("Refresh")
                                    .font(.system(size: 11, weight: .medium))
                            }
                            .foregroundColor(Theme.olive)
                        }
                        .buttonStyle(.plain)
                        .disabled(isAnalysing)
                        
                        Button {
                            resetStyleProfile()
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "trash")
                                    .font(.system(size: 10))
                                Text("Reset")
                                    .font(.system(size: 11, weight: .medium))
                            }
                            .foregroundColor(Theme.recording)
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                // No profile
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: "person.text.rectangle")
                            .font(.system(size: 14))
                            .foregroundColor(Theme.textTertiary)
                        Text("No style profile yet")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.textTertiary)
                    }
                    
                    if isAnalysing {
                        ShimmerThinkingView(
                            text: "Analysing your writing style…",
                            icon: "sparkles",
                            lineCount: 2
                        )
                    } else {
                        Button {
                            analyseStyle()
                        } label: {
                            HStack(spacing: 5) {
                                Image(systemName: "sparkles")
                                    .font(.system(size: 11))
                                Text("Analyse My Writing Style")
                                    .font(.system(size: 12, weight: .medium))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(Theme.olive)
                            .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                        .disabled(!appState.gmailService.isConnected)
                    }
                }
            }
            
            if let error = analysisError {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 10))
                    Text(error)
                        .font(.system(size: 11))
                }
                .foregroundColor(Theme.recording)
            }
        }
    }
    
    // MARK: - Profile Details
    
    private func profileDetails(_ profile: StyleProfile) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle().fill(Theme.divider).frame(height: 1).padding(.vertical, 4)
            
            if !profile.styleSummary.isEmpty {
                Text(profile.styleSummary)
                    .font(.system(size: 12))
                    .foregroundColor(Theme.textPrimary)
                    .padding(.bottom, 4)
            }
            
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 8) {
                profileDetail("Greetings", profile.greetings.joined(separator: ", "))
                profileDetail("Sign-offs", profile.signOffs.joined(separator: ", "))
                profileDetail("Signs as", profile.signatureName)
                profileDetail("Formality", String(format: "%.0f%%", profile.formalityScore * 100))
                profileDetail("Locale", profile.locale)
                profileDetail("Contractions", profile.usesContractions ? "Yes" : "No")
                profileDetail("Emoji", profile.usesEmoji ? "Yes" : "No")
                profileDetail("Bullets", profile.prefersBulletPoints ? "Yes" : "No")
            }
            
            if !profile.commonPhrases.isEmpty {
                profileDetail("Common phrases", profile.commonPhrases.joined(separator: ", "))
            }
        }
    }
    
    private func profileDetail(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(Theme.textTertiary)
                .textCase(.uppercase)
                .tracking(0.3)
            Text(value.isEmpty ? "—" : value)
                .font(.system(size: 12))
                .foregroundColor(Theme.textSecondary)
                .lineLimit(2)
        }
    }
    
    // MARK: - Global Instructions Card
    
    private var globalInstructionsCard: some View {
        SettingsCard(
            title: "Global Instructions",
            subtitle: "Rules that apply to every AI-generated email."
        ) {
            TextEditor(text: $globalInstructions)
                .font(.system(size: 12))
                .foregroundColor(Theme.textPrimary)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 60, maxHeight: 100)
                .padding(10)
                .background(Theme.background)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Theme.divider, lineWidth: 1)
                )
                .cornerRadius(6)
            
            HStack(spacing: 10) {
                Button {
                    UserDefaults.standard.set(globalInstructions, forKey: Constants.Defaults.globalEmailInstructions)
                    withAnimation(.easeInOut(duration: 0.2)) { savedGlobal = true }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation(.easeInOut(duration: 0.2)) { savedGlobal = false }
                    }
                } label: {
                    Text("Save")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(Theme.olive)
                        .cornerRadius(6)
                }
                .buttonStyle(.plain)
                
                if savedGlobal {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 11))
                        Text("Saved")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(Color(red: 0.30, green: 0.69, blue: 0.31))
                    .transition(.opacity)
                }
            }
        }
    }
    
    // MARK: - Contact Rules Card
    
    private var contactRulesCard: some View {
        SettingsCard(
            title: "Contact Rules",
            subtitle: "Customise AI behaviour per contact or domain."
        ) {
            VStack(alignment: .leading, spacing: 8) {
                if contactRules.isEmpty {
                    HStack(spacing: 8) {
                        Image(systemName: "person.2")
                            .font(.system(size: 13))
                            .foregroundColor(Theme.textTertiary)
                        Text("No contact rules yet")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.textTertiary)
                    }
                    .padding(.vertical, 4)
                } else {
                    ForEach(contactRules) { rule in
                        HStack(spacing: 8) {
                            Image(systemName: rule.matchType == .email ? "person" : "globe")
                                .font(.system(size: 11))
                                .foregroundColor(Theme.textTertiary)
                                .frame(width: 16)
                            
                            Text(rule.displayLabel)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Theme.textPrimary)
                            
                            Text("·")
                                .foregroundColor(Theme.textQuaternary)
                            
                            Text(rule.instructions)
                                .font(.system(size: 11))
                                .foregroundColor(Theme.textSecondary)
                                .lineLimit(1)
                            
                            Spacer()
                            
                            Button {
                                deleteRule(rule)
                            } label: {
                                Image(systemName: "xmark.circle")
                                    .font(.system(size: 12))
                                    .foregroundColor(Theme.textTertiary)
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.vertical, 4)
                        .padding(.horizontal, 10)
                        .background(Theme.background)
                        .cornerRadius(6)
                    }
                }
                
                // Add rule form
                if showAddRule {
                    addRuleForm
                } else {
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) {
                            showAddRule = true
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "plus.circle")
                                .font(.system(size: 11))
                            Text("Add Rule")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(Theme.olive)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
    
    // MARK: - Add Rule Form
    
    private var addRuleForm: some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle().fill(Theme.divider).frame(height: 1)
            
            HStack(spacing: 8) {
                // Match type picker
                HStack(spacing: 0) {
                    ForEach(ContactRule.MatchType.allCases, id: \.rawValue) { type in
                        Button {
                            newRuleMatchType = type
                        } label: {
                            Text(type == .email ? "Email" : "Domain")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(newRuleMatchType == type ? Theme.textPrimary : Theme.textTertiary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(newRuleMatchType == type ? Color.white : Color.clear)
                                .cornerRadius(4)
                                .shadow(color: newRuleMatchType == type ? .black.opacity(0.06) : .clear, radius: 1, y: 1)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(2)
                .background(Theme.sidebarSelection)
                .cornerRadius(6)
                
                TextField(newRuleMatchType == .email ? "john@example.com" : "bigcorp.com", text: $newRuleMatchValue)
                    .textFieldStyle(.plain)
                    .font(.system(size: 11))
                    .padding(7)
                    .background(Theme.background)
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Theme.divider, lineWidth: 1)
                    )
                    .cornerRadius(6)
            }
            
            TextField("Display name (optional)", text: $newRuleDisplayName)
                .textFieldStyle(.plain)
                .font(.system(size: 11))
                .padding(7)
                .background(Theme.background)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Theme.divider, lineWidth: 1)
                )
                .cornerRadius(6)
            
            TextField("Instructions, e.g. 'Be formal. Use full sentences.'", text: $newRuleInstructions)
                .textFieldStyle(.plain)
                .font(.system(size: 11))
                .padding(7)
                .background(Theme.background)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Theme.divider, lineWidth: 1)
                )
                .cornerRadius(6)
            
            HStack(spacing: 8) {
                Button {
                    addRule()
                } label: {
                    Text("Add")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 5)
                        .background(Theme.olive)
                        .cornerRadius(5)
                }
                .buttonStyle(.plain)
                .disabled(newRuleMatchValue.isEmpty || newRuleInstructions.isEmpty)
                
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        showAddRule = false
                        clearRuleForm()
                    }
                } label: {
                    Text("Cancel")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Theme.textTertiary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 5)
                }
                .buttonStyle(.plain)
            }
        }
    }
    
    // MARK: - Defaults Card
    
    private var defaultsCard: some View {
        SettingsCard(title: "Defaults") {
            VStack(spacing: 12) {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Theme.olive.opacity(0.08))
                            .frame(width: 32, height: 32)
                        Image(systemName: "doc.on.doc")
                            .font(.system(size: 13))
                            .foregroundColor(Theme.olive)
                    }
                    
                    Text("Number of variants")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Theme.textPrimary)
                    
                    Spacer()
                    
                    Picker("", selection: $variantCount) {
                        Text("1").tag(1)
                        Text("3").tag(3)
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 80)
                    .onChange(of: variantCount) { _, newValue in
                        UserDefaults.standard.set(newValue, forKey: Constants.Defaults.defaultVariantCount)
                    }
                }
                
                Rectangle().fill(Theme.divider).frame(height: 1)
                
                SettingsToggleRow(
                    icon: "bolt",
                    title: "Auto-suggest quick actions",
                    subtitle: "Automatically suggest reply actions for emails",
                    isOn: $autoSuggest
                )
                .onChange(of: autoSuggest) { _, newValue in
                    UserDefaults.standard.set(newValue, forKey: Constants.Defaults.autoSuggestActions)
                }
            }
        }
    }
    
    // MARK: - Actions
    
    private func analyseStyle() {
        guard appState.gmailService.isConnected else {
            analysisError = "Connect a Gmail account first."
            return
        }
        
        guard let key = KeychainHelper.get(key: Constants.Keychain.anthropicAPIKey), !key.isEmpty else {
            analysisError = "Anthropic API key not configured. Add it in API Keys above."
            return
        }
        
        isAnalysing = true
        analysisError = nil
        
        Task {
            let sentEmails = await appState.gmailService.fetchSentMessages(limit: 100)
            
            guard !sentEmails.isEmpty else {
                await MainActor.run {
                    analysisError = "No sent emails found to analyse."
                    isAnalysing = false
                }
                return
            }
            
            do {
                let result = try await aiService.analyseStyle(sentEmails: sentEmails)
                
                await MainActor.run {
                    let email = appState.gmailService.connectedEmail ?? ""
                    
                    if let existing = activeProfile {
                        existing.greetings = result.greetings
                        existing.signOffs = result.signOffs
                        existing.signatureName = result.signatureName
                        existing.averageSentenceLength = result.averageSentenceLength
                        existing.formalityScore = result.formalityScore
                        existing.usesContractions = result.usesContractions
                        existing.usesEmoji = result.usesEmoji
                        existing.prefersBulletPoints = result.prefersBulletPoints
                        existing.commonPhrases = result.commonPhrases
                        existing.avoidedPhrases = result.avoidedPhrases
                        existing.locale = result.locale
                        existing.styleSummary = result.styleSummary
                        existing.sampleExcerpts = result.sampleExcerpts
                        existing.emailsAnalysed = sentEmails.count
                        existing.updatedAt = .now
                    } else {
                        let profile = StyleProfile(
                            accountEmail: email,
                            greetings: result.greetings,
                            signOffs: result.signOffs,
                            signatureName: result.signatureName,
                            averageSentenceLength: result.averageSentenceLength,
                            formalityScore: result.formalityScore,
                            usesContractions: result.usesContractions,
                            usesEmoji: result.usesEmoji,
                            prefersBulletPoints: result.prefersBulletPoints,
                            commonPhrases: result.commonPhrases,
                            avoidedPhrases: result.avoidedPhrases,
                            locale: result.locale,
                            styleSummary: result.styleSummary,
                            sampleExcerpts: result.sampleExcerpts,
                            emailsAnalysed: sentEmails.count
                        )
                        modelContext.insert(profile)
                    }
                    
                    try? modelContext.save()
                    isAnalysing = false
                }
            } catch {
                await MainActor.run {
                    analysisError = error.localizedDescription
                    isAnalysing = false
                }
            }
        }
    }
    
    private func resetStyleProfile() {
        guard let profile = activeProfile else { return }
        modelContext.delete(profile)
        try? modelContext.save()
    }
    
    private func addRule() {
        let rule = ContactRule(
            matchType: newRuleMatchType,
            matchValue: newRuleMatchValue,
            displayName: newRuleDisplayName.isEmpty ? nil : newRuleDisplayName,
            instructions: newRuleInstructions
        )
        modelContext.insert(rule)
        try? modelContext.save()
        
        clearRuleForm()
        showAddRule = false
    }
    
    private func deleteRule(_ rule: ContactRule) {
        modelContext.delete(rule)
        try? modelContext.save()
    }
    
    private func clearRuleForm() {
        newRuleMatchType = .email
        newRuleMatchValue = ""
        newRuleDisplayName = ""
        newRuleInstructions = ""
    }
}
