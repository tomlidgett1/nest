import SwiftUI
import Sparkle

/// Wraps Sparkle's `SPUStandardUpdaterController` so the rest of the app
/// can trigger update checks and observe readiness via SwiftUI bindings.
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
