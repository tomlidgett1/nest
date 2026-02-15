import AppKit
import SwiftUI

/// An NSPanel subclass that can become key to receive button clicks,
/// but doesn't activate the owning app (stays non-activating).
private final class ReminderClickablePanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

/// Manages a floating meeting reminder panel in the top-right corner.
/// Shown ~1 minute before a calendar event starts.
final class MeetingReminderHUDController {
    
    private var panel: NSPanel?
    private var autoDismissTimer: Timer?
    
    var isVisible: Bool { panel?.isVisible ?? false }
    
    /// The event ID currently being shown, to avoid duplicate reminders.
    private(set) var currentEventId: String?
    
    var onStartRecording: ((String, String, [String]) -> Void)?  // (title, eventId, attendees)
    var onDismiss: (() -> Void)?
    
    func show(event: CalendarEvent) {
        // Don't re-show the same event
        if currentEventId == event.id && panel?.isVisible == true { return }
        
        // Close any existing panel
        close()
        
        currentEventId = event.id
        
        let timeFormatter = DateFormatter()
        timeFormatter.timeStyle = .short
        let eventTime = timeFormatter.string(from: event.startDate)
        
        let hudView = MeetingReminderHUDView(
            eventTitle: event.title,
            eventTime: eventTime,
            meetingURL: event.meetingURL,
            onJoin: { [weak self] in
                if let url = event.meetingURL {
                    NSWorkspace.shared.open(url)
                }
                self?.onStartRecording?(event.title, event.id, event.attendeeNames)
                self?.close()
            },
            onStartRecording: { [weak self] in
                self?.onStartRecording?(event.title, event.id, event.attendeeNames)
                self?.close()
            },
            onDismiss: { [weak self] in
                self?.onDismiss?()
                self?.close()
            }
        )
        
        let hudWidth: CGFloat = 420
        let hudHeight: CGFloat = 64
        
        let hostingView = NSHostingView(rootView: hudView)
        hostingView.frame = NSRect(x: 0, y: 0, width: hudWidth, height: hudHeight)
        
        let panel = ReminderClickablePanel(
            contentRect: NSRect(x: 0, y: 0, width: hudWidth, height: hudHeight),
            styleMask: [.nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        
        panel.contentView = hostingView
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovableByWindowBackground = false
        panel.titlebarAppearsTransparent = true
        panel.titleVisibility = .hidden
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.acceptsMouseMovedEvents = true
        
        // Position top-right of the main screen
        if let screen = NSScreen.main {
            let visible = screen.visibleFrame
            let x = visible.maxX - hudWidth - 20
            let y = visible.maxY - hudHeight - 20
            panel.setFrameOrigin(NSPoint(x: x, y: y))
        }
        
        self.panel = panel
        panel.orderFrontRegardless()
        
        // Auto-dismiss after 30 seconds
        autoDismissTimer?.invalidate()
        autoDismissTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { [weak self] _ in
            self?.close()
        }
        
        print("[MeetingReminder] Showing reminder for: \(event.title)")
    }
    
    func close() {
        autoDismissTimer?.invalidate()
        autoDismissTimer = nil
        panel?.close()
        panel = nil
        currentEventId = nil
    }
}
