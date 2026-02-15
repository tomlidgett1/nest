import SwiftUI
import AppKit

/// Accesses the hosting NSWindow to make the titlebar fully transparent
/// and seamless — no separator, no system gray tint.
///
/// The window background is set to the warm cream colour from Theme so
/// the titlebar region blends perfectly with the SwiftUI content below.
/// Toolbar items are managed by SwiftUI's .toolbar { } modifier on
/// the root view, not by an AppKit NSToolbar.
///
/// Note: We intentionally do NOT use `.fullSizeContentView`. Extending
/// content under the titlebar requires safe-area insets to push it back
/// down, but those insets are calculated before the style-mask change
/// and become stale — causing the top nav to sit too high on launch.
/// The transparent titlebar + hidden toolbar background + matching
/// window background colour already produce the seamless look without
/// needing fullSizeContentView at all.
struct WindowConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> _WindowConfiguratorView {
        _WindowConfiguratorView()
    }
    
    func updateNSView(_ nsView: _WindowConfiguratorView, context: Context) {}
}

/// Custom NSView that configures its hosting window the moment it is
/// added to the view hierarchy, via `viewDidMoveToWindow()`.
final class _WindowConfiguratorView: NSView {
    private var isConfigured = false
    
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard let window = self.window, !isConfigured else { return }
        isConfigured = true
        
        // Visual-only properties — these do NOT change the titlebar
        // height or content area, so they won't create stale safe-area
        // insets. Title visibility is handled at the scene level via
        // .windowToolbarStyle(.unified(showsTitle: false)).
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.isMovableByWindowBackground = false
        
        // Set window background to match Theme.background
        // so the titlebar blends seamlessly with the content.
        window.backgroundColor = NSColor(
            red: 0.98, green: 0.97, blue: 0.95, alpha: 1.0
        )
        
        // SwiftUI's unified toolbar reports stale safe-area insets on first layout.
        // Hide the window until layout has settled, then reveal.
        window.alphaValue = 0
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { [weak window] in
            window?.animator().alphaValue = 1
        }
    }
}
