import Foundation
import AppKit
import UserNotifications

/// Manages local notifications for meeting reminders and status updates.
final class NotificationService: NSObject, UNUserNotificationCenterDelegate {
    
    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }
    
    // MARK: - App Icon Attachment
    
    /// Creates a notification attachment from the app icon so notifications display it.
    private func appIconAttachment() -> UNNotificationAttachment? {
        // Prefer the asset catalogue icon explicitly so notifications match branding.
        let icon = NSImage(named: "AppIcon") ?? NSApp.applicationIconImage
        guard let icon, !icon.size.width.isZero, !icon.size.height.isZero else { return nil }
        
        guard let tiffData = icon.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData),
              let pngData = bitmap.representation(using: .png, properties: [:]) else { return nil }
        
        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("app-icon-\(UUID().uuidString).png")
        
        do {
            try pngData.write(to: fileURL)
            return try UNNotificationAttachment(identifier: "app-icon", url: fileURL, options: nil)
        } catch {
            return nil
        }
    }
    
    // MARK: - Meeting Ready
    
    /// Notify the user that a meeting is about to start.
    func sendMeetingReadyNotification(meetingTitle: String) {
        let content = UNMutableNotificationContent()
        content.title = "Tap — Ready to Take Notes?"
        content.body = meetingTitle
        content.categoryIdentifier = Constants.Notifications.meetingReadyCategory
        content.sound = .default
        if let attachment = appIconAttachment() {
            content.attachments = [attachment]
        }
        
        let request = UNNotificationRequest(
            identifier: "meeting-ready-\(UUID().uuidString)",
            content: content,
            trigger: nil // Deliver immediately
        )
        
        UNUserNotificationCenter.current().add(request)
    }
    
    // MARK: - New Email
    
    /// Notify the user of new email(s) in their inbox.
    func sendNewEmailNotification(threads: [GmailThread]) {
        guard !threads.isEmpty else { return }
        
        let content = UNMutableNotificationContent()
        content.sound = .default
        content.title = "New Email"
        
        // Use the newest thread payload so every email notification follows one format:
        // title + sender email + subject (or message content when no subject is available).
        let newestThread = threads.max { $0.date < $1.date } ?? threads[0]
        if let msg = newestThread.latestMessage {
            content.subtitle = msg.fromEmail
            
            let subject = msg.subject.trimmingCharacters(in: .whitespacesAndNewlines)
            if !subject.isEmpty, subject.lowercased() != "no subject" {
                content.body = subject
            } else {
                let plain = msg.bodyPlain.trimmingCharacters(in: .whitespacesAndNewlines)
                if !plain.isEmpty {
                    content.body = plain
                } else {
                    let snippet = msg.snippet.trimmingCharacters(in: .whitespacesAndNewlines)
                    content.body = snippet.isEmpty ? "No subject or preview available." : snippet
                }
            }
        } else {
            content.subtitle = ""
            content.body = "No subject or preview available."
        }
        
        let request = UNNotificationRequest(
            identifier: "new-email-\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        
        UNUserNotificationCenter.current().add(request)
    }
    
    // MARK: - New To-Dos
    
    /// Notify the user that new to-do items have been extracted.
    func sendNewTodoNotification(count: Int, source: TodoItem.SourceType, sourceTitle: String? = nil) {
        guard count > 0 else { return }
        
        let content = UNMutableNotificationContent()
        content.sound = .default
        
        let sourceLabel: String
        switch source {
        case .meeting: sourceLabel = "meeting"
        case .email: sourceLabel = "email"
        case .manual: return // No notification for manual to-dos
        }
        
        if count == 1 {
            content.title = "New To-Do"
            if let title = sourceTitle {
                content.body = "From \(sourceLabel): \(title)"
            } else {
                content.body = "1 new to-do from a \(sourceLabel)"
            }
        } else {
            content.title = "\(count) New To-Dos"
            if let title = sourceTitle {
                content.body = "From \(sourceLabel): \(title)"
            } else {
                content.body = "\(count) new to-dos from \(sourceLabel)s"
            }
        }
        
        let request = UNNotificationRequest(
            identifier: "new-todo-\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        
        UNUserNotificationCenter.current().add(request)
    }
    
    // MARK: - Meeting Ended
    
    /// Notify the user that a meeting appears to have ended.
    func sendMeetingEndedNotification() {
        let content = UNMutableNotificationContent()
        content.title = "Meeting Ended"
        content.body = "Enhance your notes?"
        content.categoryIdentifier = Constants.Notifications.meetingEndedCategory
        content.sound = .default
        if let attachment = appIconAttachment() {
            content.attachments = [attachment]
        }
        
        let request = UNNotificationRequest(
            identifier: "meeting-ended-\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        
        UNUserNotificationCenter.current().add(request)
    }
    
    // MARK: - Setup Categories
    
    /// Register notification categories with action buttons.
    func registerCategories() {
        let startAction = UNNotificationAction(
            identifier: Constants.Notifications.startAction,
            title: "Start Notes",
            options: [.foreground]
        )
        
        let dismissAction = UNNotificationAction(
            identifier: Constants.Notifications.dismissAction,
            title: "Dismiss",
            options: [.destructive]
        )
        
        let enhanceAction = UNNotificationAction(
            identifier: Constants.Notifications.enhanceAction,
            title: "Enhance Notes",
            options: [.foreground]
        )
        
        let meetingReadyCategory = UNNotificationCategory(
            identifier: Constants.Notifications.meetingReadyCategory,
            actions: [startAction, dismissAction],
            intentIdentifiers: []
        )
        
        let meetingEndedCategory = UNNotificationCategory(
            identifier: Constants.Notifications.meetingEndedCategory,
            actions: [enhanceAction, dismissAction],
            intentIdentifiers: []
        )
        
        UNUserNotificationCenter.current().setNotificationCategories([
            meetingReadyCategory,
            meetingEndedCategory
        ])
    }
    
    // MARK: - UNUserNotificationCenterDelegate
    
    /// Handle notification taps while the app is in the foreground.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        return [.banner, .sound]
    }
    
    /// Handle notification action button taps.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let actionId = response.actionIdentifier
        
        switch actionId {
        case Constants.Notifications.startAction:
            await MainActor.run {
                NotificationCenter.default.post(
                    name: .startMeetingFromNotification,
                    object: nil
                )
            }
        case Constants.Notifications.enhanceAction:
            await MainActor.run {
                NotificationCenter.default.post(
                    name: .enhanceNotesFromNotification,
                    object: nil
                )
            }
        default:
            break
        }
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let startMeetingFromNotification = Notification.Name("startMeetingFromNotification")
    static let enhanceNotesFromNotification = Notification.Name("enhanceNotesFromNotification")
}
