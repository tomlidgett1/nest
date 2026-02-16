import SwiftUI
import Combine

/// Main Calendar tab view — weekly/monthly grid + event popover.
/// Toolbar controls live in the main window toolbar (NotesListView).
struct CalendarView: View {

    @Environment(AppState.self) private var appState
    private var calendar: GoogleCalendarService { appState.googleCalendarService }

    // MARK: - Bindings (owned by NotesListView for toolbar)

    @Binding var viewMode: CalendarViewMode
    @Binding var currentDate: Date

    // MARK: - Local State

    @State private var selectedEvent: CalendarEvent?
    @State private var calendarEvents: [CalendarEvent] = []
    @State private var isLoading = false

    /// 10-second auto-refresh timer for new calendar invites.
    private let refreshTimer = Timer.publish(every: 10, on: .main, in: .common).autoconnect()

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            if calendar.isConnected {
                calendarContent
            } else {
                emptyState
            }
        }
        .background(Theme.background)
        .task(id: "\(currentDate.timeIntervalSince1970)-\(viewMode.rawValue)") {
            await loadEvents()
        }
        .task {
            if calendar.calendars.isEmpty {
                await calendar.fetchAllCalendars()
            }
        }
        .onChange(of: calendar.calendars) { _, _ in
            calendar.invalidateEventCache()
            Task { await loadEvents() }
        }
        .onReceive(refreshTimer) { _ in
            guard calendar.isConnected else { return }
            Task { await loadEvents(forceRefresh: true) }
        }
    }

    // MARK: - Calendar Content

    @ViewBuilder
    private var calendarContent: some View {
        ZStack {
            switch viewMode {
            case .week:
                CalendarWeekView(
                    weekStart: weekStart,
                    events: visibleEvents,
                    selectedEvent: $selectedEvent,
                    calendars: calendar.calendars
                )
            case .month:
                CalendarMonthView(
                    month: monthStart,
                    events: visibleEvents,
                    selectedEvent: $selectedEvent,
                    calendars: calendar.calendars
                )
            }

            if isLoading {
                VStack {
                    ProgressView()
                        .controlSize(.small)
                        .padding(8)
                        .background(.ultraThinMaterial)
                        .cornerRadius(8)
                    Spacer()
                }
                .padding(.top, 8)
            }
        }
        .popover(item: $selectedEvent, arrowEdge: .trailing) { event in
            CalendarEventPopover(event: event, calendars: calendar.calendars)
                .frame(width: 340)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "calendar.badge.plus")
                .font(.system(size: 48))
                .foregroundColor(Theme.textQuaternary)
            Text("Connect Google Calendar")
                .font(Theme.headingFont(16))
                .foregroundColor(Theme.textPrimary)
            Text("Sign in with Google to see your calendar events.")
                .font(Theme.bodyFont(13))
                .foregroundColor(Theme.textSecondary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Date Calculations

    private var weekStart: Date {
        let cal = Foundation.Calendar.current
        let weekday = cal.component(.weekday, from: currentDate)
        return cal.date(byAdding: .day, value: -(weekday - cal.firstWeekday), to: cal.startOfDay(for: currentDate))!
    }

    private var weekEnd: Date {
        Foundation.Calendar.current.date(byAdding: .day, value: 7, to: weekStart)!
    }

    private var monthStart: Date {
        let cal = Foundation.Calendar.current
        let comps = cal.dateComponents([.year, .month], from: currentDate)
        return cal.date(from: comps)!
    }

    private var monthEnd: Date {
        Foundation.Calendar.current.date(byAdding: .month, value: 1, to: monthStart)!
    }

    // MARK: - Data

    private var visibleEvents: [CalendarEvent] {
        let visibleCalIds = Set(calendar.calendars.filter(\.isVisible).map(\.id))
        return calendarEvents.filter { event in
            guard let calId = event.calendarId else { return true }
            return visibleCalIds.contains(calId)
        }
    }

    private func loadEvents(forceRefresh: Bool = false) async {
        if !forceRefresh { isLoading = true }

        let start: Date
        let end: Date

        switch viewMode {
        case .week:
            start = weekStart
            end = weekEnd
        case .month:
            let cal = Foundation.Calendar.current
            let firstWeekday = cal.component(.weekday, from: monthStart)
            let overflowBefore = firstWeekday - cal.firstWeekday
            start = cal.date(byAdding: .day, value: -overflowBefore, to: monthStart)!
            end = cal.date(byAdding: .day, value: 42, to: start)!
        }

        let events = await calendar.fetchEventsForRange(start: start, end: end, forceRefresh: forceRefresh)
        await MainActor.run {
            calendarEvents = events
            isLoading = false
        }
    }
}

// MARK: - CalendarEvent Hashable for popover(item:)

extension CalendarEvent: Hashable {
    static func == (lhs: CalendarEvent, rhs: CalendarEvent) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}
