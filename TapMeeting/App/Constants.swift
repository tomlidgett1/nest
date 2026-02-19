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
        static let endpointingMs = 300
    }
    
    // MARK: - AI
    
    enum AI {
        // Model identifiers (sent in request bodies via the proxy)
        static let enhancementModel = "gpt-5.2"
        static let autoTaggingModel = "gpt-4.1-mini"
        static let semanticChatModel = "gpt-4.1"
        static let embeddingModel = "text-embedding-3-large"
        static let anthropicModel = "claude-opus-4-6"
        static let anthropicSonnetModel = "claude-sonnet-4-5"
        
        // Token limits
        static let maxEnhancementTokens = 4096
        static let maxTaggingTokens = 512
        static let maxEmailReplyTokens = 1024
        static let maxEmailComposeTokens = 1536
        static let maxEmailFollowUpTokens = 2048
        static let maxStyleAnalysisTokens = 4096
        static let maxSummariseTokens = 1024
        static let maxClassifyTokens = 256
        static let maxTodoExtractionTokens = 1024
        static let maxSemanticAnswerTokens = 2500
        /// Fast model for query rewriting, reranking, and entity extraction.
        static let queryRewriteModel = "gpt-4.1-mini"
        static let maxQueryRewriteTokens = 256
        static let maxCatchUpTokens = 1024
    }

    // MARK: - Search

    enum Search {
        /// Target chunk size in characters (~500 tokens for embedding-3-large).
        static let maxChunkCharacters = 2000
        /// Overlap between adjacent chunks (15% of maxChunkCharacters).
        static let chunkOverlapCharacters = 300
        /// Maximum chunks to create from a single source document.
        static let maxChunksPerSource = 64
        /// Maximum characters for document-level summaries.
        static let maxSummaryCharacters = 2000
        /// Maximum search results returned from the database.
        static let maxSearchResults = 30
        /// Minimum citations required before displaying a response.
        static let minimumCitationCount = 2
        /// Maximum evidence blocks sent to the LLM for RAG generation.
        static let maxEvidenceBlocks = 12
        /// Maximum characters per evidence block sent to the LLM.
        static let maxEvidenceBlockCharacters = 1200
        /// RRF constant (k) for Reciprocal Rank Fusion scoring.
        static let rrfK = 60
        /// Chunking strategy version — increment to trigger re-indexing of all content.
        static let chunkingVersion = "v2"
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
    
    // MARK: - Supabase

    enum Supabase {
        static let url = "https://ynoidbjupfcaaymzbtic.supabase.co"
        static let anonKey = "sb_publishable_TzLkFY46beB_8tQShPUU5g_d668i6ZR"
        static let functionsBaseURL = "\(url)/functions/v1"
        static let googleTokenBrokerPath = "\(functionsBaseURL)/google-token-broker"
        static let aiProxyPath = "\(functionsBaseURL)/ai-proxy"
        static let deepgramTokenPath = "\(functionsBaseURL)/deepgram-token"
        static let redirectScheme = "nest"
        static let redirectURL = "nest://auth/callback"
        /// Google OAuth query params required to obtain/rotate refresh tokens.
        static let googleOAuthQueryParams: [(String, String?)] = [
            ("access_type", "offline"),
            ("prompt", "consent"),
            ("include_granted_scopes", "true")
        ]
        /// Combined Google OAuth scopes requested during Supabase sign-in.
        /// Covers: Calendar (read + write), Gmail (modify + send), Contacts (autocomplete).
        static let googleScopes = "email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/contacts https://www.googleapis.com/auth/contacts.other.readonly"
    }

    // MARK: - Google Calendar

    enum GoogleCalendar {
        static let calendarAPIBase = "https://www.googleapis.com/calendar/v3"
        static let calendarListEndpoint = "\(calendarAPIBase)/users/me/calendarList"
        static let authURL = "https://accounts.google.com/o/oauth2/v2/auth"
        static let tokenURL = "https://oauth2.googleapis.com/token"
        static let redirectURI = "http://localhost:8234"
        static let loopbackPort: UInt16 = 8234
        static let scopes = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events"
        /// Interval in seconds between automatic calendar event refreshes.
        static let pollingInterval: TimeInterval = 300
    }

    // MARK: - Gmail

    enum Gmail {
        static let apiBase = "https://gmail.googleapis.com/gmail/v1"
        static let peopleAPIBase = "https://people.googleapis.com/v1"
        static let authURL = "https://accounts.google.com/o/oauth2/v2/auth"
        static let tokenURL = "https://oauth2.googleapis.com/token"
        static let redirectURI = "http://localhost:8235"
        static let loopbackPort: UInt16 = 8235
        static let scopes = "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/contacts https://www.googleapis.com/auth/contacts.other.readonly"
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
        static let emailEncryptionKey = "email_encryption_key"
        static let googleAccessToken = "google_access_token"
        static let googleRefreshToken = "google_refresh_token"
        static let googleClientID = "google_client_id"
        static let googleClientSecret = "google_client_secret"
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

        // To-Dos
        static let processedTodoEmailMessageIds = "processedTodoEmailMessageIds"
        /// JSON-encoded array of excluded sender emails (no to-dos will be created from these senders).
        static let todoExcludedSenders = "todoExcludedSenders"
        /// JSON-encoded array of excluded email category raw values (e.g. "meeting_invites").
        static let todoExcludedCategories = "todoExcludedCategories"
        
        // Gmail Notifications
        /// JSON-encoded map of accountId -> known unread inbox thread IDs.
        static let gmailNotificationBaselineUnreadIds = "gmailNotificationBaselineUnreadIds"
        /// True once inbox baseline has been seeded for the current account set.
        static let gmailNotificationBaselineSeeded = "gmailNotificationBaselineSeeded"
        /// Sorted account signature used to detect account-set changes and reseed baseline.
        static let gmailNotificationAccountSignature = "gmailNotificationAccountSignature"
        /// Last successful baseline update timestamp.
        static let gmailNotificationBaselineUpdatedAt = "gmailNotificationBaselineUpdatedAt"
        
        // Calendar View
        static let calendarVisibilityState = "calendarVisibilityState"
        static let calendarViewMode = "calendarViewMode"

        // Supabase
        static let hasCompletedSupabaseMigration = "hasCompletedSupabaseMigration"
        static let hasCompletedSemanticBackfill = "hasCompletedSemanticBackfill"
        static let semanticBackfillProgress = "semanticBackfillProgress"
        /// Chunking version that was used for the last backfill. If this differs from
        /// `Constants.Search.chunkingVersion`, a re-index is triggered automatically.
        static let lastBackfillChunkingVersion = "lastBackfillChunkingVersion"

        // Backfill Scope
        /// JSON-encoded array of Gmail account IDs selected for semantic backfill.
        /// If empty/nil, no email threads are backfilled.
        static let backfillEmailAccountIds = "backfillEmailAccountIds"
        /// Number of days of email history to include in backfill.
        static let backfillEmailDays = "backfillEmailDays"
    }

    enum Backfill {
        /// Default number of days of email history to include in backfill.
        static let defaultEmailDays = 45
    }
}
