import SwiftUI

/// Preferences section for managing Gmail connections.
/// Supports multiple Gmail accounts. Reuses the same Google Cloud credentials
/// configured in the Calendar section.
struct GmailPreferencesView: View {
    
    @Environment(AppState.self) private var appState
    
    private var gmail: GmailService {
        appState.gmailService
    }
    
    /// Whether any legacy (non-Supabase) accounts exist.
    private var hasLegacyAccounts: Bool {
        gmail.accounts.contains { !gmail.isSupabaseAccount($0) }
    }
    
    var body: some View {
        VStack(spacing: 16) {
            // Connected Accounts
            SettingsCard(
                title: "Gmail Accounts",
                subtitle: "Your primary account is connected via sign-in. You can add more accounts using Google OAuth credentials."
            ) {
                VStack(spacing: 0) {
                    if gmail.accounts.isEmpty {
                        HStack(spacing: 12) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(Theme.sidebarSelection)
                                    .frame(width: 32, height: 32)
                                Image(systemName: "envelope")
                                    .font(.system(size: 13))
                                    .foregroundColor(Theme.textTertiary)
                            }
                            
                            Text("No Gmail accounts connected")
                                .font(.system(size: 13))
                                .foregroundColor(Theme.textTertiary)
                            
                            Spacer()
                        }
                    } else {
                        ForEach(Array(gmail.accounts.enumerated()), id: \.element.id) { index, account in
                            if index > 0 {
                                Rectangle()
                                    .fill(Theme.divider)
                                    .frame(height: 1)
                                    .padding(.vertical, 12)
                            }
                            
                            if gmail.isSupabaseAccount(account) {
                                // Primary Supabase account — cannot be disconnected independently
                                SettingsStatusRow(
                                    icon: "envelope.fill",
                                    title: "Gmail (Primary)",
                                    subtitle: account.email,
                                    status: .connected
                                )
                            } else {
                                // Additional account — can be disconnected
                                SettingsStatusRow(
                                    icon: "envelope.fill",
                                    title: "Gmail",
                                    subtitle: account.email,
                                    status: .connected,
                                    action: { gmail.disconnect(accountId: account.id) },
                                    actionLabel: "Disconnect"
                                )
                            }
                        }
                    }
                }
                
                // Add additional account button
                Button {
                    gmail.signIn()
                } label: {
                    HStack(spacing: 6) {
                        if gmail.isAuthenticating {
                            ProgressView()
                                .controlSize(.small)
                            Text("Connecting…")
                        } else {
                            Image(systemName: "envelope.badge.person.crop")
                                .font(.system(size: 12))
                            Text(gmail.accounts.isEmpty
                                 ? "Connect Gmail"
                                 : "Add Another Gmail Account")
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
                .disabled(gmail.isAuthenticating || !gmail.hasCredentials)
                .padding(.top, 4)
                
                if !gmail.hasCredentials {
                    HStack(spacing: 6) {
                        Image(systemName: "info.circle")
                            .font(.system(size: 10))
                            .foregroundColor(Theme.textQuaternary)
                        Text("To add another account, configure Google OAuth credentials in the Calendars section first.")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                
                if let error = gmail.authError {
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
}
