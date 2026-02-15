import Foundation

/// App-wide constants and configuration values.
enum Constants {
    
    // MARK: - App Info
    
    static let appName = "Nest"
    static let bundleIdentifier = "Tap.TapMeeting"
    
    // MARK: - Audio
    
    enum Audio {
        static let sampleRate: Double = 16_000
        /// Per-source channel count (each source is mono).
        static let channels: UInt32 = 1
        /// Combined stereo channel count for multichannel Deepgram.
        static let multichannelCount: UInt32 = 2
        static let bitDepth: UInt32 = 16
        /// Maximum seconds of PCM to buffer during WebSocket reconnect.
        static let reconnectBufferLimit: TimeInterval = 30
        /// Silence duration (seconds) to trigger meeting end when no calendar context.
        static let silenceTimeoutNoCalendar: TimeInterval = 120
        /// Silence duration (seconds) after calendar event ends.
        static let silenceTimeoutWithCalendar: TimeInterval = 30
        /// Grace period (seconds) before auto-ending after silence notification.
        static let autoEndGracePeriod: TimeInterval = 10
    }
    
    // MARK: - Transcription
    
    enum Transcription {
        static let model = "nova-2-meeting"
        static let language = "en"
        static let endpointingMs = 600
    }
    
    // MARK: - AI
    
    enum AI {
        static let enhancementModel = "gpt-4.1"
        static let autoTaggingModel = "gpt-4.1-mini"
        static let responsesEndpoint = "https://api.openai.com/v1/responses"
        static let maxEnhancementTokens = 4096
        static let maxTaggingTokens = 512
        
        // Anthropic (Email AI)
        static let anthropicModel = "claude-sonnet-4-5-20250929"
        static let anthropicEndpoint = "https://api.anthropic.com/v1/messages"
        static let anthropicVersion = "2023-06-01"
        static let maxEmailReplyTokens = 1024
        static let maxEmailComposeTokens = 1536
        static let maxEmailFollowUpTokens = 2048
        static let maxStyleAnalysisTokens = 4096
        static let maxSummariseTokens = 1024
        static let maxClassifyTokens = 256
    }
    
    // MARK: - Calendar
    
    enum Calendar {
        /// Minutes before a meeting to send the reminder notification.
        static let reminderLeadMinutes = 1
        /// Minimum attendee count to trigger auto-prompt.
        static let minimumAttendees = 2
    }
    
    // MARK: - Meeting Apps
    
    /// Bundle identifiers of known meeting apps for system audio filtering.
    static let meetingAppBundleIDs: Set<String> = [
        "us.zoom.xos",
        "com.google.Chrome",           // Google Meet runs in browser
        "com.microsoft.teams2",
        "com.microsoft.teams",
        "com.apple.FaceTime",
        "com.cisco.webexmeetingsapp"
    ]
    
    // MARK: - Google Calendar
    
    enum GoogleCalendar {
        /// OAuth 2.0 Client ID — create one at https://console.cloud.google.com
        /// Type: "Desktop app" under OAuth 2.0 Client IDs.
        static let clientID = ""  // User must fill this in
        static let authURL = "https://accounts.google.com/o/oauth2/v2/auth"
        static let tokenURL = "https://oauth2.googleapis.com/token"
        static let calendarAPIBase = "https://www.googleapis.com/calendar/v3"
        static let scopes = "https://www.googleapis.com/auth/calendar.readonly"
        /// Redirect URI for desktop OAuth flow (loopback).
        static let redirectURI = "http://127.0.0.1:8234/callback"
        static let loopbackPort: UInt16 = 8234
    }
    
    // MARK: - Gmail
    
    enum Gmail {
        static let authURL = "https://accounts.google.com/o/oauth2/v2/auth"
        static let tokenURL = "https://oauth2.googleapis.com/token"
        static let apiBase = "https://gmail.googleapis.com/gmail/v1"
        static let peopleAPIBase = "https://people.googleapis.com/v1"
        /// Gmail + Contacts scopes. Contacts scopes enable recipient autocomplete via the People API.
        /// Note: existing users may need to re-authenticate to grant the new contacts scopes.
        static let scopes = "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send email https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly"
        /// Redirect URI for desktop OAuth flow (loopback) — uses a different port to Calendar.
        static let redirectURI = "http://127.0.0.1:8235/callback"
        static let loopbackPort: UInt16 = 8235
    }
    
    // MARK: - Slack
    
    enum Slack {
        /// OAuth 2.0 Client ID — from your Slack app's Basic Information page.
        /// Create a Slack app at https://api.slack.com/apps, then copy the Client ID.
        static let clientID = "9142425420240.10497488846983"  // Fill this in with your Slack app Client ID
        /// OAuth 2.0 Client Secret — from your Slack app's Basic Information page.
        static let clientSecret = "2d6d1285cc74bd76b652da374c13d904"  // Fill this in with your Slack app Client Secret
        /// OAuth 2.0 authorize URL — user is redirected here to grant permission.
        /// Reference: https://docs.slack.dev/authentication/installing-with-oauth
        static let authURL = "https://slack.com/oauth/v2/authorize"
        /// Token exchange URL — POST to exchange code for access token.
        /// Reference: https://docs.slack.dev/reference/methods/oauth.v2.access
        static let tokenURL = "https://slack.com/api/oauth.v2.access"
        /// Slack Web API base URL.
        static let apiBase = "https://slack.com/api"
        /// User-level scopes for reading conversations and messages.
        /// Reference: https://docs.slack.dev/apis/web-api/using-the-conversations-api
        /// - channels:read + channels:history — public channels
        /// - groups:read + groups:history — private channels
        /// - im:read + im:history — direct messages
        /// - mpim:read + mpim:history — group direct messages
        /// - users:read — resolve user IDs to display names
        static let userScopes = "channels:read,channels:history,groups:read,groups:history,im:read,im:history,mpim:read,mpim:history,users:read"
        /// Redirect URI — an HTTPS page on firegrid.co that redirects to the
        /// `tapmeeting://` custom URL scheme so the native app can receive the code.
        static let redirectURI = "https://firegrid.co/slack/callback"
    }
    
    // MARK: - Keychain
    
    enum Keychain {
        static let service = "com.tap.meeting"
        static let deepgramAPIKey = "deepgram_api_key"
        static let openAIAPIKey = "openai_api_key"
        static let anthropicAPIKey = "anthropic_api_key"
        static let googleAccessToken = "google_access_token"
        static let googleRefreshToken = "google_refresh_token"
        static let googleClientID = "google_client_id"
        static let googleClientSecret = "google_client_secret"
        static let gmailAccessToken = "gmail_access_token"
        static let gmailRefreshToken = "gmail_refresh_token"
        static let slackUserToken = "slack_user_token"
    }
    
    // MARK: - Notifications
    
    enum Notifications {
        static let meetingReadyCategory = "MEETING_READY"
        static let meetingEndedCategory = "MEETING_ENDED"
        static let startAction = "START_NOTES"
        static let dismissAction = "DISMISS"
        static let enhanceAction = "ENHANCE"
    }
    
    // MARK: - UserDefaults Keys
    
    enum Defaults {
        static let launchAtLogin = "launchAtLogin"
        static let hasCompletedOnboarding = "hasCompletedOnboarding"
        static let captureSystemAudio = "captureSystemAudio"
        static let captureMicAudio = "captureMicAudio"
        /// Legacy single-account keys (migrated automatically).
        static let googleCalendarConnected = "googleCalendarConnected"
        static let googleCalendarEmail = "googleCalendarEmail"
        /// Multi-account: JSON-encoded array of GoogleCalendarAccount.
        static let googleCalendarAccounts = "googleCalendarAccounts"
        /// Multi-account: JSON-encoded array of GmailAccount.
        static let gmailAccounts = "gmailAccounts"
        
        // Slack
        static let slackAccount = "slackAccount"
        
        // AI Email
        static let globalEmailInstructions = "globalEmailInstructions"
        static let recentOneOffInstructions = "recentOneOffInstructions"
        static let defaultVariantCount = "defaultVariantCount"
        static let autoSuggestActions = "autoSuggestActions"
        static let styleProfileEnabled = "styleProfileEnabled"
    }
}
