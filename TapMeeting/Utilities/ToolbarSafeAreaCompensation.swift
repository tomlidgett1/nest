import SwiftUI

/// Compensates for SwiftUI's unified toolbar reporting stale safe-area insets on first layout.
/// When the reported top inset is insufficient, adds padding to push content below the toolbar.
struct ToolbarSafeAreaCompensation: ViewModifier {
    func body(content: Content) -> some View {
        GeometryReader { geo in
            content
                .padding(.top, max(0, Theme.Spacing.unifiedToolbarHeight - geo.safeAreaInsets.top))
        }
    }
}
