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
                isAllDay: event.isAllDay,
                calendarSource: "Apple Calendar"
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
    /// Source label for display — e.g. "Apple Calendar" or the Google account email.
    var calendarSource: String = ""

    // MARK: - Extended Fields (Calendar View)

    /// The Google Calendar sub-calendar this event belongs to.
    var calendarId: String?
    /// Event location (free-form text).
    var location: String?
    /// Event description / notes.
    var eventDescription: String?
    /// Organizer name or email.
    var organizer: String?
    /// Organizer email address (used for company logo lookup).
    var organizerEmail: String?
    /// Link to view in Google Calendar web UI.
    var htmlLink: String?
    /// Google event color ID override.
    var colorId: String?
    /// Attendee emails (parallel to attendeeNames).
    var attendeeEmails: [String] = []
    /// Attendee response statuses: email → "accepted"/"declined"/"tentative"/"needsAction".
    var responseStatuses: [String: String] = [:]

    // MARK: - Computed

    /// The domain extracted from the organizer email (e.g. "acme.com" from "jane@acme.com").
    /// Returns nil for common free email providers (gmail, outlook, etc.) since their favicons aren't meaningful.
    var organizerDomain: String? {
        guard let email = organizerEmail,
              let domain = email.split(separator: "@").last.map(String.init) else { return nil }
        let generic: Set<String> = [
            "gmail.com", "googlemail.com", "outlook.com", "hotmail.com",
            "live.com", "yahoo.com", "icloud.com", "me.com", "aol.com",
            "protonmail.com", "proton.me", "mail.com"
        ]
        return generic.contains(domain.lowercased()) ? nil : domain
    }

    /// URL for the organizer's company favicon via Google's service.
    var organizerLogoURL: URL? {
        guard let domain = organizerDomain else { return nil }
        return URL(string: "https://www.google.com/s2/favicons?domain=\(domain)&sz=128")
    }

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

    /// Full date + time formatted for display.
    var formattedDateAndTime: String {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "EEEE, MMM d"
        let timeFormatter = DateFormatter()
        timeFormatter.timeStyle = .short
        if isAllDay {
            return "\(dateFormatter.string(from: startDate)) · All day"
        }
        return "\(dateFormatter.string(from: startDate)) · \(timeFormatter.string(from: startDate)) – \(timeFormatter.string(from: endDate))"
    }

    /// Duration in hours.
    var durationHours: Double {
        endDate.timeIntervalSince(startDate) / 3600.0
    }

    /// Human-readable duration string.
    var formattedDuration: String {
        let minutes = Int(endDate.timeIntervalSince(startDate) / 60)
        if minutes < 60 {
            return "\(minutes)m"
        }
        let hours = minutes / 60
        let remainingMinutes = minutes % 60
        if remainingMinutes == 0 {
            return "\(hours)h"
        }
        return "\(hours)h \(remainingMinutes)m"
    }

    /// Detect meeting platform from URL.
    var meetingPlatform: String? {
        guard let url = meetingURL?.absoluteString.lowercased() else { return nil }
        if url.contains("zoom.us") { return "Zoom" }
        if url.contains("meet.google.com") { return "Google Meet" }
        if url.contains("teams.microsoft.com") { return "Teams" }
        return "Meeting"
    }

    /// SF Symbol for the meeting platform.
    var meetingPlatformIcon: String {
        guard let url = meetingURL?.absoluteString.lowercased() else { return "video" }
        if url.contains("zoom.us") { return "video.fill" }
        if url.contains("meet.google.com") { return "video.fill" }
        if url.contains("teams.microsoft.com") { return "video.fill" }
        return "link"
    }
}
