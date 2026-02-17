import SwiftUI

/// Popover for creating a new Google Calendar event.
/// Matches the visual style of CalendarEventPopover.
struct CalendarCreateEventView: View {

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    private var calendarService: GoogleCalendarService { appState.googleCalendarService }

    /// Optional pre-filled start/end from drag-to-create.
    var initialStart: Date?
    var initialEnd: Date?
    var onCreated: (() -> Void)?

    // MARK: - Form State

    @State private var title = ""
    @State private var startDate = Date.now
    @State private var endDate = Calendar.current.date(byAdding: .hour, value: 1, to: .now)!
    @State private var isAllDay = false
    @State private var location = ""
    @State private var eventDescription = ""
    @State private var addGoogleMeet = false
    @State private var selectedCalendarId = "primary"
    @State private var attendeeInput = ""
    @State private var attendeeEmails: [String] = []
    @State private var sendNotifications = true

    @State private var isCreating = false
    @State private var errorMessage: String?

    @FocusState private var isTitleFocused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                // Title input
                HStack(spacing: 8) {
                    calendarColorDot
                    TextField("Add title", text: $title)
                        .textFieldStyle(.plain)
                        .font(Theme.headingFont(16))
                        .foregroundColor(Theme.textPrimary)
                        .focused($isTitleFocused)
                }

                // Date & Time
                HStack(spacing: 6) {
                    Image(systemName: "calendar")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.olive)

                    if isAllDay {
                        DatePicker("", selection: $startDate, displayedComponents: .date)
                            .labelsHidden()
                            .datePickerStyle(.compact)
                            .font(.system(size: 13))
                    } else {
                        DatePicker("", selection: $startDate, displayedComponents: [.date, .hourAndMinute])
                            .labelsHidden()
                            .datePickerStyle(.compact)
                            .font(.system(size: 13))
                    }

                    Text("–")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textTertiary)

                    if isAllDay {
                        DatePicker("", selection: $endDate, displayedComponents: .date)
                            .labelsHidden()
                            .datePickerStyle(.compact)
                            .font(.system(size: 13))
                    } else {
                        DatePicker("", selection: $endDate, displayedComponents: [.date, .hourAndMinute])
                            .labelsHidden()
                            .datePickerStyle(.compact)
                            .font(.system(size: 13))
                    }
                }

                // All-day toggle
                HStack(spacing: 6) {
                    Image(systemName: "clock")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.olive)
                    Toggle("All day", isOn: $isAllDay)
                        .toggleStyle(.switch)
                        .controlSize(.small)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textSecondary)
                }

                // Google Meet
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        addGoogleMeet.toggle()
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "video.fill")
                            .font(.system(size: 13))
                        Text(addGoogleMeet ? "Google Meet added" : "Add Google Meet")
                            .font(.system(size: 13, weight: .medium))
                        Spacer()
                        if addGoogleMeet {
                            Image(systemName: "checkmark")
                                .font(.system(size: 10, weight: .bold))
                        }
                    }
                    .foregroundColor(addGoogleMeet ? .white : Theme.olive)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(addGoogleMeet ? Theme.olive : Theme.olive.opacity(0.08))
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)

                // Location
                HStack(alignment: .top, spacing: 6) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.olive)
                        .padding(.top, 2)
                    TextField("Add location", text: $location)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textPrimary)
                }

                sectionDivider

                // Guests
                guestsSection

                // Description
                sectionDivider
                VStack(alignment: .leading, spacing: 6) {
                    Text("Description")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Theme.textTertiary)
                        .textCase(.uppercase)

                    TextField("Add description", text: $eventDescription, axis: .vertical)
                        .textFieldStyle(.plain)
                        .font(.system(size: 12))
                        .foregroundColor(Theme.textSecondary)
                        .lineLimit(1...5)
                }

                // Calendar picker + notifications
                sectionDivider
                calendarAndOptions

                // Error
                if let error = errorMessage {
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundColor(.red.opacity(0.8))
                }

                // Actions
                HStack(spacing: 8) {
                    Spacer()

                    Button {
                        dismiss()
                    } label: {
                        Text("Cancel")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Theme.textSecondary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.plain)

                    Button {
                        Task { await createEvent() }
                    } label: {
                        HStack(spacing: 5) {
                            if isCreating {
                                ProgressView()
                                    .controlSize(.mini)
                            }
                            Text("Create")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(title.isEmpty || isCreating ? Theme.textQuaternary : Theme.olive)
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                    .disabled(title.isEmpty || isCreating)
                }
            }
            .padding(16)
        }
        .frame(width: 360)
        .frame(maxHeight: 520)
        .background(Theme.cardBackground)
        .onAppear {
            if let s = initialStart { startDate = s }
            if let e = initialEnd { endDate = e }
            if let primary = calendarService.calendars.first(where: \.isPrimary) {
                selectedCalendarId = primary.id
            } else if let first = calendarService.calendars.first {
                selectedCalendarId = first.id
            }
            isTitleFocused = true
        }
        .onChange(of: startDate) { _, newStart in
            if endDate <= newStart {
                endDate = Calendar.current.date(byAdding: .hour, value: 1, to: newStart)!
            }
        }
    }

    // MARK: - Guests Section

    private var guestsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Guests")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Theme.textTertiary)
                .textCase(.uppercase)

            if !attendeeEmails.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(attendeeEmails, id: \.self) { email in
                        HStack(spacing: 8) {
                            Circle()
                                .fill(Theme.sidebarSelection)
                                .frame(width: 24, height: 24)
                                .overlay(
                                    Text(String(email.prefix(1)).uppercased())
                                        .font(.system(size: 10, weight: .medium))
                                        .foregroundColor(Theme.textSecondary)
                                )

                            Text(email)
                                .font(.system(size: 12))
                                .foregroundColor(Theme.textPrimary)
                                .lineLimit(1)

                            Spacer()

                            Button {
                                withAnimation(.easeInOut(duration: 0.15)) {
                                    attendeeEmails.removeAll { $0 == email }
                                }
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 9, weight: .medium))
                                    .foregroundColor(Theme.textTertiary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            HStack(spacing: 6) {
                Image(systemName: "plus")
                    .font(.system(size: 10))
                    .foregroundColor(Theme.textTertiary)
                TextField("Add guest email", text: $attendeeInput)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
                    .foregroundColor(Theme.textPrimary)
                    .onSubmit { addAttendee() }
            }
        }
    }

    // MARK: - Calendar & Options

    private var calendarAndOptions: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "tray")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.olive)

                Menu {
                    ForEach(calendarService.accounts, id: \.id) { account in
                        let accountCalendars = calendarService.calendars.filter { $0.accountId == account.id }
                        Section(account.email) {
                            ForEach(accountCalendars, id: \.id) { cal in
                                Button {
                                    selectedCalendarId = cal.id
                                } label: {
                                    HStack {
                                        Circle()
                                            .fill(cal.color)
                                            .frame(width: 8, height: 8)
                                        Text(cal.summary)
                                        if cal.id == selectedCalendarId {
                                            Image(systemName: "checkmark")
                                        }
                                    }
                                }
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        if let cal = calendarService.calendars.first(where: { $0.id == selectedCalendarId }) {
                            Circle().fill(cal.color).frame(width: 8, height: 8)
                            Text(cal.summary)
                                .font(.system(size: 12))
                                .foregroundColor(Theme.textPrimary)
                        } else {
                            Text("Select calendar")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.textTertiary)
                        }
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.system(size: 8))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
            }

            HStack(spacing: 6) {
                Image(systemName: "bell")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.olive)
                Toggle("Notify guests", isOn: $sendNotifications)
                    .toggleStyle(.switch)
                    .controlSize(.small)
                    .font(.system(size: 12))
                    .foregroundColor(Theme.textSecondary)
            }
        }
    }

    // MARK: - Helpers

    private var calendarColorDot: some View {
        Group {
            if let cal = calendarService.calendars.first(where: { $0.id == selectedCalendarId }) {
                Circle().fill(cal.color).frame(width: 10, height: 10)
            } else {
                Circle().fill(Theme.olive).frame(width: 10, height: 10)
            }
        }
    }

    private var sectionDivider: some View {
        Rectangle()
            .fill(Theme.divider)
            .frame(height: 1)
    }

    private func addAttendee() {
        let email = attendeeInput.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !email.isEmpty, email.contains("@"), !attendeeEmails.contains(email) else { return }
        withAnimation(.easeInOut(duration: 0.15)) {
            attendeeEmails.append(email)
        }
        attendeeInput = ""
    }

    private func createEvent() async {
        isCreating = true
        errorMessage = nil

        let request = GoogleCalendarService.NewEventRequest(
            title: title,
            startDate: startDate,
            endDate: endDate,
            isAllDay: isAllDay,
            location: location,
            description: eventDescription,
            attendeeEmails: attendeeEmails,
            addGoogleMeet: addGoogleMeet,
            calendarId: selectedCalendarId,
            sendUpdates: sendNotifications ? "all" : "none"
        )

        let result = await calendarService.createEvent(request)

        await MainActor.run {
            isCreating = false
            if result != nil {
                onCreated?()
                dismiss()
            } else {
                errorMessage = "Failed to create event. Please try again."
            }
        }
    }
}
