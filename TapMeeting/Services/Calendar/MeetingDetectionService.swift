import Foundation
import AppKit

/// Detects when meeting apps (Zoom, Meet, Teams) are active.
/// Uses NSWorkspace notifications and process monitoring.
@Observable
final class MeetingDetectionService {
    
    /// Whether a known meeting app is currently running.
    private(set) var meetingAppDetected = false
    
    /// The bundle ID of the detected meeting app, if any.
    private(set) var detectedAppBundleID: String?
    
    /// Human-readable name of the detected meeting app.
    var detectedAppName: String? {
        guard let bundleID = detectedAppBundleID else { return nil }
        return Self.appNames[bundleID]
    }
    
    private static let appNames: [String: String] = [
        "us.zoom.xos": "Zoom",
        "com.microsoft.teams2": "Microsoft Teams",
        "com.microsoft.teams": "Microsoft Teams",
        "com.apple.FaceTime": "FaceTime",
        "com.cisco.webexmeetingsapp": "Webex",
        "com.google.Chrome": "Google Chrome"
    ]
    
    // MARK: - Monitoring
    
    /// Start watching for meeting app launches and terminations.
    func startMonitoring() {
        checkRunningApps()
        
        let workspace = NSWorkspace.shared
        let center = workspace.notificationCenter
        
        center.addObserver(
            self,
            selector: #selector(appDidLaunch(_:)),
            name: NSWorkspace.didLaunchApplicationNotification,
            object: nil
        )
        
        center.addObserver(
            self,
            selector: #selector(appDidTerminate(_:)),
            name: NSWorkspace.didTerminateApplicationNotification,
            object: nil
        )
    }
    
    func stopMonitoring() {
        NSWorkspace.shared.notificationCenter.removeObserver(self)
    }
    
    // MARK: - Private
    
    private func checkRunningApps() {
        let runningApps = NSWorkspace.shared.runningApplications
        
        for app in runningApps {
            if let bundleID = app.bundleIdentifier,
               Constants.meetingAppBundleIDs.contains(bundleID) {
                meetingAppDetected = true
                detectedAppBundleID = bundleID
                return
            }
        }
        
        meetingAppDetected = false
        detectedAppBundleID = nil
    }
    
    @objc private func appDidLaunch(_ notification: Notification) {
        guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
              let bundleID = app.bundleIdentifier,
              Constants.meetingAppBundleIDs.contains(bundleID) else { return }
        
        meetingAppDetected = true
        detectedAppBundleID = bundleID
    }
    
    @objc private func appDidTerminate(_ notification: Notification) {
        guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
              let bundleID = app.bundleIdentifier,
              bundleID == detectedAppBundleID else { return }
        
        // Re-check in case another meeting app is still running.
        checkRunningApps()
    }
}
