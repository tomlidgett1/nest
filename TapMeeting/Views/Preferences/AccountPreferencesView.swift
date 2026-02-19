import SwiftUI

struct AccountPreferencesView: View {

    @Environment(SupabaseService.self) private var supabaseService
    @Environment(AppState.self) private var appState

    @State private var showDeleteConfirmation = false
    @State private var deleteConfirmationEmail = ""
    @State private var isDeleting = false
    @State private var deleteError: String?

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
                    Task {
                        appState.resetServicesForSignOut()
                        await supabaseService.signOut()
                    }
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

                Button {
                    showDeleteConfirmation = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "trash")
                            .font(.system(size: 11))
                        Text("Delete Account")
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
                title: "AI Services",
                subtitle: "AI features are available automatically when signed in. API keys are managed securely on the server."
            ) {
                VStack(spacing: 10) {
                    APIStatusRow(icon: "waveform", name: "Deepgram", description: "Real-time transcription", isConfigured: supabaseService.isAuthenticated)
                    APIStatusRow(icon: "brain", name: "OpenAI", description: "Note enhancement & tagging", isConfigured: supabaseService.isAuthenticated)
                    APIStatusRow(icon: "sparkles", name: "Anthropic", description: "AI email drafts", isConfigured: supabaseService.isAuthenticated)
                }
            }
        }
        .alert("Delete Account", isPresented: $showDeleteConfirmation) {
            TextField("Type your email to confirm", text: $deleteConfirmationEmail)
            Button("Cancel", role: .cancel) {
                deleteConfirmationEmail = ""
                deleteError = nil
            }
            Button("Delete", role: .destructive) {
                Task { await deleteAccount() }
            }
            .disabled(deleteConfirmationEmail.lowercased() != (supabaseService.currentUserEmail ?? "").lowercased())
        } message: {
            if let deleteError {
                Text(deleteError)
            } else {
                Text("This will permanently delete your account and all data. Type your email address to confirm.")
            }
        }
    }

    private func deleteAccount() async {
        guard let email = supabaseService.currentUserEmail,
              deleteConfirmationEmail.lowercased() == email.lowercased() else {
            deleteError = "Email does not match your account."
            showDeleteConfirmation = true
            return
        }

        isDeleting = true
        deleteError = nil

        guard let jwt = await supabaseService.supabaseAccessTokenForFunctionCall() else {
            deleteError = "Could not authenticate. Please try again."
            isDeleting = false
            showDeleteConfirmation = true
            return
        }

        let urlString = "\(Constants.Supabase.functionsBaseURL)/delete-account"
        guard let url = URL(string: urlString) else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["confirmation": email])

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0

            if status == 200 {
                await MainActor.run {
                    deleteConfirmationEmail = ""
                    isDeleting = false
                }
                appState.resetServicesForSignOut()
                await supabaseService.signOut()
            } else {
                let body = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
                let detail = body["detail"] as? String ?? body["error"] as? String ?? "Deletion failed."
                await MainActor.run {
                    deleteError = detail
                    isDeleting = false
                    showDeleteConfirmation = true
                }
            }
        } catch {
            await MainActor.run {
                deleteError = error.localizedDescription
                isDeleting = false
                showDeleteConfirmation = true
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
