import SwiftUI

struct AccountPreferencesView: View {
    
    @State private var openAIKey: String = ""
    @State private var deepgramKey: String = ""
    @State private var anthropicKey: String = ""
    @State private var saved = false
    
    var body: some View {
        VStack(spacing: 16) {
            SettingsCard(
                title: "API Keys",
                subtitle: "Add your API keys for transcription and AI features. Keys are stored securely in the macOS Keychain."
            ) {
                VStack(spacing: 16) {
                    // OpenAI
                    APIKeyField(
                        icon: "brain",
                        name: "OpenAI",
                        placeholder: "sk-…",
                        description: "Used for meeting note enhancement and auto-tagging.",
                        key: $openAIKey,
                        hasValue: !openAIKey.isEmpty
                    )
                    
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(height: 1)
                    
                    // Anthropic
                    APIKeyField(
                        icon: "sparkles",
                        name: "Anthropic",
                        placeholder: "sk-ant-…",
                        description: "Used for AI email drafts, compose, and style analysis.",
                        key: $anthropicKey,
                        hasValue: !anthropicKey.isEmpty
                    )
                    
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(height: 1)
                    
                    // Deepgram
                    APIKeyField(
                        icon: "waveform",
                        name: "Deepgram",
                        placeholder: "API key",
                        description: "Used for real-time meeting transcription.",
                        key: $deepgramKey,
                        hasValue: !deepgramKey.isEmpty
                    )
                }
                
                // Save button
                HStack(spacing: 10) {
                    Button {
                        KeychainHelper.set(key: Constants.Keychain.openAIAPIKey, value: openAIKey)
                        KeychainHelper.set(key: Constants.Keychain.anthropicAPIKey, value: anthropicKey)
                        KeychainHelper.set(key: Constants.Keychain.deepgramAPIKey, value: deepgramKey)
                        withAnimation(.easeInOut(duration: 0.2)) { saved = true }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            withAnimation(.easeInOut(duration: 0.2)) { saved = false }
                        }
                    } label: {
                        Text("Save All Keys")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 7)
                            .background(Theme.olive)
                            .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                    
                    if saved {
                        HStack(spacing: 4) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 12))
                            Text("Saved to Keychain")
                                .font(.system(size: 11, weight: .medium))
                        }
                        .foregroundColor(Color(red: 0.30, green: 0.69, blue: 0.31))
                        .transition(.opacity)
                    }
                }
                .padding(.top, 4)
            }
        }
        .onAppear {
            openAIKey = KeychainHelper.get(key: Constants.Keychain.openAIAPIKey) ?? ""
            anthropicKey = KeychainHelper.get(key: Constants.Keychain.anthropicAPIKey) ?? ""
            deepgramKey = KeychainHelper.get(key: Constants.Keychain.deepgramAPIKey) ?? ""
        }
    }
}

// MARK: - API Key Field

private struct APIKeyField: View {
    let icon: String
    let name: String
    let placeholder: String
    let description: String
    @Binding var key: String
    let hasValue: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Theme.olive.opacity(0.08))
                        .frame(width: 32, height: 32)
                    Image(systemName: icon)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.olive)
                }
                
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(name)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Theme.textPrimary)
                        
                        if hasValue {
                            HStack(spacing: 3) {
                                Circle()
                                    .fill(Color(red: 0.30, green: 0.69, blue: 0.31))
                                    .frame(width: 5, height: 5)
                                Text("Configured")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(Color(red: 0.30, green: 0.69, blue: 0.31))
                            }
                        }
                    }
                    
                    Text(description)
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textTertiary)
                }
                
                Spacer()
            }
            
            SecureField(placeholder, text: $key)
                .textFieldStyle(.plain)
                .font(.system(size: 12, design: .monospaced))
                .padding(8)
                .background(Theme.background)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Theme.divider, lineWidth: 1)
                )
                .cornerRadius(6)
        }
    }
}
