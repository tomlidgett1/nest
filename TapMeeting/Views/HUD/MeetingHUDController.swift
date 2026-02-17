import AppKit
import SwiftUI

/// An NSPanel subclass with a custom mouse tracking loop that handles
/// both click and drag in a single mouseDown pass.
/// • Click (< 4 px movement): fires onTap
/// • Drag (≥ 4 px movement): repositions the window
/// We do NOT use isMovableByWindowBackground so there is no conflict.
private final class MeetingHUDPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    
    /// Called when the user single-clicks (not drags) the HUD.
    var onTap: (() -> Void)?
    
    override func mouseDown(with event: NSEvent) {
        // Use screen coordinates so the values stay stable as the window moves.
        let startMouse = NSEvent.mouseLocation
        let startOrigin = frame.origin
        var didDrag = false
        
        // Run a local tracking loop until the mouse is released.
        while true {
            guard let next = NSApp.nextEvent(
                matching: [.leftMouseUp, .leftMouseDragged],
                until: .distantFuture,
                inMode: .eventTracking,
                dequeue: true
            ) else { continue }
            
            if next.type == .leftMouseUp { break }
            
            // leftMouseDragged — reposition the window
            let currentMouse = NSEvent.mouseLocation
            let deltaX = currentMouse.x - startMouse.x
            let deltaY = currentMouse.y - startMouse.y
            setFrameOrigin(NSPoint(x: startOrigin.x + deltaX, y: startOrigin.y + deltaY))
            
            if abs(deltaX) > 3 || abs(deltaY) > 3 {
                didDrag = true
            }
        }
        
        if !didDrag {
            onTap?()
        }
    }
}

/// Manages a small floating HUD pill in the bottom-right corner of the screen.
/// Shown during live meetings; clicking opens the main notes window.
final class MeetingHUDController {
    
    private var panel: NSPanel?
    private let appState: AppState
    
    var isVisible: Bool { panel?.isVisible ?? false }
    
    init(appState: AppState) {
        self.appState = appState
    }
    
    private func activateAppIfNeeded(delay: TimeInterval = 0.1) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            guard !NSApp.isActive else { return }
            NSRunningApplication.current.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
        }
    }
    
    func show() {
        if panel == nil { createPanel() }
        panel?.orderFrontRegardless()
        print("[MeetingHUD] show() called, panel visible: \(panel?.isVisible ?? false)")
    }
    
    func hide() {
        panel?.orderOut(nil)
    }
    
    func close() {
        panel?.close()
        panel = nil
    }
    
    private func createPanel() {
        let hudView = MeetingHUDView()
            .environment(appState)
        
        let hudWidth: CGFloat = 164
        let hudHeight: CGFloat = 42
        
        let hostingView = NSHostingView(rootView: hudView)
        hostingView.frame = NSRect(x: 0, y: 0, width: hudWidth, height: hudHeight)
        
        let panel = MeetingHUDPanel(
            contentRect: NSRect(x: 0, y: 0, width: hudWidth, height: hudHeight),
            styleMask: [.nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        
        panel.onTap = { [weak self] in
            self?.openMainWindow()
        }
        
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
        
        // Hide the titlebar completely
        if let titlebarContainer = panel.standardWindowButton(.closeButton)?.superview?.superview {
            titlebarContainer.frame.size.height = 0
            titlebarContainer.isHidden = true
        }
        
        // Position bottom-right of the main screen
        if let screen = NSScreen.main {
            let visible = screen.visibleFrame
            let x = visible.maxX - hudWidth - 20
            let y = visible.minY + 20
            panel.setFrameOrigin(NSPoint(x: x, y: y))
        }
        
        self.panel = panel
        print("[MeetingHUD] Panel created, frame: \(panel.frame)")
    }
    
    private func openMainWindow() {
        print("[MeetingHUD] Tap detected — opening main window")
        
        // Navigate to the live meeting note when the window opens
        appState.shouldNavigateToLiveMeeting = true
        appState.shouldOpenNotesWindow = true
        
        // Also post notification as a fallback, and activate the app directly
        NotificationCenter.default.post(name: .openNotesWindow, object: nil)
        
        DispatchQueue.main.async {
            self.activateAppIfNeeded()
            // Ensure the notes window is key and ordered front
            if let window = NSApp.windows.first(where: {
                $0.identifier?.rawValue == "notes-window" || $0.title == "All Notes"
            }) {
                window.makeKeyAndOrderFront(nil)
            }
        }
    }
}

// MARK: - Notification Name

extension Notification.Name {
    static let openNotesWindow = Notification.Name("openNotesWindow")
    static let openOnboardingWindow = Notification.Name("openOnboardingWindow")
    static let toggleSidebar = Notification.Name("toggleSidebar")
    static let quickNote = Notification.Name("quickNote")
    static let hideNotepad = Notification.Name("hideNotepad")
}
