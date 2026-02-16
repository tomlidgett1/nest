import SwiftUI

/// Popover for toggling visibility of individual calendars, grouped by account.
struct CalendarSelectorPopover: View {

    @Environment(AppState.self) private var appState
    private var calendar: GoogleCalendarService { appState.googleCalendarService }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            Text("Calendars")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
                .padding(.horizontal, 14)
                .padding(.top, 12)
                .padding(.bottom, 8)

            Rectangle().fill(Theme.divider).frame(height: 1)

            // Calendar list grouped by account
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(calendar.accounts, id: \.id) { account in
                        accountSection(account)
                    }
                }
                .padding(.vertical, 6)
            }
            .frame(maxHeight: 300)

            // Bulk actions
            Rectangle().fill(Theme.divider).frame(height: 1)

            HStack(spacing: 12) {
                Button("Show All") {
                    calendar.showAllCalendars()
                }
                .buttonStyle(.plain)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Theme.olive)

                Button("Hide All") {
                    calendar.hideAllCalendars()
                }
                .buttonStyle(.plain)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Theme.textTertiary)

                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
        }
        .frame(width: 260)
        .background(Theme.cardBackground)
    }

    // MARK: - Account Section

    private func accountSection(_ account: GoogleCalendarAccount) -> some View {
        let accountCalendars = calendar.calendars.filter { $0.accountId == account.id }

        return VStack(alignment: .leading, spacing: 0) {
            // Account email header
            Text(account.email)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(Theme.textTertiary)
                .textCase(.uppercase)
                .tracking(0.3)
                .padding(.horizontal, 14)
                .padding(.top, 10)
                .padding(.bottom, 4)

            // Calendar rows
            ForEach(accountCalendars, id: \.id) { cal in
                calendarRow(cal)
            }
        }
    }

    private func calendarRow(_ cal: GoogleCalendar) -> some View {
        Button {
            calendar.toggleCalendarVisibility(calendarId: cal.id)
        } label: {
            HStack(spacing: 8) {
                // Checkbox
                Image(systemName: cal.isVisible ? "checkmark.square.fill" : "square")
                    .font(.system(size: 14))
                    .foregroundColor(cal.isVisible ? Theme.olive : Theme.textTertiary)

                // Color dot
                Circle()
                    .fill(cal.color)
                    .frame(width: 8, height: 8)

                // Calendar name
                Text(cal.summary)
                    .font(.system(size: 12))
                    .foregroundColor(Theme.textPrimary)
                    .lineLimit(1)

                Spacer()

                if cal.isPrimary {
                    Text("Primary")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(Theme.textQuaternary)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
