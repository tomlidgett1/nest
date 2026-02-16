import SwiftUI

/// Preferences section for managing calendar connections.
/// Primary Google Calendar is Supabase-managed; additional accounts use loopback OAuth.
struct CalendarPreferencesView: View {
    
    @Environment(AppState.self) private var appState
    
    private var googleCal: GoogleCalendarService {
        appState.googleCalendarService
    }
    
    private var gmail: GmailService {
        appState.gmailService
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
                        
                        if googleCal.isSupabaseAccount(account) {
                            SettingsStatusRow(
                                icon: "checkmark.circle.fill",
                                title: "Google Calendar (Primary)",
                                subtitle: account.email,
                                status: .connected
                            )
                        } else {
                            HStack(spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 6)
                                        .fill(Theme.sidebarSelection)
                                        .frame(width: 32, height: 32)
                                    Image(systemName: "calendar")
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
                                    googleCal.disconnect(accountId: account.id)
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
                
                // Add Another Account button (uses Gmail's combined OAuth flow)
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
            }
            
            // Google integration info
            SettingsCard(title: "Google Integration") {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.shield")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.olive)
                        Text("Your primary Google account is managed through Supabase auth.")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.textSecondary)
                    }
                    HStack(spacing: 6) {
                        Image(systemName: "info.circle")
                            .font(.system(size: 10))
                            .foregroundColor(Theme.textQuaternary)
                        Text("To reconnect your primary account, sign out and sign back in from the Account section.")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.textTertiary)
                    }
                    
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
    }
}
