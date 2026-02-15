import SwiftUI

/// Menu bar dropdown — warm cream aesthetic.
struct MenuBarView: View {
    
    @Environment(AppState.self) private var appState
    @Environment(\.openWindow) private var openWindow
    
    private func activateAppIfNeeded(delay: TimeInterval = 0.15) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            guard !NSApp.isActive else { return }
            NSRunningApplication.current.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
        }
    }
    
    var body: some View {
        VStack(spacing: 0) {
            if appState.isMeetingActive {
                ActiveMeetingCard()
            } else {
                IdleMenuContent()
            }
        }
        .frame(width: 280)
        .background(Theme.background)
        // Always-alive observer: when the HUD or anything sets shouldOpenNotesWindow,
        // open the window from here (MenuBarExtra is never deallocated).
        .onChange(of: appState.shouldOpenNotesWindow) { _, shouldOpen in
            if shouldOpen {
                appState.shouldOpenNotesWindow = false
                openWindow(id: "notes-window")
                activateAppIfNeeded()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    // Make sure the notes window is key after it's been created
                    if let window = NSApp.windows.first(where: { $0.identifier?.rawValue == "notes-window" || $0.title == "All Notes" }) {
                        window.makeKeyAndOrderFront(nil)
                    }
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .openNotesWindow)) { _ in
            openWindow(id: "notes-window")
            activateAppIfNeeded()
        }
        .onReceive(NotificationCenter.default.publisher(for: .openOnboardingWindow)) { _ in
            openWindow(id: "onboarding-window")
            activateAppIfNeeded()
        }
    }
}

// MARK: - Active Meeting Card

private struct ActiveMeetingCard: View {
    
    @Environment(AppState.self) private var appState
    @Environment(\.openWindow) private var openWindow
    @State private var elapsed: TimeInterval = 0
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 5) {
                Circle()
                    .fill(Theme.recording)
                    .frame(width: 6, height: 6)
                Text("Recording")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Theme.textSecondary)
                Spacer()
                Text(formattedElapsed)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(Theme.textTertiary)
            }
            
            if let meeting = appState.currentMeeting {
                Text(meeting.note.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Theme.textPrimary)
                    .lineLimit(2)
            }
            
            HStack(spacing: 8) {
                // Open main app button
                Button {
                    openWindow(id: "notes-window")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        NSApp.activate(ignoringOtherApps: true)
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "macwindow")
                            .font(.system(size: 10))
                        Text("Open Tap")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Theme.textPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(Theme.sidebarSelection)
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                
                // End meeting button
                Button {
                    appState.stopMeeting()
                } label: {
                    Text("End Meeting")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Theme.recording)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(Theme.recording.opacity(0.08))
                        .cornerRadius(6)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .onReceive(timer) { _ in
            if let start = appState.currentMeeting?.startedAt {
                elapsed = Date.now.timeIntervalSince(start)
            }
        }
    }
    
    private var formattedElapsed: String {
        let m = Int(elapsed) / 60; let s = Int(elapsed) % 60
        return String(format: "%d:%02d", m, s)
    }
}

// MARK: - Idle Menu Content

private struct IdleMenuContent: View {
    
    @Environment(AppState.self) private var appState
    @Environment(\.openWindow) private var openWindow
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if appState.googleCalendarService.isConnected {
                // Connected — show upcoming events
                let upcoming = appState.calendarService.upcomingEvents.prefix(5)
                if !upcoming.isEmpty {
                    SectionLabel("Coming up")
                    ForEach(Array(upcoming)) { event in
                        EventRow(event: event)
                    }
                    MenuDivider()
                }
            } else {
                // Not connected — show connect prompt
                GoogleCalendarConnectCard()
                MenuDivider()
            }
            
            SectionLabel("Recent")
            let notes = appState.noteRepository.fetchAllNotes().prefix(5)
            if notes.isEmpty {
                Text("No notes yet")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.textQuaternary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
            } else {
                ForEach(Array(notes), id: \.id) { note in
                    NoteMenuRow(note: note)
                }
            }
            
            MenuDivider()
            
            MenuAction(label: "New Note", shortcut: "N") { appState.startMeeting() }
            MenuAction(label: "All Notes", shortcut: "1") { openWindow(id: "notes-window") }
            MenuAction(label: "Preferences…", shortcut: ",") { openWindow(id: "preferences-window") }
            
            MenuDivider()
            
            MenuAction(label: "Quit Tap", shortcut: "Q") { NSApplication.shared.terminate(nil) }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Google Calendar Connect Card

private struct GoogleCalendarConnectCard: View {
    
    @Environment(AppState.self) private var appState
    @State private var clientID: String = ""
    @State private var clientSecret: String = ""
    @State private var showSetup = false
    
    private var googleCal: GoogleCalendarService {
        appState.googleCalendarService
    }
    
    private var needsCredentials: Bool {
        !googleCal.hasCredentials
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack(spacing: 8) {
                Image(systemName: "calendar")
                    .font(.system(size: 14))
                    .foregroundColor(Theme.olive)
                
                VStack(alignment: .leading, spacing: 1) {
                    Text("Google Calendar")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Theme.textPrimary)
                    Text("See your upcoming meetings here")
                        .font(.system(size: 10))
                        .foregroundColor(Theme.textTertiary)
                }
                
                Spacer()
            }
            
            if needsCredentials || showSetup {
                // Credentials setup
                VStack(alignment: .leading, spacing: 6) {
                    Text("Client ID")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Theme.textSecondary)
                    
                    TextField("xxxxx.apps.googleusercontent.com", text: $clientID)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 10, design: .monospaced))
                    
                    Text("Client Secret")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Theme.textSecondary)
                        .padding(.top, 2)
                    
                    SecureField("GOCSPX-xxxxx", text: $clientSecret)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 10, design: .monospaced))
                    
                    Button {
                        NSWorkspace.shared.open(URL(string: "https://console.cloud.google.com/apis/credentials")!)
                    } label: {
                        HStack(spacing: 3) {
                            Image(systemName: "questionmark.circle")
                                .font(.system(size: 9))
                            Text("Get credentials from Google Cloud Console")
                                .font(.system(size: 9))
                        }
                        .foregroundColor(Theme.olive)
                    }
                    .buttonStyle(.plain)
                    
                    let idTrimmed = clientID.trimmingCharacters(in: .whitespaces)
                    let secretTrimmed = clientSecret.trimmingCharacters(in: .whitespaces)
                    
                    if !idTrimmed.isEmpty && !secretTrimmed.isEmpty {
                        Button {
                            googleCal.setClientID(idTrimmed)
                            googleCal.setClientSecret(secretTrimmed)
                            showSetup = false
                            // Auto-trigger sign in after saving
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                                googleCal.signIn()
                            }
                        } label: {
                            Text("Save & Connect")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 5)
                                .background(Theme.olive)
                                .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                // Connect button (client ID already configured)
                Button {
                    googleCal.signIn()
                } label: {
                    HStack(spacing: 5) {
                        if googleCal.isAuthenticating {
                            ProgressView()
                                .controlSize(.small)
                            Text("Connecting…")
                        } else {
                            Image(systemName: "arrow.right.circle.fill")
                                .font(.system(size: 10))
                            Text("Connect")
                        }
                    }
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 5)
                    .background(Theme.olive)
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                .disabled(googleCal.isAuthenticating)
                
                // Link to reconfigure
                Button {
                    showSetup = true
                } label: {
                    Text("Change Client ID")
                        .font(.system(size: 9))
                        .foregroundColor(Theme.textQuaternary)
                }
                .buttonStyle(.plain)
            }
            
            if let error = googleCal.authError {
                Text(error)
                    .font(.system(size: 10))
                    .foregroundColor(Theme.recording)
                    .lineLimit(3)
            }
        }
        .padding(12)
        .background(Color.white)
        .cornerRadius(8)
        .padding(.horizontal, 10)
        .padding(.top, 6)
        .onAppear {
            clientID = KeychainHelper.get(key: Constants.Keychain.googleClientID) ?? ""
            clientSecret = KeychainHelper.get(key: Constants.Keychain.googleClientSecret) ?? ""
        }
    }
}

// MARK: - Event Row

private struct EventRow: View {
    let event: CalendarEvent
    @Environment(AppState.self) private var appState
    
    var body: some View {
        Button {
            appState.startMeeting(title: event.title, calendarEventId: event.id, attendees: event.attendeeNames)
        } label: {
            HStack(spacing: 10) {
                // Mini date badge
                VStack(spacing: 0) {
                    Text(monthStr)
                        .font(.system(size: 7, weight: .bold))
                        .textCase(.uppercase)
                    Text(dayStr)
                        .font(.system(size: 12, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(width: 26, height: 26)
                .background(Theme.olive)
                .cornerRadius(5)
                
                VStack(alignment: .leading, spacing: 1) {
                    Text(event.title)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textPrimary)
                        .lineLimit(1)
                    Text(event.formattedTime)
                        .font(.system(size: 10))
                        .foregroundColor(Theme.textTertiary)
                }
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
    
    private var monthStr: String {
        let f = DateFormatter(); f.dateFormat = "MMM"; return f.string(from: event.startDate)
    }
    private var dayStr: String {
        let f = DateFormatter(); f.dateFormat = "d"; return f.string(from: event.startDate)
    }
}

private struct NoteMenuRow: View {
    let note: Note
    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 1) {
                Text(note.title)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.textPrimary)
                    .lineLimit(1)
                Text(note.createdAt.relativeDescription)
                    .font(.system(size: 10))
                    .foregroundColor(Theme.textQuaternary)
            }
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
    }
}

private struct SectionLabel: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .medium))
            .foregroundColor(Theme.textQuaternary)
            .textCase(.uppercase)
            .tracking(0.5)
            .padding(.horizontal, 14)
            .padding(.top, 8)
            .padding(.bottom, 4)
    }
}

private struct MenuDivider: View {
    var body: some View {
        Rectangle()
            .fill(Theme.divider)
            .frame(height: 1)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
    }
}

private struct MenuAction: View {
    let label: String; let shortcut: String; let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack {
                Text(label).font(.system(size: 13)).foregroundColor(Theme.textPrimary)
                Spacer()
                Text("⌘\(shortcut)").font(.system(size: 10)).foregroundColor(Theme.textQuaternary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
