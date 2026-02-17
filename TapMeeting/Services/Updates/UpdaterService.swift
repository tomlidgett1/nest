import SwiftUI
import Sparkle
import AppKit

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
final class UpdaterService: NSObject, ObservableObject {

    let updaterController: SPUStandardUpdaterController
    let updaterDelegate = UpdaterDelegate()

    /// Publishes whenever `canCheckForUpdates` changes so buttons can re-evaluate.
    @Published var canCheckForUpdates = false
    private var periodicCheckTimer: Timer?
    private var launchCheckAttemptsRemaining = 12
    private var lastBackgroundCheckDate = Date.distantPast
    private let launchCheckDelaySeconds: TimeInterval = 5
    private let launchCheckRetrySeconds: TimeInterval = 5
    private let periodicCheckSeconds: TimeInterval = 3600
    private let minimumCheckSpacingSeconds: TimeInterval = 10

    /// Set by TapMeetingApp to give the delegate access to meeting state.
    var appState: AppState? {
        didSet { updaterDelegate.appState = appState }
    }

    override init() {
        updaterController = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: updaterDelegate,
            userDriverDelegate: nil
        )

        super.init()

        let updater = updaterController.updater

        // Force automatic checks and silent installs via code
        updater.automaticallyChecksForUpdates = true
        updater.automaticallyDownloadsUpdates = true
        updater.updateCheckInterval = periodicCheckSeconds

        updater.publisher(for: \.canCheckForUpdates)
            .assign(to: &$canCheckForUpdates)

        startDeterministicBackgroundChecks()
    }

    deinit {
        periodicCheckTimer?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }

    /// Manually trigger an update check (e.g. from a "Check for Updates" menu item).
    func checkForUpdates() {
        updaterController.checkForUpdates(nil)
    }

    // MARK: - Deterministic Auto-Check Flow

    /// Guarantees update checks on launch, every hour, and on app activation.
    /// This avoids timing races where Sparkle is not yet ready at first launch check.
    private func startDeterministicBackgroundChecks() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appDidBecomeActive),
            name: NSApplication.didBecomeActiveNotification,
            object: nil
        )

        periodicCheckTimer = Timer.scheduledTimer(withTimeInterval: periodicCheckSeconds, repeats: true) { [weak self] _ in
            self?.performBackgroundCheckIfPossible()
        }
        periodicCheckTimer?.tolerance = 60

        scheduleLaunchCheckAttempt(after: launchCheckDelaySeconds)
    }

    @objc
    private func appDidBecomeActive() {
        performBackgroundCheckIfPossible()
    }

    private func scheduleLaunchCheckAttempt(after delay: TimeInterval) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self else { return }
            if self.updaterController.updater.canCheckForUpdates {
                self.performBackgroundCheckIfPossible(force: true)
                return
            }

            if self.launchCheckAttemptsRemaining > 0 {
                self.launchCheckAttemptsRemaining -= 1
                self.scheduleLaunchCheckAttempt(after: self.launchCheckRetrySeconds)
            }
        }
    }

    private func performBackgroundCheckIfPossible(force: Bool = false) {
        guard updaterController.updater.canCheckForUpdates else { return }

        let now = Date()
        if !force, now.timeIntervalSince(lastBackgroundCheckDate) < minimumCheckSpacingSeconds {
            return
        }

        lastBackgroundCheckDate = now
        updaterController.updater.checkForUpdatesInBackground()
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
