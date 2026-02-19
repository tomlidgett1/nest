import SwiftUI
import SwiftData

/// Sheet for generating a follow-up email from meeting notes.
///
/// Shows template selection, meeting context preview, and generates
/// a composed email that opens in the email compose view.
struct MeetingFollowUpSheet: View {
    
    let note: Note
    var onCompose: (EmailDraft) -> Void
    var onDismiss: () -> Void
    
    @Environment(AppState.self) private var appState
    @Query private var styleProfiles: [StyleProfile]
    
    @State private var selectedTemplate: MeetingFollowUpTemplate = .recap
    @State private var customPrompt: String = ""
    @State private var isGenerating = false
    @State private var error: String?
    @State private var generatedPreview: ComposedEmail?
    
    private var aiService: EmailAIService {
        EmailAIService(pipeline: appState.searchQueryPipeline)
    }
    
    /// The style profile for the current account.
    private var activeStyleProfile: StyleProfile? {
        let email = appState.gmailService.connectedEmail ?? ""
        return styleProfiles.first { $0.accountEmail.lowercased() == email.lowercased() }
    }
    
    /// Global email instructions from UserDefaults.
    private var globalInstructions: String? {
        let value = UserDefaults.standard.string(forKey: Constants.Defaults.globalEmailInstructions)
        return value?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? value : nil
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                HStack(spacing: 5) {
                    Image(systemName: "envelope.badge.person.crop")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.olive)
                    Text("Draft Follow-up Email")
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
            
            Rectangle()
                .fill(Theme.divider)
                .frame(height: 1)
            
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Meeting info
                    meetingInfoSection
                    
                    // Template selection
                    templateSection
                    
                    // Custom prompt (shown when Custom template is selected)
                    if selectedTemplate == .custom {
                        customPromptSection
                    }
                    
                    // Generate button
                    if generatedPreview == nil {
                        generateButton
                    }
                    
                    // Error
                    if let error {
                        errorView(error)
                    }
                    
                    // Preview
                    if let preview = generatedPreview {
                        previewSection(preview)
                    }
                }
                .padding(16)
            }
        }
        .background(Theme.cardBackground)
    }
    
    // MARK: - Meeting Info
    
    private var meetingInfoSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Meeting")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Theme.textTertiary)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(note.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Theme.textPrimary)
                
                Text(note.formattedDate)
                    .font(.system(size: 12))
                    .foregroundColor(Theme.textSecondary)
                
                if !note.attendees.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "person.2")
                            .font(.system(size: 10))
                            .foregroundColor(Theme.textTertiary)
                        Text(note.attendees.joined(separator: ", "))
                            .font(.system(size: 12))
                            .foregroundColor(Theme.textSecondary)
                            .lineLimit(2)
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white)
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Theme.divider, lineWidth: 1)
            )
            .cornerRadius(6)
        }
    }
    
    // MARK: - Template Selection
    
    private var templateSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Template")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Theme.textTertiary)
            
            HStack(spacing: 0) {
                ForEach(MeetingFollowUpTemplate.allCases) { template in
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) {
                            selectedTemplate = template
                            generatedPreview = nil
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: template.icon)
                                .font(.system(size: 10))
                            Text(template.rawValue)
                                .font(.system(size: 11, weight: .medium))
                        }
                        .foregroundColor(selectedTemplate == template ? Theme.textPrimary : Theme.textTertiary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(selectedTemplate == template ? Color.white : Color.clear)
                        .cornerRadius(6)
                        .shadow(color: selectedTemplate == template ? .black.opacity(0.05) : .clear, radius: 1, y: 1)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(2)
            .background(Theme.sidebarBackground)
            .cornerRadius(8)
        }
    }
    
    // MARK: - Custom Prompt
    
    private var customPromptSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("What should the follow-up include?")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Theme.textTertiary)
            
            TextField("e.g. Summarise the key decisions and ask everyone to confirm their action items", text: $customPrompt)
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
        }
    }
    
    // MARK: - Generate Button
    
    private var generateButton: some View {
        VStack(alignment: .leading, spacing: 8) {
            if isGenerating {
                ShimmerThinkingView(
                    text: "Generating follow-up…",
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
            } else {
                Button {
                    generateFollowUp()
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 11))
                        Text("Generate Follow-up")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(Theme.olive)
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                .disabled(selectedTemplate == .custom && customPrompt.isEmpty)
            }
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
    
    // MARK: - Preview Section
    
    private func previewSection(_ preview: ComposedEmail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Preview")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Theme.textTertiary)
            
            VStack(alignment: .leading, spacing: 6) {
                if !preview.subject.isEmpty {
                    HStack(spacing: 4) {
                        Text("Subject:")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Theme.textTertiary)
                        Text(preview.subject)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Theme.textPrimary)
                    }
                }
                
                Rectangle().fill(Theme.divider).frame(height: 1)
                
                Text(preview.body)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.textPrimary)
                    .textSelection(.enabled)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white)
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Theme.divider, lineWidth: 1)
            )
            .cornerRadius(6)
            
            // Actions
            HStack(spacing: 8) {
                Button {
                    openInCompose(preview)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "envelope")
                            .font(.system(size: 10, weight: .medium))
                        Text("Open in Compose")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Theme.olive)
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                
                Button {
                    generatedPreview = nil
                    generateFollowUp()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.counterclockwise")
                            .font(.system(size: 10))
                        Text("Regenerate")
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
    
    private func generateFollowUp() {
        isGenerating = true
        error = nil
        
        let noteTitle = note.title
        let enhancedNotes = note.enhancedNotes ?? note.rawNotes
        let attendees = note.attendees
        let template = selectedTemplate
        
        Task {
            do {
                let result = try await aiService.generateMeetingFollowUp(
                    noteTitle: noteTitle,
                    enhancedNotes: enhancedNotes,
                    attendees: attendees,
                    template: template,
                    styleProfile: activeStyleProfile,
                    globalInstructions: globalInstructions
                )
                await MainActor.run {
                    generatedPreview = result
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
    
    private func openInCompose(_ preview: ComposedEmail) {
        var draft = EmailDraft()
        draft.to = note.attendees.filter { $0.contains("@") }
        draft.subject = preview.subject.isEmpty ? "Follow-up: \(note.title)" : preview.subject
        draft.body = preview.body
        onCompose(draft)
    }
}
