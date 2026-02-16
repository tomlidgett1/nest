import SwiftUI

/// A single event block rendered on the calendar grid.
/// Adapts its appearance for week view (absolute positioned, colored background)
/// and month view (horizontal bar with left border).
struct CalendarEventCell: View {

    let event: CalendarEvent
    let calendars: [GoogleCalendar]
    var isSelected: Bool = false
    var style: Style = .week

    enum Style {
        case week   // Colored background, white text, positioned in day column
        case month  // Left-bordered bar, dark text, inline in day cell
    }

    @State private var isHovered = false

    var body: some View {
        switch style {
        case .week:
            weekCell
        case .month:
            monthCell
        }
    }

    // MARK: - Week View Cell

    private var weekCell: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(event.title)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.white)
                .lineLimit(2)

            if let location = event.location, !location.isEmpty {
                Text(location)
                    .font(.system(size: 9))
                    .foregroundColor(.white.opacity(0.8))
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 5)
        .padding(.vertical, 3)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 4)
                .fill(eventColor.opacity(isHovered ? 0.95 : 0.85))
        )
        .clipped()
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(isSelected ? Color.white : Color.clear, lineWidth: 2)
        )
        .shadow(color: .black.opacity(0.08), radius: 2, y: 1)
        .onHover { isHovered = $0 }
        .contentShape(Rectangle())
    }

    // MARK: - Month View Cell

    private var monthCell: some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(eventColor)
                .frame(width: 3)

            if event.isAllDay {
                Text(event.title)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                    .lineLimit(1)
            } else {
                Text(timeLabel)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(Theme.textSecondary)
                Text(event.title)
                    .font(.system(size: 10))
                    .foregroundColor(Theme.textPrimary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 1)
        .padding(.horizontal, 2)
        .background(
            RoundedRectangle(cornerRadius: 3)
                .fill(isSelected ? Theme.sidebarSelection : (isHovered ? Theme.sidebarSelection.opacity(0.5) : Color.clear))
        )
        .onHover { isHovered = $0 }
        .contentShape(Rectangle())
    }

    // MARK: - Helpers

    private var eventColor: Color {
        guard let calId = event.calendarId,
              let cal = calendars.first(where: { $0.id == calId }) else {
            return Theme.olive
        }
        return cal.color
    }

    private var timeLabel: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: event.startDate)
    }
}
