import Foundation
import EventKit

/// Reads calendar events from EventKit to detect upcoming meetings.
@Observable
final class CalendarService {
    
    private let eventStore = EKEventStore()
    
    /// Upcoming events within the next 24 hours (local EventKit + Google Calendar merged).
    private(set) var upcomingEvents: [CalendarEvent] = []
    
    /// Reference to Google Calendar service for merging events.
    var googleCalendarService: GoogleCalendarService?
    
    /// The next meeting that qualifies for auto-prompt (2+ attendees).
    var nextMeeting: CalendarEvent? {
        upcomingEvents.first { $0.attendeeCount >= Constants.Calendar.minimumAttendees }
    }
    
    // MARK: - Fetch Events
    
    /// Refresh the list of upcoming events.
    func fetchUpcomingEvents() {
        let calendars = eventStore.calendars(for: .event)
        
        let now = Date.now
        let endDate = Calendar.current.date(byAdding: .hour, value: 24, to: now)!
        
        let predicate = eventStore.predicateForEvents(
            withStart: now,
            end: endDate,
            calendars: calendars
        )
        
        let events = eventStore.events(matching: predicate)
        
        var localEvents = events.compactMap { event -> CalendarEvent? in
            guard let startDate = event.startDate,
                  let endDate = event.endDate else { return nil }
            
            return CalendarEvent(
                id: event.eventIdentifier,
                title: event.title ?? "Untitled Event",
                startDate: startDate,
                endDate: endDate,
                attendeeCount: event.attendees?.count ?? 0,
                isAllDay: event.isAllDay
            )
        }
        .filter { !$0.isAllDay }
        
        // Merge Google Calendar events if connected
        if let googleEvents = googleCalendarService?.events {
            // Deduplicate by title + start time (same event in both calendars)
            let existingKeys = Set(localEvents.map { "\($0.title)-\($0.startDate.timeIntervalSince1970)" })
            let uniqueGoogleEvents = googleEvents.filter { event in
                !existingKeys.contains("\(event.title)-\(event.startDate.timeIntervalSince1970)")
            }
            localEvents.append(contentsOf: uniqueGoogleEvents)
        }
        
        upcomingEvents = localEvents.sorted { $0.startDate < $1.startDate }
    }
    
    /// Check if there's a meeting starting within the reminder lead time.
    func meetingStartingSoon() -> CalendarEvent? {
        let leadTime = TimeInterval(Constants.Calendar.reminderLeadMinutes * 60)
        let threshold = Date.now.addingTimeInterval(leadTime)
        
        return upcomingEvents.first { event in
            event.startDate <= threshold &&
            event.startDate > Date.now &&
            event.attendeeCount >= Constants.Calendar.minimumAttendees
        }
    }
    
    /// Start a timer to periodically refresh events and check for upcoming meetings.
    func startMonitoring(onMeetingSoon: @escaping (CalendarEvent) -> Void) {
        // Fetch immediately.
        fetchUpcomingEvents()
        
        // Poll every 30 seconds.
        Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.fetchUpcomingEvents()
            if let meeting = self?.meetingStartingSoon() {
                onMeetingSoon(meeting)
            }
        }
    }
}

/// A simplified calendar event for display and meeting detection.
struct CalendarEvent: Identifiable {
    let id: String
    let title: String
    let startDate: Date
    let endDate: Date
    let attendeeCount: Int
    let isAllDay: Bool
    var meetingURL: URL?
    /// Display names or emails of attendees (excluding the calendar owner).
    var attendeeNames: [String] = []
    
    var timeUntilStart: TimeInterval {
        startDate.timeIntervalSinceNow
    }
    
    var isHappeningNow: Bool {
        Date.now >= startDate && Date.now <= endDate
    }
    
    var formattedTime: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return "\(formatter.string(from: startDate)) – \(formatter.string(from: endDate))"
    }
}
