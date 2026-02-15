import Foundation
import AppKit
import CoreGraphics

/// Monitors browser window titles for meeting URLs using CGWindowList.
/// Also watches for Zoom/Teams desktop app launches via NSWorkspace.
///
/// Uses CGWindowListCopyWindowInfo to read window titles — no AppleScript,
/// no Accessibility permission needed. Works with the existing screen recording permission.
@Observable
final class BrowserMonitorService {
    
    // MARK: - Published State
    
    private(set) var detectedMeetingURL: String?
    private(set) var detectedMeetingSource: String?
    var isMeetingDetected: Bool { detectedMeetingURL != nil || detectedDesktopApp != nil }
    private(set) var detectedDesktopApp: String?
    
    var detectedDesktopAppName: String? {
        guard let bundleID = detectedDesktopApp else { return nil }
        return Self.desktopAppNames[bundleID]
    }
    
    // MARK: - Private
    
    private var pollTimer: Timer?
    private var dismissedKeys: Set<String> = []
    private var isMonitoring = false
    private var consecutiveMisses = 0
    /// Tracks whether a meeting was seen on the last poll (even if dismissed).
    private var meetingCurrentlyOpen = false
    
    /// Browser app names to look for in CGWindowList results.
    private static let browserAppNames: Set<String> = [
        "Google Chrome", "Google Chrome Canary",
        "Brave Browser", "Microsoft Edge",
        "Arc", "Vivaldi", "Opera", "Safari",
        "Firefox",
    ]
    
    /// Window title patterns that indicate a meeting.
    private static let titlePatterns: [(pattern: String, name: String)] = [
        ("meet.google.com", "Google Meet"),
        ("google meet", "Google Meet"),
        // Active Meet calls show "Meet - <participant name>"
        ("meet -", "Google Meet"),
        ("meet –", "Google Meet"),
        ("zoom meeting", "Zoom"),
        ("zoom.us", "Zoom"),
        ("microsoft teams", "Microsoft Teams"),
        ("teams.microsoft.com", "Microsoft Teams"),
    ]
    
    private static let desktopAppBundleIDs: Set<String> = [
        "us.zoom.xos",
        "com.microsoft.teams2",
        "com.microsoft.teams",
    ]
    
    private static let desktopAppNames: [String: String] = [
        "us.zoom.xos": "Zoom",
        "com.microsoft.teams2": "Microsoft Teams",
        "com.microsoft.teams": "Microsoft Teams",
    ]
    
    // MARK: - Lifecycle
    
    func startMonitoring() {
        guard !isMonitoring else { return }
        isMonitoring = true
        
        let center = NSWorkspace.shared.notificationCenter
        center.addObserver(self, selector: #selector(appDidLaunch(_:)),
                           name: NSWorkspace.didLaunchApplicationNotification, object: nil)
        center.addObserver(self, selector: #selector(appDidTerminate(_:)),
                           name: NSWorkspace.didTerminateApplicationNotification, object: nil)
        
        checkRunningDesktopApps()
        
        pollTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
            self?.poll()
        }
        poll()
        
        print("[BrowserMonitor] ✓ Monitoring started")
    }
    
    func stopMonitoring() {
        guard isMonitoring else { return }
        isMonitoring = false
        pollTimer?.invalidate()
        pollTimer = nil
        NSWorkspace.shared.notificationCenter.removeObserver(self)
        detectedMeetingURL = nil
        detectedMeetingSource = nil
        detectedDesktopApp = nil
        dismissedKeys.removeAll()
    }
    
    func dismissCurrentURL() {
        if let key = detectedMeetingURL {
            dismissedKeys.insert(key)
            print("[BrowserMonitor] Dismissed: \(key)")
        } else if let source = detectedMeetingSource {
            dismissedKeys.insert(source)
        }
        if let app = detectedDesktopApp {
            dismissedKeys.insert(app)
        }
        detectedMeetingURL = nil
        detectedMeetingSource = nil
        detectedDesktopApp = nil
    }
    
    // MARK: - Polling via CGWindowList
    
    private func poll() {
        // CGWindowListCopyWindowInfo is fast and synchronous — safe to call on main thread
        // but we'll use a background queue to be safe
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self else { return }
            
            let result = self.scanBrowserWindowTitles()
            
            DispatchQueue.main.async {
                if let (key, source) = result {
                    // A meeting window is open
                    self.meetingCurrentlyOpen = true
                    self.consecutiveMisses = 0
                    
                    // Only show HUD if not dismissed
                    if !self.dismissedKeys.contains(key) && !self.dismissedKeys.contains(source) {
                        if self.detectedMeetingSource != source {
                            print("[BrowserMonitor] ✓ DETECTED: \(source)")
                        }
                        self.detectedMeetingURL = key
                        self.detectedMeetingSource = source
                    }
                } else if self.meetingCurrentlyOpen {
                    // Meeting window was open but now gone — debounce
                    self.consecutiveMisses += 1
                    if self.consecutiveMisses >= 3 {
                        print("[BrowserMonitor] Meeting gone, resetting")
                        self.detectedMeetingURL = nil
                        self.detectedMeetingSource = nil
                        self.meetingCurrentlyOpen = false
                        self.consecutiveMisses = 0
                        self.dismissedKeys.removeAll()
                    }
                }
            }
        }
    }
    
    /// Use CGWindowListCopyWindowInfo to get all on-screen window titles.
    /// Filter to known browser apps and check for meeting-related titles.
    private func scanBrowserWindowTitles() -> (key: String, source: String)? {
        guard let windowList = CGWindowListCopyWindowInfo(
            [.optionOnScreenOnly, .excludeDesktopElements],
            kCGNullWindowID
        ) as? [[String: Any]] else {
            print("[BrowserMonitor] CGWindowList returned nil")
            return nil
        }
        
        var browserTitles: [(app: String, title: String)] = []
        
        for window in windowList {
            guard let ownerName = window[kCGWindowOwnerName as String] as? String,
                  let title = window[kCGWindowName as String] as? String,
                  !title.isEmpty else { continue }
            
            // Only look at browser windows
            if Self.browserAppNames.contains(ownerName) {
                browserTitles.append((ownerName, title))
            }
        }
        
        // Only log periodically to avoid console spam
        // (uncomment for debugging)
        // if !browserTitles.isEmpty {
        //     print("[BrowserMonitor] \(browserTitles.map { "[\($0.app)] \($0.title)" })")
        // }
        
        // Check titles for meeting patterns
        for (_, title) in browserTitles {
            let lowered = title.lowercased()
            for (pattern, name) in Self.titlePatterns {
                if lowered.contains(pattern) {
                    return (title, name)
                }
            }
        }
        
        return nil
    }
    
    // MARK: - Desktop App Detection
    
    private func checkRunningDesktopApps() {
        for app in NSWorkspace.shared.runningApplications {
            if let bundleID = app.bundleIdentifier,
               Self.desktopAppBundleIDs.contains(bundleID),
               !dismissedKeys.contains(bundleID) {
                detectedDesktopApp = bundleID
                detectedMeetingSource = Self.desktopAppNames[bundleID]
                return
            }
        }
        detectedDesktopApp = nil
    }
    
    @objc private func appDidLaunch(_ notification: Notification) {
        guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
              let bundleID = app.bundleIdentifier,
              Self.desktopAppBundleIDs.contains(bundleID),
              !dismissedKeys.contains(bundleID) else { return }
        
        detectedDesktopApp = bundleID
        detectedMeetingSource = Self.desktopAppNames[bundleID]
        print("[BrowserMonitor] Desktop app launched: \(bundleID)")
    }
    
    @objc private func appDidTerminate(_ notification: Notification) {
        guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
              let bundleID = app.bundleIdentifier,
              bundleID == detectedDesktopApp else { return }
        
        detectedDesktopApp = nil
        dismissedKeys.remove(bundleID)
        checkRunningDesktopApps()
    }
}
