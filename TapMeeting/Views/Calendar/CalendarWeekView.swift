import SwiftUI

/// A 7-day weekly calendar grid with hourly time slots.
struct CalendarWeekView: View {

    let weekStart: Date
    let events: [CalendarEvent]
    @Binding var selectedEvent: CalendarEvent?
    let calendars: [GoogleCalendar]

    // MARK: - Layout Constants

    private let hourHeight: CGFloat = 50
    private let timeGutterWidth: CGFloat = 56
    private let headerHeight: CGFloat = 48
    private let allDayRowMinHeight: CGFloat = 28

    private var totalGridHeight: CGFloat { hourHeight * 24 }

    // MARK: - Body

    var body: some View {
        GeometryReader { geo in
            let dayColumnWidth = (geo.size.width - timeGutterWidth) / 7

            VStack(spacing: 0) {
                // Day headers
                dayHeaderRow(dayColumnWidth: dayColumnWidth)

                // All-day events row
                allDayRow(dayColumnWidth: dayColumnWidth)

                Rectangle().fill(Theme.divider).frame(height: 1)

                // Scrollable time grid
                ScrollViewReader { proxy in
                    ScrollView(.vertical, showsIndicators: true) {
                        ZStack(alignment: .topLeading) {
                            // Hour grid lines + labels
                            hourGrid(dayColumnWidth: dayColumnWidth, totalWidth: geo.size.width)

                            // Day column backgrounds
                            dayColumnBackgrounds(dayColumnWidth: dayColumnWidth)

                            // Events
                            eventsOverlay(dayColumnWidth: dayColumnWidth)

                            // Current time indicator
                            currentTimeIndicator(dayColumnWidth: dayColumnWidth, totalWidth: geo.size.width)
                        }
                        .frame(height: totalGridHeight)
                    }
                    .onAppear {
                        // Auto-scroll to 7 AM
                        // ScrollViewReader can't target arbitrary offset, so we use a workaround
                    }
                }
            }
        }
    }

    // MARK: - Day Headers

    private func dayHeaderRow(dayColumnWidth: CGFloat) -> some View {
        HStack(spacing: 0) {
            // Time gutter spacer
            Spacer().frame(width: timeGutterWidth)

            ForEach(0..<7, id: \.self) { dayOffset in
                let date = dayDate(offset: dayOffset)
                let isToday = Foundation.Calendar.current.isDateInToday(date)

                VStack(spacing: 2) {
                    Text(dayAbbreviation(offset: dayOffset))
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(isToday ? Theme.olive : Theme.textTertiary)
                        .textCase(.uppercase)

                    Text("\(Foundation.Calendar.current.component(.day, from: date))")
                        .font(.system(size: 16, weight: isToday ? .bold : .regular))
                        .foregroundColor(isToday ? Theme.olive : Theme.textPrimary)
                        .frame(width: 28, height: 28)
                        .background(isToday ? Theme.calendarTodayHighlight : Color.clear)
                        .cornerRadius(14)
                }
                .frame(width: dayColumnWidth, height: headerHeight)
            }
        }
        .frame(height: headerHeight)
        .background(Theme.background)
    }

    // MARK: - All-Day Events Row

    private func allDayRow(dayColumnWidth: CGFloat) -> some View {
        let allDayEvents = events.filter(\.isAllDay)

        return Group {
            if !allDayEvents.isEmpty {
                HStack(spacing: 0) {
                    Text("All day")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(Theme.textTertiary)
                        .frame(width: timeGutterWidth, alignment: .trailing)
                        .padding(.trailing, 6)

                    ForEach(0..<7, id: \.self) { dayOffset in
                        let date = dayDate(offset: dayOffset)
                        let dayEvents = allDayEvents.filter { isEvent($0, onDay: date) }

                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(dayEvents.prefix(2), id: \.id) { event in
                                CalendarEventCell(
                                    event: event,
                                    calendars: calendars,
                                    isSelected: selectedEvent?.id == event.id,
                                    style: .month
                                )
                                .onTapGesture { selectedEvent = event }
                            }
                            if dayEvents.count > 2 {
                                Text("+\(dayEvents.count - 2) more")
                                    .font(.system(size: 9))
                                    .foregroundColor(Theme.textTertiary)
                            }
                        }
                        .frame(width: dayColumnWidth)
                    }
                }
                .padding(.vertical, 4)
                .background(Theme.sidebarBackground.opacity(0.3))
            }
        }
    }

    // MARK: - Hour Grid

    private func hourGrid(dayColumnWidth: CGFloat, totalWidth: CGFloat) -> some View {
        ForEach(0..<24, id: \.self) { hour in
            let y = CGFloat(hour) * hourHeight

            // Hour label
            Text(hourLabel(hour))
                .font(Theme.captionFont(10))
                .foregroundColor(Theme.textTertiary)
                .frame(width: timeGutterWidth - 8, alignment: .trailing)
                .offset(x: 0, y: y - 6)

            // Grid line
            Rectangle()
                .fill(Theme.calendarGridLine)
                .frame(width: totalWidth - timeGutterWidth, height: 1)
                .offset(x: timeGutterWidth, y: y)
        }
    }

    // MARK: - Day Column Backgrounds

    private func dayColumnBackgrounds(dayColumnWidth: CGFloat) -> some View {
        ForEach(0..<7, id: \.self) { dayOffset in
            let date = dayDate(offset: dayOffset)
            let isToday = Foundation.Calendar.current.isDateInToday(date)
            let isWeekend = Foundation.Calendar.current.isDateInWeekend(date)

            Rectangle()
                .fill(isToday ? Theme.calendarTodayHighlight : (isWeekend ? Theme.calendarWeekend : Color.clear))
                .frame(width: dayColumnWidth, height: totalGridHeight)
                .offset(x: timeGutterWidth + CGFloat(dayOffset) * dayColumnWidth)
        }
    }

    // MARK: - Events Overlay

    private func eventsOverlay(dayColumnWidth: CGFloat) -> some View {
        ForEach(0..<7, id: \.self) { dayOffset in
            let date = dayDate(offset: dayOffset)
            let dayEvents = timedEvents(for: date)
            let layouts = layoutEvents(dayEvents, columnWidth: dayColumnWidth)

            ForEach(layouts, id: \.event.id) { layout in
                CalendarEventCell(
                    event: layout.event,
                    calendars: calendars,
                    isSelected: selectedEvent?.id == layout.event.id,
                    style: .week
                )
                .frame(width: layout.width, height: max(layout.height, 20))
                .offset(
                    x: timeGutterWidth + CGFloat(dayOffset) * dayColumnWidth + layout.xOffset + 1,
                    y: yOffset(for: layout.event.startDate)
                )
                .onTapGesture { selectedEvent = layout.event }
            }
        }
    }

    // MARK: - Current Time Indicator

    private func currentTimeIndicator(dayColumnWidth: CGFloat, totalWidth: CGFloat) -> some View {
        let now = Date.now
        let todayOffset = dayOffsetForDate(now)

        return Group {
            if let offset = todayOffset {
                let y = yOffset(for: now)
                let x = timeGutterWidth + CGFloat(offset) * dayColumnWidth

                // Red dot
                Circle()
                    .fill(Theme.calendarCurrentTime)
                    .frame(width: 8, height: 8)
                    .offset(x: x - 4, y: y - 4)

                // Red line across the day column
                Rectangle()
                    .fill(Theme.calendarCurrentTime)
                    .frame(width: dayColumnWidth, height: 2)
                    .offset(x: x, y: y - 1)
            }
        }
    }

    // MARK: - Event Layout Algorithm

    struct EventLayout {
        let event: CalendarEvent
        let xOffset: CGFloat
        let width: CGFloat
        let height: CGFloat
    }

    private func layoutEvents(_ events: [CalendarEvent], columnWidth: CGFloat) -> [EventLayout] {
        guard !events.isEmpty else { return [] }

        let sorted = events.sorted { $0.startDate < $1.startDate }
        var columns: [[CalendarEvent]] = []

        for event in sorted {
            var placed = false
            for i in columns.indices {
                if let last = columns[i].last, last.endDate <= event.startDate {
                    columns[i].append(event)
                    placed = true
                    break
                }
            }
            if !placed {
                columns.append([event])
            }
        }

        let colCount = max(columns.count, 1)
        let eventWidth = (columnWidth - 4) / CGFloat(colCount)

        var result: [EventLayout] = []
        for (colIndex, column) in columns.enumerated() {
            for event in column {
                let height = max(CGFloat(event.durationHours) * hourHeight, 20)
                result.append(EventLayout(
                    event: event,
                    xOffset: CGFloat(colIndex) * eventWidth,
                    width: eventWidth - 1,
                    height: height
                ))
            }
        }

        return result
    }

    // MARK: - Helpers

    private func dayDate(offset: Int) -> Date {
        Foundation.Calendar.current.date(byAdding: .day, value: offset, to: weekStart)!
    }

    private func dayAbbreviation(offset: Int) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE"
        return formatter.string(from: dayDate(offset: offset))
    }

    private func hourLabel(_ hour: Int) -> String {
        if hour == 0 { return "12 AM" }
        if hour < 12 { return "\(hour) AM" }
        if hour == 12 { return "12 PM" }
        return "\(hour - 12) PM"
    }

    private func yOffset(for date: Date) -> CGFloat {
        let cal = Foundation.Calendar.current
        let hour = cal.component(.hour, from: date)
        let minute = cal.component(.minute, from: date)
        return (CGFloat(hour) + CGFloat(minute) / 60.0) * hourHeight
    }

    private func timedEvents(for date: Date) -> [CalendarEvent] {
        let cal = Foundation.Calendar.current
        return events.filter { event in
            !event.isAllDay && cal.isDate(event.startDate, inSameDayAs: date)
        }
    }

    private func isEvent(_ event: CalendarEvent, onDay date: Date) -> Bool {
        let cal = Foundation.Calendar.current
        let start = cal.startOfDay(for: event.startDate)
        let end = cal.startOfDay(for: event.endDate)
        let day = cal.startOfDay(for: date)
        return day >= start && day < end
    }

    private func dayOffsetForDate(_ date: Date) -> Int? {
        let cal = Foundation.Calendar.current
        for i in 0..<7 {
            if cal.isDate(date, inSameDayAs: dayDate(offset: i)) {
                return i
            }
        }
        return nil
    }
}
