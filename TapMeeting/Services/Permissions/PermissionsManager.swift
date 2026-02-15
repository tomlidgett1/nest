import Foundation
import AVFoundation
import ScreenCaptureKit
import EventKit

/// Checks and requests all required macOS permissions for Tap.
@Observable
final class PermissionsManager {
    
    var microphoneStatus: PermissionStatus = .unknown
    var screenRecordingStatus: PermissionStatus = .unknown
    var calendarStatus: PermissionStatus = .unknown
    var notificationStatus: PermissionStatus = .unknown
    
    /// Whether all critical permissions are granted.
    var allCriticalGranted: Bool {
        microphoneStatus == .granted && screenRecordingStatus == .granted
    }
    
    /// Whether all permissions (including optional) are granted.
    var allGranted: Bool {
        allCriticalGranted && calendarStatus == .granted && notificationStatus == .granted
    }
    
    // MARK: - Check All
    
    func checkAll() async {
        await checkMicrophone()
        await checkScreenRecording()
        await checkCalendar()
        await checkNotifications()
    }
    
    // MARK: - Microphone
    
    func checkMicrophone() async {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            microphoneStatus = .granted
        case .denied, .restricted:
            microphoneStatus = .denied
        case .notDetermined:
            microphoneStatus = .notRequested
        @unknown default:
            microphoneStatus = .unknown
        }
    }
    
    func requestMicrophone() async -> Bool {
        let granted = await AVCaptureDevice.requestAccess(for: .audio)
        microphoneStatus = granted ? .granted : .denied
        return granted
    }
    
    // MARK: - Screen Recording
    
    func checkScreenRecording() async {
        do {
            // Attempting to get shareable content will fail if not authorised.
            _ = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
            screenRecordingStatus = .granted
        } catch {
            screenRecordingStatus = .denied
        }
    }
    
    func requestScreenRecording() {
        // macOS doesn't have a programmatic request API for screen recording.
        // Opening System Settings is the only way to guide the user.
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
            NSWorkspace.shared.open(url)
        }
    }
    
    // MARK: - Calendar
    
    func checkCalendar() async {
        let status = EKEventStore.authorizationStatus(for: .event)
        switch status {
        case .fullAccess, .authorized:
            calendarStatus = .granted
        case .denied, .restricted:
            calendarStatus = .denied
        case .notDetermined, .writeOnly:
            calendarStatus = .notRequested
        @unknown default:
            calendarStatus = .unknown
        }
    }
    
    func requestCalendar() async -> Bool {
        let store = EKEventStore()
        do {
            let granted = try await store.requestFullAccessToEvents()
            calendarStatus = granted ? .granted : .denied
            return granted
        } catch {
            calendarStatus = .denied
            return false
        }
    }
    
    // MARK: - Notifications
    
    func checkNotifications() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional:
            notificationStatus = .granted
        case .denied:
            notificationStatus = .denied
        case .notDetermined:
            notificationStatus = .notRequested
        @unknown default:
            notificationStatus = .unknown
        }
    }
    
    func requestNotifications() async -> Bool {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            notificationStatus = granted ? .granted : .denied
            return granted
        } catch {
            notificationStatus = .denied
            return false
        }
    }
}

// MARK: - Permission Status

import AppKit
import UserNotifications

enum PermissionStatus: String {
    case unknown
    case notRequested
    case granted
    case denied
    
    var displayName: String {
        switch self {
        case .unknown:      return "Unknown"
        case .notRequested: return "Not Requested"
        case .granted:      return "Granted"
        case .denied:       return "Denied"
        }
    }
    
    var iconName: String {
        switch self {
        case .granted:      return "checkmark.circle.fill"
        case .denied:       return "xmark.circle.fill"
        case .notRequested: return "questionmark.circle"
        case .unknown:      return "questionmark.circle"
        }
    }
}
