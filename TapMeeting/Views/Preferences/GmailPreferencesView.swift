import SwiftUI

/// Preferences section for managing Gmail connections.
/// Primary account is Supabase-managed; additional accounts use loopback OAuth.
struct GmailPreferencesView: View {
    
    @Environment(AppState.self) private var appState
    
    private var gmail: GmailService {
        appState.gmailService
    }
    
    var body: some View {
        VStack(spacing: 16) {
            // Connected Accounts
            SettingsCard(
                title: "Gmail Accounts",
                subtitle: "Your primary account is connected via Supabase. You can add additional Gmail accounts below."
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
                                SettingsStatusRow(
                                    icon: "envelope.fill",
                                    title: "Gmail (Primary)",
                                    subtitle: account.email,
                                    status: .connected
                                )
                            } else {
                                HStack(spacing: 12) {
                                    ZStack {
                                        RoundedRectangle(cornerRadius: 6)
                                            .fill(Theme.sidebarSelection)
                                            .frame(width: 32, height: 32)
                                        Image(systemName: "envelope")
                                            .font(.system(size: 13))
                                            .foregroundColor(Theme.textSecondary)
                                    }
                                    
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(account.email)
                                            .font(.system(size: 13, weight: .medium))
                                            .foregroundColor(Theme.textPrimary)
                                        Text("Additional account")
                                            .font(.system(size: 11))
                                            .foregroundColor(Theme.textTertiary)
                                    }
                                    
                                    Spacer()
                                    
                                    Button {
                                        gmail.disconnect(accountId: account.id)
                                    } label: {
                                        Text("Remove")
                                            .font(.system(size: 11, weight: .medium))
                                            .foregroundColor(Theme.recording)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
                
                // Add Another Account button
                Button {
                    gmail.signInAdditionalAccount()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus.circle")
                            .font(.system(size: 12))
                        Text("Add Another Google Account")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Theme.textSecondary)
                    .padding(.vertical, 6)
                    .padding(.horizontal, 12)
                    .background(Theme.sidebarSelection)
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                .disabled(gmail.isAuthenticating)
                
                HStack(spacing: 6) {
                    Image(systemName: "info.circle")
                        .font(.system(size: 10))
                        .foregroundColor(Theme.textQuaternary)
                    Text("To reconnect your primary account, sign out and sign back in from the Account section.")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textTertiary)
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
