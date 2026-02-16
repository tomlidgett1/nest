import Foundation
import SwiftUI

// MARK: - Calendar View Mode

/// Controls which calendar layout is displayed.
enum CalendarViewMode: String, CaseIterable {
    case week
    case month

    var displayName: String {
        switch self {
        case .week: return "Week"
        case .month: return "Month"
        }
    }

    var icon: String {
        switch self {
        case .week: return "calendar.day.timeline.left"
        case .month: return "calendar"
        }
    }
}

// MARK: - Google Calendar (Sub-calendar)

/// Represents a single calendar within a Google account (e.g. "Work", "Personal", "Birthdays").
/// Each Google account can have multiple calendars, each with its own color and visibility toggle.
struct GoogleCalendar: Identifiable, Codable, Equatable {
    let id: String              // Google calendar ID (e.g. "primary", "abc@group.calendar.google.com")
    let accountId: String       // Links to GoogleCalendarAccount.id
    let summary: String         // Display name ("Work", "Personal", etc.)
    let backgroundColor: String? // Hex color from Google (e.g. "#4285f4")
    let foregroundColor: String? // Text color from Google
    let isPrimary: Bool
    var isVisible: Bool = true  // User toggle for show/hide

    /// SwiftUI color parsed from the Google hex background color.
    var color: Color {
        guard let hex = backgroundColor else { return Theme.olive }
        return Color(hex: hex) ?? Theme.olive
    }
}

// MARK: - Color Hex Extension

extension Color {
    /// Create a Color from a hex string like "#4285f4" or "4285f4".
    init?(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        guard hexSanitized.count == 6 else { return nil }

        var rgb: UInt64 = 0
        Scanner(string: hexSanitized).scanHexInt64(&rgb)

        let r = Double((rgb >> 16) & 0xFF) / 255.0
        let g = Double((rgb >> 8) & 0xFF) / 255.0
        let b = Double(rgb & 0xFF) / 255.0

        self.init(red: r, green: g, blue: b)
    }
}
