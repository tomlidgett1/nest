import SwiftUI

/// A list of events for a selected day, shown below the month grid.
struct CalendarDayEventsListView: View {

    let date: Date
    let events: [CalendarEvent]
    @Binding var selectedEvent: CalendarEvent?
    let calendars: [GoogleCalendar]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(Theme.divider).frame(height: 1)

            // Header
            HStack {
                Text(headerLabel)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.textPrimary)
                Spacer()
                Text("\(events.count) event\(events.count == 1 ? "" : "s")")
                    .font(Theme.captionFont(11))
                    .foregroundColor(Theme.textTertiary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            if events.isEmpty {
                HStack {
                    Spacer()
                    Text("No events")
                        .font(Theme.captionFont(12))
                        .foregroundColor(Theme.textTertiary)
                    Spacer()
                }
                .padding(.vertical, 16)
            } else {
                VStack(spacing: 0) {
                    ForEach(events, id: \.id) { event in
                        eventRow(event)
                    }
                }
            }
        }
        .background(Theme.sidebarBackground.opacity(0.3))
        .cornerRadius(8)
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
    }

    // MARK: - Event Row

    private func eventRow(_ event: CalendarEvent) -> some View {
        let isSelected = selectedEvent?.id == event.id

        return HStack(spacing: 10) {
            // Calendar color dot
            Circle()
                .fill(eventColor(for: event))
                .frame(width: 8, height: 8)

            // Time
            if event.isAllDay {
                Text("All day")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Theme.textSecondary)
                    .frame(width: 60, alignment: .leading)
            } else {
                Text(timeLabel(event.startDate))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Theme.textSecondary)
                    .frame(width: 60, alignment: .leading)
            }

            // Title
            Text(event.title)
                .font(.system(size: 13))
                .foregroundColor(Theme.textPrimary)
                .lineLimit(1)

            Spacer()

            // Duration
            if !event.isAllDay {
                Text(event.formattedDuration)
                    .font(Theme.captionFont(11))
                    .foregroundColor(Theme.textTertiary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(isSelected ? Theme.sidebarSelection : Color.clear)
        .cornerRadius(6)
        .contentShape(Rectangle())
        .onTapGesture {
            selectedEvent = event
        }
    }

    // MARK: - Helpers

    private var headerLabel: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMMM d, yyyy"
        return formatter.string(from: date)
    }

    private func timeLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    private func eventColor(for event: CalendarEvent) -> Color {
        guard let calId = event.calendarId,
              let cal = calendars.first(where: { $0.id == calId }) else {
            return Theme.olive
        }
        return cal.color
    }
}
