import SwiftUI

/// Preferences section for managing calendar connections.
/// Supports multiple Google Calendar accounts and shows Apple Calendar status.
struct CalendarPreferencesView: View {
    
    @Environment(AppState.self) private var appState
    @State private var clientID: String = ""
    @State private var clientSecret: String = ""
    @State private var showCredentialsField = false
    
    private var googleCal: GoogleCalendarService {
        appState.googleCalendarService
    }
    
    var body: some View {
        VStack(spacing: 16) {
            // Connected Calendars
            SettingsCard(
                title: "Connected Calendars",
                subtitle: "Connect your calendars to automatically detect upcoming meetings."
            ) {
                VStack(spacing: 0) {
                    // Apple Calendar — always present
                    SettingsStatusRow(
                        icon: "calendar",
                        title: "Apple Calendar",
                        subtitle: "Reads from all system calendars automatically",
                        status: .active
                    )
                    
                    // Google Calendar accounts
                    ForEach(googleCal.accounts, id: \.id) { account in
                        Rectangle()
                            .fill(Theme.divider)
                            .frame(height: 1)
                            .padding(.vertical, 12)
                        
                        SettingsStatusRow(
                            icon: "checkmark.circle.fill",
                            title: "Google Calendar",
                            subtitle: account.email,
                            status: .connected,
                            action: { googleCal.disconnect(accountId: account.id) },
                            actionLabel: "Disconnect"
                        )
                    }
                }
            }
            
            // Google Credentials
            SettingsCard(title: "Google Integration") {
                VStack(alignment: .leading, spacing: 12) {
                    // Credentials toggle
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            showCredentialsField.toggle()
                        }
                    } label: {
                        HStack(spacing: 6) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(Theme.olive.opacity(0.08))
                                    .frame(width: 32, height: 32)
                                Image(systemName: "key")
                                    .font(.system(size: 13))
                                    .foregroundColor(Theme.olive)
                            }
                            
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Google Cloud Credentials")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundColor(Theme.textPrimary)
                                Text("Required for Google Calendar and Gmail integration")
                                    .font(.system(size: 11))
                                    .foregroundColor(Theme.textTertiary)
                            }
                            
                            Spacer()
                            
                            Image(systemName: showCredentialsField ? "chevron.up" : "chevron.down")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(Theme.textTertiary)
                        }
                    }
                    .buttonStyle(.plain)
                    
                    if showCredentialsField {
                        VStack(alignment: .leading, spacing: 10) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("OAuth Client ID (Desktop app)")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(Theme.textSecondary)
                                
                                TextField("xxxxx.apps.googleusercontent.com", text: $clientID)
                                    .textFieldStyle(.plain)
                                    .font(.system(size: 11, design: .monospaced))
                                    .padding(8)
                                    .background(Theme.background)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 6)
                                            .stroke(Theme.divider, lineWidth: 1)
                                    )
                                    .cornerRadius(6)
                            }
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text("OAuth Client Secret")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(Theme.textSecondary)
                                
                                SecureField("GOCSPX-xxxxx", text: $clientSecret)
                                    .textFieldStyle(.plain)
                                    .font(.system(size: 11, design: .monospaced))
                                    .padding(8)
                                    .background(Theme.background)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 6)
                                            .stroke(Theme.divider, lineWidth: 1)
                                    )
                                    .cornerRadius(6)
                            }
                            
                            HStack(spacing: 6) {
                                Image(systemName: "info.circle")
                                    .font(.system(size: 10))
                                    .foregroundColor(Theme.textQuaternary)
                                Text("Create at console.cloud.google.com → APIs & Services → Credentials")
                                    .font(.system(size: 10))
                                    .foregroundColor(Theme.textQuaternary)
                            }
                            
                            if !clientID.isEmpty && !clientSecret.isEmpty {
                                Button("Save Credentials") {
                                    googleCal.setClientID(clientID.trimmingCharacters(in: .whitespaces))
                                    googleCal.setClientSecret(clientSecret.trimmingCharacters(in: .whitespaces))
                                }
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.white)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 6)
                                .background(Theme.olive)
                                .cornerRadius(6)
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(14)
                        .background(Theme.background)
                        .cornerRadius(8)
                    }
                    
                    // Add account button
                    Button {
                        googleCal.signIn()
                    } label: {
                        HStack(spacing: 6) {
                            if googleCal.isAuthenticating {
                                ProgressView()
                                    .controlSize(.small)
                                Text("Connecting…")
                            } else {
                                Image(systemName: "calendar.badge.plus")
                                    .font(.system(size: 12))
                                Text(googleCal.accounts.isEmpty
                                     ? "Connect Google Calendar"
                                     : "Add Another Google Account")
                            }
                        }
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(Theme.olive)
                        .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                    .disabled(googleCal.isAuthenticating)
                    
                    if let error = googleCal.authError {
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
        }
        .onAppear {
            clientID = KeychainHelper.get(key: Constants.Keychain.googleClientID) ?? ""
            clientSecret = KeychainHelper.get(key: Constants.Keychain.googleClientSecret) ?? ""
        }
    }
}
