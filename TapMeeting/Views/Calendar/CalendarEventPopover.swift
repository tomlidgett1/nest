import SwiftUI

/// Detail popover shown when clicking a calendar event.
struct CalendarEventPopover: View {

    let event: CalendarEvent
    let calendars: [GoogleCalendar]

    @State private var showFullDescription = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                // Title
                HStack(spacing: 8) {
                    if event.organizerDomain != nil {
                        CompanyLogoView(event: event, size: 28)
                    } else {
                        Circle()
                            .fill(eventColor)
                            .frame(width: 10, height: 10)
                    }
                    Text(event.title)
                        .font(Theme.headingFont(16))
                        .foregroundColor(Theme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                // Date & Time
                HStack(spacing: 6) {
                    Image(systemName: "calendar")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.olive)
                    Text(event.formattedDateAndTime)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textSecondary)
                }

                // Duration
                if !event.isAllDay {
                    HStack(spacing: 6) {
                        Image(systemName: "clock")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.olive)
                        Text(event.formattedDuration)
                            .font(.system(size: 13))
                            .foregroundColor(Theme.textSecondary)
                    }
                }

                // Location
                if let location = event.location, !location.isEmpty {
                    HStack(alignment: .top, spacing: 6) {
                        Image(systemName: "mappin.and.ellipse")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.olive)
                        Text(location)
                            .font(.system(size: 13))
                            .foregroundColor(Theme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                // Meeting Link
                if let meetingURL = event.meetingURL {
                    meetingLinkButton(url: meetingURL)
                }

                // Attendees
                if !event.attendeeNames.isEmpty {
                    sectionDivider
                    attendeesSection
                }

                // Description
                if let desc = event.eventDescription, !desc.isEmpty {
                    sectionDivider
                    descriptionSection(desc)
                }

                // Metadata
                sectionDivider
                metadataSection
            }
            .padding(16)
        }
        .frame(maxHeight: 420)
        .background(Theme.cardBackground)
    }

    // MARK: - Meeting Link

    private func meetingLinkButton(url: URL) -> some View {
        Button {
            NSWorkspace.shared.open(url)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: event.meetingPlatformIcon)
                    .font(.system(size: 13))
                Text("Join \(event.meetingPlatform ?? "Meeting")")
                    .font(.system(size: 13, weight: .medium))
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 10))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Theme.olive)
            .cornerRadius(8)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Attendees

    private var attendeesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Attendees (\(event.attendeeNames.count))")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Theme.textTertiary)
                .textCase(.uppercase)

            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(zip(event.attendeeNames, event.attendeeNames.indices)), id: \.1) { name, index in
                    let email = index < event.attendeeEmails.count ? event.attendeeEmails[index] : ""
                    let status = event.responseStatuses[email]

                    HStack(spacing: 8) {
                        // Initials avatar
                        Circle()
                            .fill(Theme.sidebarSelection)
                            .frame(width: 24, height: 24)
                            .overlay(
                                Text(initials(from: name))
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(Theme.textSecondary)
                            )

                        Text(name)
                            .font(.system(size: 12))
                            .foregroundColor(Theme.textPrimary)

                        Spacer()

                        if let status {
                            responseIcon(status)
                        }
                    }
                }
            }
        }
    }

    private func responseIcon(_ status: String) -> some View {
        let (icon, color): (String, Color) = switch status {
        case "accepted": ("checkmark.circle.fill", Color.green.opacity(0.7))
        case "declined": ("xmark.circle.fill", Color.red.opacity(0.6))
        case "tentative": ("questionmark.circle.fill", Theme.textTertiary)
        default: ("minus.circle", Theme.textQuaternary)
        }

        return Image(systemName: icon)
            .font(.system(size: 12))
            .foregroundColor(color)
    }

    // MARK: - Description

    private func descriptionSection(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Description")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Theme.textTertiary)
                .textCase(.uppercase)

            Text(text)
                .font(.system(size: 12))
                .foregroundColor(Theme.textSecondary)
                .lineLimit(showFullDescription ? nil : 4)
                .fixedSize(horizontal: false, vertical: true)

            if text.count > 200 && !showFullDescription {
                Button {
                    showFullDescription = true
                } label: {
                    Text("Show more")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Theme.olive)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Metadata

    private var metadataSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !event.calendarSource.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "person.circle")
                        .font(.system(size: 10))
                        .foregroundColor(Theme.textQuaternary)
                    Text("via \(event.calendarSource)")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textTertiary)
                }
            }

            if let organizer = event.organizer, !organizer.isEmpty, organizer != event.calendarSource {
                HStack(spacing: 6) {
                    CompanyLogoView(event: event, size: 18)
                    Text("Organizer: \(organizer)")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textTertiary)
                }
            }

            if let htmlLink = event.htmlLink, let url = URL(string: htmlLink) {
                Button {
                    NSWorkspace.shared.open(url)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.up.right.square")
                            .font(.system(size: 10))
                        Text("Open in Google Calendar")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(Theme.olive)
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
        }
    }

    // MARK: - Helpers

    private var sectionDivider: some View {
        Rectangle()
            .fill(Theme.divider)
            .frame(height: 1)
    }

    private var eventColor: Color {
        guard let calId = event.calendarId,
              let cal = calendars.first(where: { $0.id == calId }) else {
            return Theme.olive
        }
        return cal.color
    }

    private func initials(from name: String) -> String {
        let parts = name.split(separator: " ")
        if parts.count >= 2 {
            return String(parts[0].prefix(1) + parts[1].prefix(1)).uppercased()
        }
        return String(name.prefix(1)).uppercased()
    }
}
