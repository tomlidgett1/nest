import SwiftUI

/// Monthly calendar grid with day cells and event indicators.
struct CalendarMonthView: View {

    let month: Date
    let events: [CalendarEvent]
    @Binding var selectedEvent: CalendarEvent?
    let calendars: [GoogleCalendar]

    @State private var selectedDay: Date?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)

    var body: some View {
        VStack(spacing: 0) {
            // Day-of-week headers
            dayOfWeekHeaders

            Rectangle().fill(Theme.divider).frame(height: 1)

            // Month grid
            ScrollView {
                VStack(spacing: 0) {
                    LazyVGrid(columns: columns, spacing: 0) {
                        ForEach(gridDays, id: \.self) { date in
                            MonthDayCell(
                                date: date,
                                isCurrentMonth: isInCurrentMonth(date),
                                isToday: Foundation.Calendar.current.isDateInToday(date),
                                isSelected: selectedDay.map { Foundation.Calendar.current.isDate($0, inSameDayAs: date) } ?? false,
                                events: eventsForDay(date),
                                calendars: calendars
                            ) {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    if selectedDay.map({ Foundation.Calendar.current.isDate($0, inSameDayAs: date) }) == true {
                                        selectedDay = nil
                                    } else {
                                        selectedDay = date
                                    }
                                }
                            }
                        }
                    }

                    // Day events list
                    if let day = selectedDay {
                        CalendarDayEventsListView(
                            date: day,
                            events: eventsForDay(day),
                            selectedEvent: $selectedEvent,
                            calendars: calendars
                        )
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
            }
        }
        .onChange(of: month) { _, _ in
            selectedDay = nil
        }
    }

    // MARK: - Day of Week Headers

    private var dayOfWeekHeaders: some View {
        HStack(spacing: 0) {
            ForEach(dayOfWeekLabels, id: \.self) { label in
                Text(label)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Theme.textTertiary)
                    .textCase(.uppercase)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
        }
        .background(Theme.background)
    }

    // MARK: - Grid Calculations

    private var gridDays: [Date] {
        let cal = Foundation.Calendar.current
        let firstWeekday = cal.component(.weekday, from: month)
        let offsetToStart = (firstWeekday - cal.firstWeekday + 7) % 7

        let gridStart = cal.date(byAdding: .day, value: -offsetToStart, to: month)!

        return (0..<42).map { offset in
            cal.date(byAdding: .day, value: offset, to: gridStart)!
        }
    }

    private var dayOfWeekLabels: [String] {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE"
        let cal = Foundation.Calendar.current
        let refSunday = cal.date(from: DateComponents(weekday: cal.firstWeekday))!
        return (0..<7).map { offset in
            formatter.string(from: cal.date(byAdding: .day, value: offset, to: refSunday)!)
        }
    }

    private func isInCurrentMonth(_ date: Date) -> Bool {
        let cal = Foundation.Calendar.current
        return cal.component(.month, from: date) == cal.component(.month, from: month)
    }

    private func eventsForDay(_ date: Date) -> [CalendarEvent] {
        let cal = Foundation.Calendar.current
        return events.filter { event in
            if event.isAllDay {
                let start = cal.startOfDay(for: event.startDate)
                let end = cal.startOfDay(for: event.endDate)
                let day = cal.startOfDay(for: date)
                return day >= start && day < end
            }
            return cal.isDate(event.startDate, inSameDayAs: date)
        }
        .sorted { $0.startDate < $1.startDate }
    }
}

// MARK: - Month Day Cell

private struct MonthDayCell: View {

    let date: Date
    let isCurrentMonth: Bool
    let isToday: Bool
    let isSelected: Bool
    let events: [CalendarEvent]
    let calendars: [GoogleCalendar]
    let onTap: () -> Void

    @State private var isHovered = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Day number
            HStack {
                Text("\(Foundation.Calendar.current.component(.day, from: date))")
                    .font(.system(size: 13, weight: isToday ? .bold : .regular))
                    .foregroundColor(dayNumberColor)
                    .frame(width: 24, height: 24)
                    .background(isToday ? Theme.olive.opacity(0.15) : Color.clear)
                    .cornerRadius(12)
                Spacer()
            }

            // Event bars (max 3)
            VStack(alignment: .leading, spacing: 2) {
                ForEach(events.prefix(3), id: \.id) { event in
                    eventBar(event)
                }
                if events.count > 3 {
                    Text("+\(events.count - 3) more")
                        .font(.system(size: 9))
                        .foregroundColor(Theme.textTertiary)
                        .padding(.leading, 4)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(4)
        .frame(minHeight: 90)
        .background(
            RoundedRectangle(cornerRadius: 4)
                .fill(cellBackground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(isSelected ? Theme.olive.opacity(0.4) : Color.clear, lineWidth: 1)
        )
        .onTapGesture(perform: onTap)
        .onHover { isHovered = $0 }
        .contentShape(Rectangle())
    }

    private func eventBar(_ event: CalendarEvent) -> some View {
        let color = eventColor(for: event)
        return HStack(spacing: 3) {
            RoundedRectangle(cornerRadius: 1)
                .fill(color)
                .frame(width: 3, height: 14)

            if event.isAllDay {
                Text(event.title)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                    .lineLimit(1)
            } else {
                Text(shortTime(event.startDate))
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(Theme.textSecondary)
                Text(event.title)
                    .font(.system(size: 10))
                    .foregroundColor(Theme.textPrimary)
                    .lineLimit(1)
            }
        }
    }

    private func eventColor(for event: CalendarEvent) -> Color {
        guard let calId = event.calendarId,
              let cal = calendars.first(where: { $0.id == calId }) else {
            return Theme.olive
        }
        return cal.color
    }

    private var dayNumberColor: Color {
        if !isCurrentMonth { return Theme.textQuaternary }
        if isToday { return Theme.olive }
        return Theme.textPrimary
    }

    private var cellBackground: Color {
        if isSelected { return Theme.sidebarSelection }
        if isHovered { return Theme.sidebarSelection.opacity(0.4) }
        return Color.clear
    }

    private func shortTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm"
        return formatter.string(from: date)
    }
}
