import AppKit
import SwiftUI

/// An NSPanel subclass that can become key to receive button clicks,
/// but doesn't activate the owning app (stays non-activating).
private final class ClickablePanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

/// Manages a floating "Start Recording?" prompt panel in the top-right corner.
/// Shown when `BrowserMonitorService` detects a meeting URL or desktop app.
final class MeetingPromptHUDController {
    
    private var panel: NSPanel?
    
    var isVisible: Bool { panel?.isVisible ?? false }
    
    private var currentSource: String = ""
    
    var onStartRecording: (() -> Void)?
    var onDismiss: (() -> Void)?
    
    func show(meetingSource: String) {
        if panel != nil && currentSource != meetingSource {
            panel?.close()
            panel = nil
        }
        
        currentSource = meetingSource
        
        if panel == nil {
            createPanel(meetingSource: meetingSource)
        }
        panel?.orderFrontRegardless()
    }
    
    func hide() {
        panel?.orderOut(nil)
    }
    
    func close() {
        panel?.close()
        panel = nil
    }
    
    private func createPanel(meetingSource: String) {
        let hudView = MeetingPromptHUDView(
            meetingSource: meetingSource,
            onStartRecording: { [weak self] in
                self?.onStartRecording?()
            },
            onDismiss: { [weak self] in
                self?.onDismiss?()
            }
        )
        
        let hudWidth: CGFloat = 280
        let hudHeight: CGFloat = 44
        
        let hostingView = NSHostingView(rootView: hudView)
        hostingView.frame = NSRect(x: 0, y: 0, width: hudWidth, height: hudHeight)
        
        // Use ClickablePanel so buttons receive mouse events
        let panel = ClickablePanel(
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
        print("[MeetingPromptHUD] Panel created, frame: \(panel.frame)")
    }
}
