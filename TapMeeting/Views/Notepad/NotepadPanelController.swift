import AppKit
import SwiftUI

/// Custom NSPanel subclass that can become key window,
/// enabling full text selection and editing in the notepad.
private final class KeyablePanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

/// Floating NSPanel with warm cream background.
final class NotepadPanelController {
    
    private var panel: NSPanel?
    private let appState: AppState
    
    var isVisible: Bool { panel?.isVisible ?? false }
    
    init(appState: AppState) {
        self.appState = appState
    }
    
    func showPanel() {
        if panel == nil { createPanel() }
        panel?.makeKeyAndOrderFront(nil)
    }
    
    func hidePanel() { panel?.orderOut(nil) }
    func close() { panel?.close(); panel = nil }
    
    private func createPanel() {
        let hostingView = NSHostingView(
            rootView: NotepadView().environment(appState)
        )
        
        let panel = KeyablePanel(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 540),
            styleMask: [.titled, .closable, .resizable, .utilityWindow, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        
        panel.contentView = hostingView
        panel.title = ""
        panel.isFloatingPanel = true
        panel.becomesKeyOnlyIfNeeded = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovableByWindowBackground = true
        panel.titlebarAppearsTransparent = true
        panel.titleVisibility = .hidden
        // Warm cream background
        panel.backgroundColor = NSColor(
            red: 0.98, green: 0.97, blue: 0.95, alpha: 1.0
        )
        panel.minSize = NSSize(width: 320, height: 400)
        panel.isOpaque = false
        panel.hasShadow = true
        
        if let screen = NSScreen.main {
            let visible = screen.visibleFrame
            let x = visible.maxX - 400 - 16
            let y = visible.minY + 16
            panel.setFrameOrigin(NSPoint(x: x, y: y))
        }
        
        self.panel = panel
    }
}
