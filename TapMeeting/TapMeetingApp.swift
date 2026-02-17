import SwiftUI
import SwiftData
import Sparkle

/// Nest — a macOS app for meeting notes.
/// Runs as a regular dock app with a menu bar extra for quick access.
/// Entry point configures auth gate, main notes window, MenuBarExtra, and app-wide state.
@main
struct TapMeetingApp: App {

    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    private let modelContainer = DataController.shared
    @StateObject private var updaterService = UpdaterService()

    @State private var appState: AppState
    @State private var supabaseService = SupabaseService()

    init() {
        let container = DataController.shared
        // Use mainContext — it lives as long as the container.
        // Creating a local ModelContext(container) would be deallocated
        // after init() returns, causing EXC_BAD_ACCESS.
        _appState = State(wrappedValue: AppState(modelContext: container.mainContext))
    }

    var body: some Scene {
        let _ = connectUpdaterToAppState()

        // MARK: - Menu Bar

        MenuBarExtra {
            if supabaseService.isAuthenticated {
                MenuBarView()
                    .environment(appState)
                    .environment(supabaseService)
                    .modelContainer(modelContainer)
            }
        } label: {
            MenuBarLabel(isRecording: appState.isMeetingActive)
        }
        .menuBarExtraStyle(.window)

        // MARK: - Notes Window (Cmd+1)

        Window("", id: "notes-window") {
            AuthGateView {
                NotesListView()
            }
            .environmentObject(updaterService)
            .environment(appState)
            .environment(supabaseService)
            .modelContainer(modelContainer)
            .onOpenURL { url in
                Task { await supabaseService.handleOAuthCallback(url) }
            }
            .task(id: supabaseService.isAuthenticated) {
                if supabaseService.isAuthenticated {
                    await initializeAfterAuth()
                }
            }
        }
        .keyboardShortcut("1", modifiers: .command)
        .defaultSize(width: 800, height: 600)
        .windowToolbarStyle(.unified)

        // MARK: - Preferences Window

        Window("Settings", id: "preferences-window") {
            AuthGateView {
                PreferencesView()
            }
            .environmentObject(updaterService)
            .environment(appState)
            .environment(supabaseService)
            .modelContainer(modelContainer)
        }
        .keyboardShortcut(",", modifiers: .command)
        .defaultSize(width: 580, height: 640)
        .windowResizability(.contentSize)

        // MARK: - Onboarding Window

        Window("Welcome to Nest", id: "onboarding-window") {
            OnboardingView()
                .environment(appState)
                .environment(supabaseService)
        }
        .windowResizability(.contentSize)
        .defaultPosition(.center)
        .commands {
            CommandGroup(after: .appInfo) {
                CheckForUpdatesView(updaterService: updaterService)
            }
        }
    }

    /// Gives the updater a reference to AppState so it can check meeting status.
    private func connectUpdaterToAppState() {
        if updaterService.appState == nil {
            updaterService.appState = appState
        }
    }

    /// Called once after successful authentication to wire up sync and migrate data.
    @MainActor
    private func initializeAfterAuth() async {
        // Create sync service and attach to app state
        let syncService = SyncService(
            client: supabaseService.client,
            modelContext: modelContainer.mainContext
        )
        appState.syncService = syncService
        appState.supabaseService = supabaseService

        // Migrate existing local data (one-time)
        await syncService.migrateLocalData()

        // Pull latest from Supabase
        await syncService.fullSync()

        // Build semantic index before enabling assistant flows
        await appState.runSemanticBackfillIfNeeded()
    }
}

// MARK: - Auth Gate

/// Shows LoginView when not authenticated, otherwise shows the wrapped content.
private struct AuthGateView<Content: View>: View {
    @Environment(SupabaseService.self) private var supabaseService
    @ViewBuilder let content: () -> Content

    var body: some View {
        if supabaseService.isAuthenticated {
            content()
        } else {
            LoginView()
        }
    }
}

// MARK: - Menu Bar Label

/// The icon displayed in the macOS menu bar.
/// Shows a red dot overlay when recording.
private struct MenuBarLabel: View {
    let isRecording: Bool

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Image(systemName: "bird.fill")
                .symbolRenderingMode(.hierarchical)

            if isRecording {
                Circle()
                    .fill(.red)
                    .frame(width: 6, height: 6)
                    .offset(x: 2, y: -2)
            }
        }
    }
}
