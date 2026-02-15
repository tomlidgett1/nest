import AppKit
import SwiftUI

/// AppDelegate handles AppKit-level lifecycle events that SwiftUI cannot.
/// Manages activation policy, dock icon behaviour, notepad panel, and keyboard shortcuts.
final class AppDelegate: NSObject, NSApplicationDelegate {
    
    /// The floating notepad panel controller.
    var notepadPanelController: NotepadPanelController?
    
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Regular app — show in dock and Cmd+Tab.
        NSApp.setActivationPolicy(.regular)
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(hideNotepadPanel),
            name: .hideNotepad,
            object: nil
        )
        
        // Open the appropriate window once SwiftUI scenes have initialised.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            let hasOnboarded = UserDefaults.standard.bool(forKey: Constants.Defaults.hasCompletedOnboarding)
            if hasOnboarded {
                NotificationCenter.default.post(name: .openNotesWindow, object: nil)
            } else {
                NotificationCenter.default.post(name: .openOnboardingWindow, object: nil)
            }
        }
    }
    
    func applicationWillTerminate(_ notification: Notification) {
        notepadPanelController?.close()
    }
    
    /// Keep the app running when all windows are closed (menu bar stays active).
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }
    
    /// Reopen the notes window when the dock icon is clicked with no visible windows.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            NotificationCenter.default.post(name: .openNotesWindow, object: nil)
        }
        return true
    }
    
    // MARK: - Notepad Panel Management
    
    func showNotepadPanel(appState: AppState) {
        if notepadPanelController == nil {
            notepadPanelController = NotepadPanelController(appState: appState)
        }
        notepadPanelController?.showPanel()
    }
    
    @objc func hideNotepadPanel() {
        notepadPanelController?.hidePanel()
    }
    
    func toggleNotepadPanel(appState: AppState) {
        if let controller = notepadPanelController, controller.isVisible {
            hideNotepadPanel()
        } else {
            showNotepadPanel(appState: appState)
        }
    }
    
}
