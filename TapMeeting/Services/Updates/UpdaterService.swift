import SwiftUI
import Sparkle

/// Wraps Sparkle's `SPUStandardUpdaterController` so the rest of the app
/// can trigger update checks and observe readiness via SwiftUI bindings.
/// Configured for fully automatic silent updates on launch and every hour.
final class UpdaterService: ObservableObject {

    let updaterController: SPUStandardUpdaterController

    /// Publishes whenever `canCheckForUpdates` changes so buttons can re-evaluate.
    @Published var canCheckForUpdates = false

    init() {
        updaterController = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )

        let updater = updaterController.updater

        // Force automatic checks and silent installs via code
        updater.automaticallyChecksForUpdates = true
        updater.automaticallyDownloadsUpdates = true
        updater.updateCheckInterval = 3600 // every hour

        updaterController.updater.publisher(for: \.canCheckForUpdates)
            .assign(to: &$canCheckForUpdates)
    }

    /// Manually trigger an update check (e.g. from a "Check for Updates" menu item).
    func checkForUpdates() {
        updaterController.checkForUpdates(nil)
    }
}

// MARK: - Menu Bar Command View

/// A SwiftUI view that renders the "Check for Updates…" menu command.
/// Used inside `.commands { CommandGroup { } }` in the App struct.
struct CheckForUpdatesView: View {
    @ObservedObject var updaterService: UpdaterService

    var body: some View {
        Button("Check for Updates…") {
            updaterService.checkForUpdates()
        }
        .disabled(!updaterService.canCheckForUpdates)
    }
}
