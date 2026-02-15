import SwiftUI

/// Onboarding — warm, clean, two steps.
struct OnboardingView: View {
    
    @Environment(AppState.self) private var appState
    @State private var step = 0
    
    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            
            if step == 0 { welcomeStep } else { apiKeyStep }
            
            Spacer()
            
            // Navigation
            HStack {
                if step > 0 {
                    Button("Back") { withAnimation { step -= 1 } }
                        .font(.system(size: 13))
                        .buttonStyle(.plain)
                        .foregroundColor(Theme.textSecondary)
                }
                Spacer()
                HStack(spacing: 5) {
                    ForEach(0..<2, id: \.self) { i in
                        Circle()
                            .fill(i == step ? Theme.textSecondary : Theme.divider)
                            .frame(width: 5, height: 5)
                    }
                }
                Spacer()
                Button(step == 0 ? "Next" : "Get Started") {
                    if step == 0 {
                        requestPermissions()
                    } else {
                        appState.completeOnboarding()
                        // Close the onboarding window and open the main notes window
                        NSApp.keyWindow?.close()
                        appState.shouldOpenNotesWindow = true
                    }
                }
                .font(.system(size: 13, weight: .medium))
                .buttonStyle(.plain)
                .foregroundColor(Theme.olive)
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 28)
        }
        .frame(width: 420, height: 360)
        .background(Theme.background)
    }
    
    private var welcomeStep: some View {
        VStack(spacing: 12) {
            Text("Welcome to Tap")
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
                .padding(.top, Theme.Spacing.titleTopPadding)
            
            Text("Tap captures meeting audio, transcribes it,\nand enhances your notes with AI.")
                .font(Theme.bodyFont())
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
            
            VStack(alignment: .leading, spacing: 8) {
                PermItem(label: "Microphone", detail: "Capture your voice", status: appState.permissionsManager.microphoneStatus)
                PermItem(label: "Screen Recording", detail: "Capture system audio (not your screen)", status: appState.permissionsManager.screenRecordingStatus)
            }
            .padding(.top, 8)
        }
    }
    
    private var apiKeyStep: some View {
        VStack(spacing: 12) {
            Text("API Keys")
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
                .padding(.top, Theme.Spacing.titleTopPadding)
            
            Text("Add your keys to enable transcription\nand note enhancement.")
                .font(Theme.bodyFont())
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
            
            VStack(alignment: .leading, spacing: 10) {
                KeyField(label: "OpenAI", placeholder: "sk-…", keychainKey: Constants.Keychain.openAIAPIKey)
                KeyField(label: "Deepgram", placeholder: "API key (optional for now)", keychainKey: Constants.Keychain.deepgramAPIKey)
            }
            .frame(maxWidth: 280)
            .padding(.top, 8)
        }
    }
    
    private func requestPermissions() {
        let pm = appState.permissionsManager
        Task {
            _ = await pm.requestMicrophone()
            pm.requestScreenRecording()
            _ = await pm.requestNotifications()
            _ = await pm.requestCalendar()
            await MainActor.run { withAnimation { step = 1 } }
        }
    }
}

private struct PermItem: View {
    let label: String; let detail: String; let status: PermissionStatus
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: status == .granted ? "checkmark.circle" : "circle")
                .font(.system(size: 12))
                .foregroundColor(status == .granted ? .green : Theme.textQuaternary)
            VStack(alignment: .leading, spacing: 0) {
                Text(label).font(.system(size: 12, weight: .medium)).foregroundColor(Theme.textPrimary)
                Text(detail).font(.system(size: 11)).foregroundColor(Theme.textTertiary)
            }
        }
    }
}

private struct KeyField: View {
    let label: String; let placeholder: String; let keychainKey: String
    @State private var value = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.system(size: 11, weight: .medium)).foregroundColor(Theme.textSecondary)
            SecureField(placeholder, text: $value)
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 12, design: .monospaced))
                .onChange(of: value) { _, v in
                    if !v.isEmpty { KeychainHelper.set(key: keychainKey, value: v) }
                }
        }
    }
}
