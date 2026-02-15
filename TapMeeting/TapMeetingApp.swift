import SwiftUI
import SwiftData

/// Tap — a macOS app for meeting notes.
/// Runs as a regular dock app with a menu bar extra for quick access.
/// Entry point configures the main notes window, MenuBarExtra, and app-wide state.
@main
struct TapMeetingApp: App {
    
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    
    private let modelContainer = DataController.shared
    
    @State private var appState: AppState
    
    init() {
        let container = DataController.shared
        // Use mainContext — it lives as long as the container.
        // Creating a local ModelContext(container) would be deallocated
        // after init() returns, causing EXC_BAD_ACCESS.
        _appState = State(wrappedValue: AppState(modelContext: container.mainContext))
    }
    
    var body: some Scene {
        // MARK: - Menu Bar
        
        MenuBarExtra {
            MenuBarView()
                .environment(appState)
                .modelContainer(modelContainer)
        } label: {
            MenuBarLabel(isRecording: appState.isMeetingActive)
        }
        .menuBarExtraStyle(.window)
        
        // MARK: - Notes Window (Cmd+1)
        
        Window("", id: "notes-window") {
            NotesListView()
                .environment(appState)
                .modelContainer(modelContainer)
        }
        .keyboardShortcut("1", modifiers: .command)
        .defaultSize(width: 800, height: 600)
        .windowToolbarStyle(.unifiedCompact)
        
        // MARK: - Preferences Window
        
        Window("Settings", id: "preferences-window") {
            PreferencesView()
                .environment(appState)
                .modelContainer(modelContainer)
        }
        .keyboardShortcut(",", modifiers: .command)
        .defaultSize(width: 580, height: 640)
        .windowResizability(.contentSize)
        
        // MARK: - Onboarding Window
        
        Window("Welcome to Tap", id: "onboarding-window") {
            OnboardingView()
                .environment(appState)
        }
        .windowResizability(.contentSize)
        .defaultPosition(.center)
    }
}

// MARK: - Menu Bar Label

/// The icon displayed in the macOS menu bar.
/// Shows a red dot overlay when recording.
private struct MenuBarLabel: View {
    let isRecording: Bool
    
    var body: some View {
        ZStack(alignment: .topTrailing) {
            Image(systemName: "waveform")
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
