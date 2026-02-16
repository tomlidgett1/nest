import SwiftUI

/// Tap's design system — warm cream palette inspired by Granola.
///
/// The entire app uses warm, off-white backgrounds with olive/brown text.
/// No cold blues, no system grays. Everything feels like paper.
enum Theme {
    
    // MARK: - Backgrounds
    
    /// Main content background — warm cream.
    static let background = Color(red: 0.98, green: 0.97, blue: 0.95)
    
    /// Sidebar background — slightly cooler cream.
    static let sidebarBackground = Color(red: 0.97, green: 0.96, blue: 0.94)
    
    /// Card/elevated surface background.
    static let cardBackground = Color.white
    
    /// Bottom bar background.
    static let barBackground = Color.white
    
    // MARK: - Text
    
    /// Primary text — warm near-black.
    static let textPrimary = Color(red: 0.24, green: 0.22, blue: 0.16)
    
    /// Secondary text — warm medium gray.
    static let textSecondary = Color(red: 0.55, green: 0.52, blue: 0.47)
    
    /// Tertiary text — warm light gray.
    static let textTertiary = Color(red: 0.72, green: 0.69, blue: 0.64)
    
    /// Quaternary text — very faint.
    static let textQuaternary = Color(red: 0.82, green: 0.80, blue: 0.76)
    
    // MARK: - Accents
    
    /// Olive/khaki accent — for date badges, section markers, tags.
    static let olive = Color(red: 0.64, green: 0.60, blue: 0.40)
    
    /// Light olive for badge backgrounds.
    static let oliveFaint = Color(red: 0.80, green: 0.77, blue: 0.60).opacity(0.3)
    
    /// Subtle divider colour.
    static let divider = Color(red: 0.88, green: 0.86, blue: 0.82)
    
    /// Sidebar item hover/selection.
    static let sidebarSelection = Color(red: 0.93, green: 0.91, blue: 0.87)
    
    /// Recording red — slightly warm.
    static let recording = Color(red: 0.85, green: 0.25, blue: 0.20)

    // MARK: - Calendar

    /// Subtle grid line for calendar hour rows.
    static let calendarGridLine = divider.opacity(0.5)
    /// Today column highlight.
    static let calendarTodayHighlight = Color(red: 0.64, green: 0.60, blue: 0.40).opacity(0.08)
    /// Current time indicator line (red).
    static let calendarCurrentTime = Color(red: 0.85, green: 0.25, blue: 0.20)
    /// Weekend column background tint.
    static let calendarWeekend = Color(red: 0.97, green: 0.96, blue: 0.94).opacity(0.5)
    
    // MARK: - Tag Colours
    
    /// Palette of subtle colours for auto-assigning to tags.
    static let tagColors: [(hex: String, color: Color)] = [
        ("#A3B18A", Color(red: 0.64, green: 0.69, blue: 0.54)),   // sage green
        ("#B5838D", Color(red: 0.71, green: 0.51, blue: 0.55)),   // dusty rose
        ("#8B9EB7", Color(red: 0.55, green: 0.62, blue: 0.72)),   // slate blue
        ("#C9A96E", Color(red: 0.79, green: 0.66, blue: 0.43)),   // warm gold
        ("#9B8EC1", Color(red: 0.61, green: 0.56, blue: 0.76)),   // soft purple
        ("#7DAFA5", Color(red: 0.49, green: 0.69, blue: 0.65)),   // teal
        ("#CB9B7D", Color(red: 0.80, green: 0.61, blue: 0.49)),   // terracotta
        ("#8DA3A6", Color(red: 0.55, green: 0.64, blue: 0.65)),   // grey teal
        ("#B8A9C9", Color(red: 0.72, green: 0.66, blue: 0.79)),   // lavender
        ("#A4B494", Color(red: 0.64, green: 0.71, blue: 0.58)),   // moss
    ]
    
    /// Get a colour for a tag, cycling through the palette based on index.
    static func tagColor(at index: Int) -> Color {
        tagColors[index % tagColors.count].color
    }
    
    /// Get a colour for a tag by its hex string, falling back to olive.
    static func tagColor(hex: String?) -> Color {
        guard let hex else { return olive }
        return tagColors.first(where: { $0.hex == hex })?.color ?? olive
    }
    
    // MARK: - Dimensions
    
    enum Spacing {
        static let sidebarWidth: CGFloat = 200
        static let contentPadding: CGFloat = 32
        static let contentTopPadding: CGFloat = 24
        static let titleTopPadding: CGFloat = 16
        /// Top padding for main content to align with sidebar search bar.
        static let mainContentTopPadding: CGFloat = 7
        /// Expected height of the unified title bar + toolbar on macOS.
        /// Used to compensate when SwiftUI reports stale safe area insets on first layout.
        static let unifiedToolbarHeight: CGFloat = 40
        static let sidebarItemHeight: CGFloat = 30
        static let sidebarPadding: CGFloat = 12
        /// Tighter padding for selectable sidebar items (icon + text) so content aligns with overlay.
        static let sidebarItemContentPadding: CGFloat = 8
    }
    
    // MARK: - Fonts
    
    /// Used for large titles (meeting name, "Coming up").
    static func titleFont(_ size: CGFloat = 24) -> Font {
        .system(size: size, weight: .bold, design: .serif)
    }
    
    /// Used for section headers ("January Performance Review").
    static func headingFont(_ size: CGFloat = 15) -> Font {
        .system(size: size, weight: .semibold, design: .serif)
    }
    
    /// Body text.
    static func bodyFont(_ size: CGFloat = 14) -> Font {
        .system(size: size, weight: .regular)
    }
    
    /// Small/caption text.
    static func captionFont(_ size: CGFloat = 12) -> Font {
        .system(size: size, weight: .regular)
    }
}
