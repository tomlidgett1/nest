import SwiftUI
import Sparkle

// MARK: - Updater Delegate

/// Handles Sparkle delegate callbacks.
/// Auto-installs updates when no meeting is being recorded.
final class UpdaterDelegate: NSObject, SPUUpdaterDelegate {

    /// Reference to AppState so we can check if a meeting is active.
    weak var appState: AppState?

    /// Called when an update has been downloaded and is ready to install on quit.
    /// If no meeting is active, we install immediately. Otherwise we poll until it ends.
    func updater(
        _ updater: SPUUpdater,
        willInstallUpdateOnQuit item: SUAppcastItem,
        immediateInstallationBlock installationBlock: @escaping () -> Void
    ) {
        if appState?.isMeetingActive != true {
            installationBlock()
        } else {
            pollForMeetingEnd(installationBlock: installationBlock)
        }
    }

    /// Polls every 60 seconds waiting for the meeting to finish,
    /// then waits 5 minutes for notes to generate before installing.
    private func pollForMeetingEnd(installationBlock: @escaping () -> Void) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) { [weak self] in
            guard let self else { return }
            if self.appState?.isMeetingActive != true {
                // Meeting ended — wait 5 minutes for notes to generate
                DispatchQueue.main.asyncAfter(deadline: .now() + 300) {
                    installationBlock()
                }
            } else {
                self.pollForMeetingEnd(installationBlock: installationBlock)
            }
        }
    }
}

// MARK: - Updater Service

/// Wraps Sparkle's `SPUStandardUpdaterController` so the rest of the app
/// can trigger update checks and observe readiness via SwiftUI bindings.
/// Configured for fully automatic silent updates on launch and every hour.
/// Will auto-install and relaunch, but only when no meeting is being recorded.
final class UpdaterService: ObservableObject {

    let updaterController: SPUStandardUpdaterController
    let updaterDelegate = UpdaterDelegate()

    /// Publishes whenever `canCheckForUpdates` changes so buttons can re-evaluate.
    @Published var canCheckForUpdates = false

    /// Set by TapMeetingApp to give the delegate access to meeting state.
    var appState: AppState? {
        didSet { updaterDelegate.appState = appState }
    }

    init() {
        updaterController = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: updaterDelegate,
            userDriverDelegate: nil
        )

        let updater = updaterController.updater

        // Force automatic checks and silent installs via code
        updater.automaticallyChecksForUpdates = true
        updater.automaticallyDownloadsUpdates = true
        updater.updateCheckInterval = 3600 // every hour

        updater.publisher(for: \.canCheckForUpdates)
            .assign(to: &$canCheckForUpdates)

        // Check for updates 5 seconds after launch
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            guard let self, self.updaterController.updater.canCheckForUpdates else { return }
            self.updaterController.updater.checkForUpdatesInBackground()
        }
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
