import SwiftUI

struct AccountPreferencesView: View {

    @Environment(SupabaseService.self) private var supabaseService

    var body: some View {
        VStack(spacing: 16) {
            // Account info
            SettingsCard(
                title: "Account",
                subtitle: "Signed in via Google. All data syncs to the cloud automatically."
            ) {
                HStack(spacing: 12) {
                    // Avatar
                    ZStack {
                        Circle()
                            .fill(Theme.olive.opacity(0.1))
                            .frame(width: 40, height: 40)
                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 28))
                            .foregroundColor(Theme.olive.opacity(0.6))
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        if let name = supabaseService.currentUserDisplayName, !name.isEmpty {
                            Text(name)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(Theme.textPrimary)
                        }
                        if let email = supabaseService.currentUserEmail {
                            Text(email)
                                .font(.system(size: 12))
                                .foregroundColor(Theme.textSecondary)
                        }
                    }

                    Spacer()

                    // Sync status
                    HStack(spacing: 4) {
                        Circle()
                            .fill(Color(red: 0.30, green: 0.69, blue: 0.31))
                            .frame(width: 6, height: 6)
                        Text("Connected")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Color(red: 0.30, green: 0.69, blue: 0.31))
                    }
                }

                Rectangle()
                    .fill(Theme.divider)
                    .frame(height: 1)
                    .padding(.vertical, 4)

                // Services connected via Google sign-in
                VStack(alignment: .leading, spacing: 8) {
                    ServiceRow(icon: "calendar", name: "Google Calendar", detail: "Events sync automatically")
                    ServiceRow(icon: "envelope", name: "Gmail", detail: "Email access via your Google account")
                }

                Rectangle()
                    .fill(Theme.divider)
                    .frame(height: 1)
                    .padding(.vertical, 4)

                // Sign out
                Button {
                    Task { await supabaseService.signOut() }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .font(.system(size: 11))
                        Text("Sign Out")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.red.opacity(0.8))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(Color.red.opacity(0.06))
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
            }

            // API Keys info
            SettingsCard(
                title: "API Keys",
                subtitle: "API keys for transcription and AI features are managed automatically. No configuration needed."
            ) {
                VStack(spacing: 10) {
                    APIStatusRow(icon: "waveform", name: "Deepgram", description: "Real-time transcription", isConfigured: supabaseService.deepgramAPIKey != nil)
                    APIStatusRow(icon: "brain", name: "OpenAI", description: "Note enhancement & tagging", isConfigured: supabaseService.openAIAPIKey != nil)
                    APIStatusRow(icon: "sparkles", name: "Anthropic", description: "AI email drafts", isConfigured: supabaseService.anthropicAPIKey != nil)
                }
            }
        }
    }
}

// MARK: - Service Row

private struct ServiceRow: View {
    let icon: String
    let name: String
    let detail: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundColor(Theme.olive)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 1) {
                Text(name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                Text(detail)
                    .font(.system(size: 10))
                    .foregroundColor(Theme.textTertiary)
            }
        }
    }
}

// MARK: - API Status Row

private struct APIStatusRow: View {
    let icon: String
    let name: String
    let description: String
    let isConfigured: Bool

    var body: some View {
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

                    if isConfigured {
                        HStack(spacing: 3) {
                            Circle()
                                .fill(Color(red: 0.30, green: 0.69, blue: 0.31))
                                .frame(width: 5, height: 5)
                            Text("Active")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(Color(red: 0.30, green: 0.69, blue: 0.31))
                        }
                    } else {
                        Text("Not configured")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(Theme.textQuaternary)
                    }
                }

                Text(description)
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textTertiary)
            }

            Spacer()
        }
    }
}
