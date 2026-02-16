import SwiftUI
import Combine

/// The main app window — Granola-style layout.
///
/// Left: warm sidebar with navigation + folders (collapsible)
/// Right: top nav bar + "Coming up" calendar section + date-grouped notes list
struct NotesListView: View {
    
    @Environment(AppState.self) private var appState
    @State private var searchText = ""
    @State private var sidebarTab: SidebarTab = .home
    @State private var isSidebarCollapsed = false
    @State private var tabBeforeNote: SidebarTab = .home

    // Calendar toolbar state (lifted so it can live in the window toolbar)
    @State private var calendarViewMode: CalendarViewMode = .week
    @State private var calendarCurrentDate: Date = .now
    @State private var showCalendarSelector = false
    
    /// Forces a layout recalculation after window is ready. SwiftUI's unified toolbar
    /// reports stale safe-area insets on first layout; a hierarchy change fixes it.
    @State private var hasTriggeredLayoutFix = false
    
    enum SidebarTab: Hashable {
        case home
        case meetings
        case calendar
        case todos
        case email
        case appleNotes
        case settings
        case folder(UUID?)
        case note(UUID)
        case tag(UUID)
        case appleNote(String)
    }
    
    var body: some View {
        ZStack {
            WindowConfigurator().frame(width: 0, height: 0)
            HStack(spacing: 0) {
                // Sidebar — collapsible
                if !isSidebarCollapsed {
                    NoteSidebar(
                        selectedTab: $sidebarTab,
                        searchText: $searchText,
                        isSidebarCollapsed: $isSidebarCollapsed,
                        tabBeforeNote: $tabBeforeNote,
                        onNewNote: startNewMeeting,
                        onNewStandaloneNote: startNewStandaloneNote
                    )
                    .frame(width: Theme.Spacing.sidebarWidth)
                    .overlay(alignment: .trailing) {
                        Rectangle()
                            .fill(Theme.divider)
                            .frame(width: 1)
                            .ignoresSafeArea(.all, edges: .top)
                    }
                    .transition(.move(edge: .leading))
                }

                // Main content — only this gets toolbar safe-area compensation
                mainContent
                    .modifier(ToolbarSafeAreaCompensation())
            }
            .animation(.easeInOut(duration: 0.25), value: isSidebarCollapsed)

            if sidebarTab == .home {
                VStack {
                    Spacer()
                    FloatingSemanticSearchBar()
                        .padding(.horizontal, Theme.Spacing.contentPadding)
                        .padding(.bottom, 16)
                }
                .transition(.opacity)
            }
        }
        .frame(minWidth: 780, minHeight: 540)
        .background(Theme.background)
        .toolbar {
            ToolbarItem(placement: .navigation) {
                HStack(spacing: 10) {
                    Button {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            isSidebarCollapsed.toggle()
                        }
                    } label: {
                        Image(systemName: "sidebar.left")
                            .font(.system(size: 13))
                            .foregroundColor(Theme.textSecondary)
                    }
                    .buttonStyle(.plain)
                    .help("Toggle Sidebar")
                    
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            sidebarTab = .home
                        }
                    } label: {
                        Image(systemName: "house")
                            .font(.system(size: 13))
                            .foregroundColor(Theme.textSecondary)
                    }
                    .buttonStyle(.plain)
                    .help("Go to Home")
                    .padding(.leading, isSidebarCollapsed ? 0 : 104)
                    
                    // Account filter — only shown on Email tab with multiple accounts
                    if sidebarTab == .email, appState.gmailService.accounts.count > 1 {
                        emailAccountFilterMenu
                    }
                    
                    // Calendar navigation — only shown on Calendar tab
                    if sidebarTab == .calendar, appState.googleCalendarService.isConnected {
                        HStack(spacing: 4) {
                            Button { calendarNavigatePrevious() } label: {
                                Image(systemName: "chevron.left")
                                    .font(.system(size: 12, weight: .medium))
                                    .frame(width: 28, height: 28)
                            }
                            .buttonStyle(.plain)
                            .help("Previous \(calendarViewMode.displayName)")

                            Button { calendarCurrentDate = .now } label: {
                                Text("Today")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(Theme.textPrimary)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(Theme.sidebarBackground)
                                    .cornerRadius(6)
                            }
                            .buttonStyle(.plain)
                            .help("Go to today")

                            Button { calendarNavigateNext() } label: {
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12, weight: .medium))
                                    .frame(width: 28, height: 28)
                            }
                            .buttonStyle(.plain)
                            .help("Next \(calendarViewMode.displayName)")
                        }
                        .padding(.leading, 4)

                        Text(calendarDateRangeLabel)
                            .font(Theme.headingFont(16))
                            .foregroundColor(Theme.textPrimary)
                            .padding(.leading, 4)
                    }
                }
            }
            ToolbarItem(placement: .primaryAction) {
                HStack(spacing: 12) {
                    if appState.isMeetingActive, !isViewingLiveNote {
                        MeetingControlButtons()
                    }
                    
                    // Email toolbar — mailbox tabs + compose + refresh
                    if sidebarTab == .email, appState.gmailService.isConnected {
                        emailToolbarTabs
                        
                        Button {
                            Task { await appState.gmailService.fetchMailbox(appState.gmailService.currentMailbox) }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Theme.textSecondary)
                                .frame(width: 28, height: 28)
                                .rotationEffect(.degrees(appState.gmailService.isFetching ? 360 : 0))
                                .animation(appState.gmailService.isFetching ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: appState.gmailService.isFetching)
                        }
                        .buttonStyle(.plain)
                        .disabled(appState.gmailService.isFetching)
                        .help("Refresh")
                        
                        Button {
                            NotificationCenter.default.post(name: .emailComposeToggle, object: nil)
                        } label: {
                            HStack(spacing: 5) {
                                Image(systemName: "square.and.pencil")
                                    .font(.system(size: 11, weight: .medium))
                                Text("Compose")
                                    .font(.system(size: 12, weight: .medium))
                            }
                            .foregroundColor(Theme.textPrimary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Theme.cardBackground)
                            .cornerRadius(6)
                            .shadow(color: .black.opacity(0.06), radius: 1, y: 1)
                        }
                        .buttonStyle(.plain)
                    }
                    
                    // Calendar view mode + selector — shown on Calendar tab
                    if sidebarTab == .calendar, appState.googleCalendarService.isConnected {
                        HStack(spacing: 2) {
                            ForEach(CalendarViewMode.allCases, id: \.self) { mode in
                                Button {
                                    withAnimation(.easeInOut(duration: 0.2)) {
                                        calendarViewMode = mode
                                    }
                                } label: {
                                    Text(mode.displayName)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(calendarViewMode == mode ? Theme.textPrimary : Theme.textSecondary)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 5)
                                        .background(calendarViewMode == mode ? Theme.sidebarBackground : Color.clear)
                                        .cornerRadius(6)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(2)
                        .background(Color(red: 0.96, green: 0.95, blue: 0.93))
                        .cornerRadius(6)

                        Button {
                            showCalendarSelector.toggle()
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "line.3.horizontal.decrease.circle")
                                    .font(.system(size: 12))
                                Text("Calendars")
                                    .font(.system(size: 12, weight: .medium))
                            }
                            .foregroundColor(Theme.textSecondary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Theme.sidebarBackground)
                            .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                        .popover(isPresented: $showCalendarSelector, arrowEdge: .bottom) {
                            CalendarSelectorPopover()
                                .environment(appState)
                        }
                    }
                    
                    HStack(spacing: 4) {
                        Image(systemName: "bird.fill")
                            .font(.system(size: 11))
                            .symbolRenderingMode(.hierarchical)
                        Text("Nest")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Theme.textTertiary)
                }
                .padding(.trailing, 12)
            }
        }
        .toolbarBackground(.hidden, for: .windowToolbar)
        // Email compose is now handled inside EmailView
        .onReceive(NotificationCenter.default.publisher(for: .quickNote)) { _ in
            startNewMeeting()
        }
        .onChange(of: appState.isMeetingActive) { _, isActive in
            // Auto-navigate to the active meeting note and collapse sidebar when one starts
            if isActive, let note = appState.currentMeeting?.note {
                withAnimation(.easeInOut(duration: 0.25)) {
                    sidebarTab = .note(note.id)
                    isSidebarCollapsed = true
                }
            }
        }
        .onChange(of: appState.shouldNavigateToLiveMeeting) { _, shouldNavigate in
            if shouldNavigate, let note = appState.currentMeeting?.note {
                appState.shouldNavigateToLiveMeeting = false
                withAnimation(.easeInOut(duration: 0.2)) {
                    sidebarTab = .note(note.id)
                }
            } else {
                appState.shouldNavigateToLiveMeeting = false
            }
        }
        .onChange(of: sidebarTab) { _, newTab in
            // Mark all to-dos as seen when the user navigates to the To-Dos page
            if case .todos = newTab {
                appState.todoRepository.markAllAsSeen()
            }
        }
        .onAppear {
            guard !hasTriggeredLayoutFix else { return }
            hasTriggeredLayoutFix = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) {
                isSidebarCollapsed = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                isSidebarCollapsed = false
            }
        }
        .keyboardShortcut("n", modifiers: .command)
        .onReceive(NotificationCenter.default.publisher(for: .newStandaloneNote)) { _ in
            startNewStandaloneNote()
        }
    }
    
    private func startNewMeeting() {
        appState.startMeeting()
        // Navigate to the new note immediately
        if let note = appState.currentMeeting?.note {
            sidebarTab = .note(note.id)
        }
    }
    
    private func startNewStandaloneNote() {
        let note = appState.createStandaloneNote()
        tabBeforeNote = sidebarTab
        sidebarTab = .note(note.id)
    }
    
    // MARK: - Email Account Filter (Toolbar)
    
    private var emailAccountFilterMenu: some View {
        let gmail = appState.gmailService
        
        return Picker(selection: Binding<String>(
            get: { gmail.filterAccountId ?? "__all__" },
            set: { newValue in
                gmail.filterAccountId = newValue == "__all__" ? nil : newValue
                gmail.selectedThread = nil
                gmail.selectedMessageId = nil
            }
        ), label: EmptyView()) {
            Text("All Accounts").tag("__all__")
            Divider()
            ForEach(gmail.accounts, id: \.id) { account in
                Text(account.email).tag(account.id)
            }
        }
        .pickerStyle(.menu)
        .fixedSize()
    }
    
    // MARK: - Email Toolbar Tabs (Mailbox switcher)
    
    private var emailToolbarTabs: some View {
        let gmail = appState.gmailService
        let inboxUnread = gmail.inboxThreads.filter(\.isUnread).count
        let isSearchActive = !gmail.searchQuery.isEmpty
        
        return HStack(spacing: 0) {
            ForEach(Mailbox.allCases) { mailbox in
                let isActive = gmail.currentMailbox == mailbox && !isSearchActive
                Button {
                    gmail.currentMailbox = mailbox
                    gmail.selectedThread = nil
                    gmail.selectedMessageId = nil
                    gmail.clearSearch()
                    NotificationCenter.default.post(name: .emailMailboxChanged, object: nil)
                    Task { await gmail.fetchMailbox(mailbox) }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: mailbox.icon)
                            .font(.system(size: 10))
                        Text(mailbox.displayName)
                            .font(.system(size: 12, weight: .medium))
                        
                        if mailbox == .inbox, inboxUnread > 0, !isSearchActive {
                            Text("\(inboxUnread)")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 4)
                                .padding(.vertical, 1)
                                .background(Theme.olive)
                                .cornerRadius(4)
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .foregroundColor(isActive ? Theme.textPrimary : Theme.textSecondary)
                    .background(isActive ? Color.white : Color.clear)
                    .cornerRadius(6)
                    .shadow(color: isActive ? .black.opacity(0.05) : .clear, radius: 1, y: 1)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(2)
        .background(Color(red: 0.94, green: 0.93, blue: 0.90))
        .cornerRadius(6)
    }
    
    // MARK: - Main Content
    
    @ViewBuilder
    private var mainContent: some View {
        switch sidebarTab {
        case .home:
            HomeContentView(
                isSidebarCollapsed: $isSidebarCollapsed,
                onSelectNote: { id in tabBeforeNote = .home; sidebarTab = .note(id) },
                onNewNote: { startNewMeeting() },
                onNewStandaloneNote: { startNewStandaloneNote() }
            )
        case .meetings:
            MeetingsContentView(
                isSidebarCollapsed: $isSidebarCollapsed,
                onSelectNote: { id in tabBeforeNote = .meetings; sidebarTab = .note(id) },
                onNewNote: { startNewMeeting() }
            )
        case .calendar:
            CalendarView(
                viewMode: $calendarViewMode,
                currentDate: $calendarCurrentDate
            )
        case .email:
            EmailView(isSidebarCollapsed: $isSidebarCollapsed)
        case .todos:
            TodoListView(
                isSidebarCollapsed: $isSidebarCollapsed,
                onNavigateToNote: { id in tabBeforeNote = .todos; sidebarTab = .note(id) },
                onNavigateToEmail: { sidebarTab = .email }
            )
        case .appleNotes:
            AppleNotesContentView(
                isSidebarCollapsed: $isSidebarCollapsed,
                onSelectNote: { id in tabBeforeNote = .appleNotes; sidebarTab = .appleNote(id) },
                onCreateNote: { id in tabBeforeNote = .appleNotes; sidebarTab = .appleNote(id) }
            )
        case .appleNote(let id):
            AppleNoteDetailView(
                noteId: id,
                isSidebarCollapsed: $isSidebarCollapsed,
                onBack: { sidebarTab = tabBeforeNote }
            )
        case .folder(let folderId):
            FolderContentView(
                folderId: folderId,
                isSidebarCollapsed: $isSidebarCollapsed,
                onSelectNote: { id in tabBeforeNote = .folder(folderId); sidebarTab = .note(id) },
                onNewNote: { startNewMeeting() }
            )
        case .note(let id):
            if let note = appState.noteRepository.fetchAllNotes().first(where: { $0.id == id }) {
                if note.noteType == .standalone {
                    StandaloneNoteDetailView(
                        note: note,
                        isSidebarCollapsed: $isSidebarCollapsed,
                        onBack: { sidebarTab = tabBeforeNote },
                        onGoHome: { sidebarTab = .home },
                        onSelectNote: { linkedId in
                            tabBeforeNote = .note(id)
                            sidebarTab = .note(linkedId)
                        }
                    )
                } else {
                    NoteDetailView(
                        note: note,
                        isSidebarCollapsed: $isSidebarCollapsed,
                        onBack: { sidebarTab = tabBeforeNote },
                        onGoHome: { sidebarTab = .home },
                        onSelectNote: { linkedId in
                            tabBeforeNote = .note(id)
                            sidebarTab = .note(linkedId)
                        }
                    )
                }
            } else {
                HomeContentView(
                    isSidebarCollapsed: $isSidebarCollapsed,
                    onSelectNote: { id in sidebarTab = .note(id) },
                    onNewNote: { startNewMeeting() },
                    onNewStandaloneNote: { startNewStandaloneNote() }
                )
            }
        case .tag(let tagId):
            TagContentView(
                tagId: tagId,
                isSidebarCollapsed: $isSidebarCollapsed,
                onSelectNote: { id in tabBeforeNote = .tag(tagId); sidebarTab = .note(id) }
            )
        case .settings:
            SettingsContentView(isSidebarCollapsed: $isSidebarCollapsed)
        }
    }
    
    /// Whether the user is currently viewing the live meeting's note.
    private var isViewingLiveNote: Bool {
        guard let meeting = appState.currentMeeting,
              case .note(let id) = sidebarTab else { return false }
        return meeting.note.id == id
    }
    
    // MARK: - Calendar Toolbar Helpers
    
    private var calendarWeekStart: Date {
        let cal = Foundation.Calendar.current
        let weekday = cal.component(.weekday, from: calendarCurrentDate)
        return cal.date(byAdding: .day, value: -(weekday - cal.firstWeekday), to: cal.startOfDay(for: calendarCurrentDate))!
    }
    
    private var calendarDateRangeLabel: String {
        let formatter = DateFormatter()
        switch calendarViewMode {
        case .week:
            formatter.dateFormat = "MMM d"
            let end = Foundation.Calendar.current.date(byAdding: .day, value: 6, to: calendarWeekStart)!
            let startStr = formatter.string(from: calendarWeekStart)
            let endStr = formatter.string(from: end)
            let yearFormatter = DateFormatter()
            yearFormatter.dateFormat = ", yyyy"
            return "\(startStr) – \(endStr)\(yearFormatter.string(from: end))"
        case .month:
            let cal = Foundation.Calendar.current
            let comps = cal.dateComponents([.year, .month], from: calendarCurrentDate)
            let monthStart = cal.date(from: comps)!
            formatter.dateFormat = "MMMM yyyy"
            return formatter.string(from: monthStart)
        }
    }
    
    private func calendarNavigatePrevious() {
        withAnimation(.easeInOut(duration: 0.2)) {
            switch calendarViewMode {
            case .week:
                calendarCurrentDate = Foundation.Calendar.current.date(byAdding: .day, value: -7, to: calendarCurrentDate)!
            case .month:
                calendarCurrentDate = Foundation.Calendar.current.date(byAdding: .month, value: -1, to: calendarCurrentDate)!
            }
        }
    }
    
    private func calendarNavigateNext() {
        withAnimation(.easeInOut(duration: 0.2)) {
            switch calendarViewMode {
            case .week:
                calendarCurrentDate = Foundation.Calendar.current.date(byAdding: .day, value: 7, to: calendarCurrentDate)!
            case .month:
                calendarCurrentDate = Foundation.Calendar.current.date(byAdding: .month, value: 1, to: calendarCurrentDate)!
            }
        }
    }
}

// MARK: - Sidebar

private struct NoteSidebar: View {
    
    @Binding var selectedTab: NotesListView.SidebarTab
    @Binding var searchText: String
    @Binding var isSidebarCollapsed: Bool
    @Binding var tabBeforeNote: NotesListView.SidebarTab
    var onNewNote: () -> Void
    var onNewStandaloneNote: () -> Void
    
    @Environment(AppState.self) private var appState
    @State private var newFolderName = ""
    @State private var showNewFolderAlert = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Search bar
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.textTertiary)
                
                TextField("Search", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.textPrimary)
            }
            .padding(.horizontal, Theme.Spacing.sidebarPadding)
            .frame(height: Theme.Spacing.sidebarItemHeight)
            .frame(maxWidth: .infinity)
            .background(Theme.sidebarSelection)
            .cornerRadius(6)
            .padding(.horizontal, 10)
            .padding(.top, 10)
            .padding(.bottom, 10)
            
            // Navigation items
            SidebarItem(
                icon: "house",
                label: "Home",
                isSelected: isHomeSelected
            ) {
                selectedTab = .home
            }
            
            SidebarItem(
                icon: "calendar.badge.clock",
                label: "Meetings",
                isSelected: isMeetingsSelected
            ) {
                selectedTab = .meetings
            }

            SidebarItem(
                icon: "calendar",
                label: "Calendar",
                isSelected: isCalendarSelected
            ) {
                selectedTab = .calendar
            }

            SidebarItem(
                icon: "envelope",
                label: "Email",
                isSelected: isEmailSelected,
                badge: appState.gmailService.isConnected ? appState.gmailService.inboxThreads.filter(\.isUnread).count : 0
            ) {
                selectedTab = .email
            }
            
            SidebarItem(
                icon: "checklist",
                label: "To-Dos",
                isSelected: isTodosSelected,
                badge: appState.todoRepository.pendingCount(),
                newBadge: appState.todoRepository.unseenCount()
            ) {
                selectedTab = .todos
            }
            
            SidebarItem(
                icon: "note.text",
                label: "Apple Notes",
                isSelected: isAppleNotesSelected,
                badge: appState.appleNotesService.notes.count
            ) {
                selectedTab = .appleNotes
            }
            
            // Folders section
            HStack {
                Text("Folders")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Theme.textQuaternary)
                    .textCase(.uppercase)
                    .tracking(0.5)
                
                Spacer()
                
                Button {
                    newFolderName = ""
                    showNewFolderAlert = true
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Theme.textQuaternary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Theme.Spacing.sidebarPadding)
            .padding(.horizontal, 10)
            .padding(.top, 16)
            .padding(.bottom, 6)
            
            ForEach(folders, id: \.id) { folder in
                SidebarFolderRow(
                    folder: folder,
                    folderName: folder.name,
                    isSelected: isFolderSelected(folder.id),
                    onSelect: { selectedTab = .folder(folder.id) },
                    onDropNoteId: { idString in
                        guard let uuid = UUID(uuidString: idString),
                              let note = appState.noteRepository.fetchAllNotes().first(where: { $0.id == uuid }) else { return }
                        appState.noteRepository.moveNote(note, to: folder)
                    },
                    onDelete: {
                        if isFolderSelected(folder.id) {
                            selectedTab = .home
                        }
                        appState.noteRepository.deleteFolder(folder)
                    },
                    onRename: { newName in
                        appState.noteRepository.renameFolder(folder, to: newName)
                    }
                )
            }
            
            // Tags section
            let allTags = appState.noteRepository.fetchAllTags()
            if !allTags.isEmpty {
                Text("Tags")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Theme.textQuaternary)
                    .textCase(.uppercase)
                    .tracking(0.5)
                    .padding(.horizontal, Theme.Spacing.sidebarPadding)
                    .padding(.horizontal, 10)
                    .padding(.top, 16)
                    .padding(.bottom, 6)
                
                ForEach(allTags, id: \.id) { tag in
                    SidebarTagItem(
                        tag: tag,
                        isSelected: isTagSelected(tag.id),
                        onSelect: { selectedTab = .tag(tag.id) },
                        onDelete: {
                            if isTagSelected(tag.id) {
                                selectedTab = .home
                            }
                            appState.noteRepository.deleteTag(tag)
                        }
                    )
                }
            }
            
            // Notes section
            Text("Notes")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(Theme.textQuaternary)
                .textCase(.uppercase)
                .tracking(0.5)
                .padding(.horizontal, Theme.Spacing.sidebarPadding)
                .padding(.horizontal, 10)
                .padding(.top, 16)
                .padding(.bottom, 6)
            
            let notes = filteredNotes
            
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(notes, id: \.id) { note in
                        SidebarNoteItem(
                            note: note,
                            isSelected: isNoteSelected(note.id),
                            isLive: appState.currentMeeting?.note.id == note.id,
                            onSelect: {
                                tabBeforeNote = selectedTab
                                selectedTab = .note(note.id)
                            },
                            onDelete: {
                                if isNoteSelected(note.id) {
                                    selectedTab = .home
                                }
                                appState.noteRepository.deleteNote(note)
                            }
                        )
                    }
                }
            }
            .scrollIndicators(.never)
            
            // Settings — pinned at bottom
            Rectangle()
                .fill(Theme.divider)
                .frame(height: 1)
                .padding(.horizontal, 10)
                .padding(.top, 4)
            
            SidebarItem(
                icon: "gearshape",
                label: "Settings",
                isSelected: isSettingsSelected
            ) {
                selectedTab = .settings
            }
            .padding(.vertical, 6)
        }
        .background(Theme.background)
        .alert("New Folder", isPresented: $showNewFolderAlert) {
            TextField("Folder name", text: $newFolderName)
            Button("Cancel", role: .cancel) {
                showNewFolderAlert = false
            }
            Button("Create") {
                let trimmed = newFolderName.trimmingCharacters(in: .whitespaces)
                if !trimmed.isEmpty {
                    _ = appState.noteRepository.createFolder(name: trimmed)
                }
                showNewFolderAlert = false
            }
        } message: {
            Text("Enter a name for the new folder.")
        }
    }
    
    private var folders: [Folder] {
        appState.noteRepository.fetchAllFolders()
    }
    
    private var isHomeSelected: Bool {
        if case .home = selectedTab { return true }
        return false
    }
    
    private var isMeetingsSelected: Bool {
        if case .meetings = selectedTab { return true }
        return false
    }

    private var isCalendarSelected: Bool {
        if case .calendar = selectedTab { return true }
        return false
    }

    private var isEmailSelected: Bool {
        if case .email = selectedTab { return true }
        return false
    }
    
    private var isTodosSelected: Bool {
        if case .todos = selectedTab { return true }
        return false
    }
    
    private var isAppleNotesSelected: Bool {
        if case .appleNotes = selectedTab { return true }
        return false
    }

    // Calendar helpers removed — they live on NotesListView where the @State vars are.
    
    private var isSettingsSelected: Bool {
        if case .settings = selectedTab { return true }
        return false
    }
    
    private func isTagSelected(_ id: UUID) -> Bool {
        if case .tag(let tagId) = selectedTab, tagId == id { return true }
        return false
    }
    
    private func isFolderSelected(_ id: UUID) -> Bool {
        if case .folder(let folderId) = selectedTab, folderId == id { return true }
        return false
    }
    
    private func isNoteSelected(_ id: UUID) -> Bool {
        if case .note(let selectedID) = selectedTab { return selectedID == id }
        return false
    }
    
    private var filteredNotes: [Note] {
        let notes: [Note]
        if searchText.isEmpty {
            notes = appState.noteRepository.fetchAllNotes()
        } else {
            notes = appState.noteRepository.searchNotes(query: searchText)
        }
        // Sort pinned notes first, then by date
        return notes.sorted { a, b in
            if a.isPinned != b.isPinned { return a.isPinned }
            return a.createdAt > b.createdAt
        }
    }
}

// MARK: - Sidebar Item

private struct SidebarItem: View {
    let icon: String
    let label: String
    let isSelected: Bool
    var badge: Int = 0
    /// Optional "new items" badge — shown as a distinct accent indicator.
    var newBadge: Int = 0
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .foregroundColor(isSelected ? Theme.textPrimary : Theme.textSecondary)
                    .frame(width: 18)
                
                Text(label)
                    .font(.system(size: 13, weight: isSelected ? .medium : .regular))
                    .foregroundColor(isSelected ? Theme.textPrimary : Theme.textSecondary)
                
                Spacer()
                
                if newBadge > 0 {
                    Text("\(newBadge) new")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(Theme.recording)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Theme.recording.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
                
                if badge > 0 {
                    Text("\(badge)")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(Theme.olive)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Theme.oliveFaint)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }
            .padding(.horizontal, Theme.Spacing.sidebarItemContentPadding)
            .frame(height: Theme.Spacing.sidebarItemHeight)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isSelected ? Theme.sidebarSelection : .clear)
            .cornerRadius(6)
            .padding(.horizontal, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Sidebar Tag Item

private struct SidebarTagItem: View {
    let tag: Tag
    let isSelected: Bool
    let onSelect: () -> Void
    let onDelete: () -> Void
    
    @State private var isHovered = false
    
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "tag")
                .font(.system(size: 13))
                .foregroundColor(isSelected ? Theme.textPrimary : Theme.textSecondary)
                .frame(width: 18)
            
            Text("\(tag.name) (\(tag.notes.count))")
                .font(.system(size: 13, weight: isSelected ? .medium : .regular))
                .foregroundColor(isSelected ? Theme.textPrimary : Theme.textSecondary)
                .lineLimit(1)
            
            Spacer()
            
            if isHovered {
                Button {
                    onDelete()
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textTertiary)
                }
                .buttonStyle(.plain)
                .onHover { hovering in
                    if hovering { NSCursor.pointingHand.push() } else { NSCursor.pop() }
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.sidebarItemContentPadding)
        .frame(height: Theme.Spacing.sidebarItemHeight)
        .background(isSelected ? Theme.sidebarSelection : (isHovered ? Theme.sidebarSelection.opacity(0.5) : .clear))
        .cornerRadius(6)
        .padding(.horizontal, 8)
        .contentShape(Rectangle())
        .onTapGesture { onSelect() }
        .onHover { isHovered = $0 }
        .contextMenu {
            Button("Delete", role: .destructive) {
                onDelete()
            }
        }
    }
}

// MARK: - Sidebar Folder Row

private struct SidebarFolderRow: View {
    let folder: Folder?
    let folderName: String
    let isSelected: Bool
    let onSelect: () -> Void
    let onDropNoteId: (String) -> Void
    let onDelete: (() -> Void)?
    let onRename: ((String) -> Void)?
    
    @State private var isDragTarget = false
    @State private var isEditing = false
    @State private var editingName = ""
    @FocusState private var isNameFocused: Bool
    
    private var canEdit: Bool { folder != nil }
    
    var body: some View {
        Button(action: {
            if !isEditing { onSelect() }
        }) {
            HStack(spacing: 8) {
                Image(systemName: "folder")
                    .font(.system(size: 13))
                    .foregroundColor(isSelected ? Theme.textPrimary : Theme.textSecondary)
                    .frame(width: 18)
                
                if isEditing {
                    TextField("Folder name", text: $editingName)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Theme.textPrimary)
                        .focused($isNameFocused)
                        .onSubmit {
                            commitRename()
                        }
                        .onExitCommand {
                            cancelRename()
                        }
                } else {
                    Text(folderName)
                        .font(.system(size: 13, weight: isSelected ? .medium : .regular))
                        .foregroundColor(isSelected ? Theme.textPrimary : Theme.textSecondary)
                        .lineLimit(1)
                }
                
                Spacer()
            }
            .padding(.horizontal, Theme.Spacing.sidebarItemContentPadding)
            .frame(height: Theme.Spacing.sidebarItemHeight)
            .background(isSelected ? Theme.sidebarSelection : (isDragTarget ? Theme.sidebarSelection.opacity(0.6) : .clear))
            .cornerRadius(6)
            .padding(.horizontal, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onTapGesture(count: 2) {
            if canEdit {
                startRename()
            }
        }
        .onChange(of: isNameFocused) { _, focused in
            if !focused && isEditing {
                commitRename()
            }
        }
        .contextMenu {
            if canEdit, let onDelete {
                Button("Delete Folder", role: .destructive) {
                    onDelete()
                }
            }
        }
        .dropDestination(for: String.self) { items, _ in
            for idString in items {
                onDropNoteId(idString)
            }
            return !items.isEmpty
        } isTargeted: { targeted in
            isDragTarget = targeted
        }
    }
    
    private func startRename() {
        editingName = folderName
        isEditing = true
        isNameFocused = true
    }
    
    private func commitRename() {
        guard isEditing else { return }
        isEditing = false
        isNameFocused = false
        let trimmed = editingName.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty && trimmed != folderName {
            onRename?(trimmed)
        }
    }
    
    private func cancelRename() {
        isEditing = false
        isNameFocused = false
        editingName = folderName
    }
}

// MARK: - Sidebar Note Item

private struct SidebarNoteItem: View {
    let note: Note
    let isSelected: Bool
    let isLive: Bool
    let onSelect: () -> Void
    let onDelete: () -> Void
    
    @Environment(AppState.self) private var appState
    @State private var isHovered = false
    
    var body: some View {
        HStack(spacing: 8) {
            if isLive {
                Circle()
                    .fill(Theme.recording)
                    .frame(width: 6, height: 6)
                    .frame(width: 18)
            } else if note.isPinned {
                Image(systemName: "star.fill")
                    .font(.system(size: 10))
                    .foregroundColor(.orange)
                    .frame(width: 18)
            } else {
                Image(systemName: note.noteType == .standalone ? "doc.text" : "calendar.badge.clock")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textTertiary)
                    .frame(width: 18)
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text(note.title)
                    .font(.system(size: 13, weight: isSelected ? .medium : .regular))
                    .foregroundColor(isSelected ? Theme.textPrimary : Theme.textSecondary)
                    .lineLimit(1)
                
                // Show up to 2 tag pills
                if !note.tags.isEmpty {
                    HStack(spacing: 3) {
                        ForEach(Array(note.tags.prefix(2)), id: \.id) { tag in
                            Text(tag.name)
                                .font(.system(size: 9))
                                .foregroundColor(Theme.tagColor(hex: tag.colorHex))
                                .padding(.horizontal, 4)
                                .padding(.vertical, 1)
                                .background(Theme.tagColor(hex: tag.colorHex).opacity(0.12))
                                .cornerRadius(3)
                        }
                        if note.tags.count > 2 {
                            Text("+\(note.tags.count - 2)")
                                .font(.system(size: 9))
                                .foregroundColor(Theme.textQuaternary)
                        }
                    }
                }
            }
            
            Spacer()
            
            if isHovered {
                Button {
                    onDelete()
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textTertiary)
                }
                .buttonStyle(.plain)
                .onHover { hovering in
                    if hovering {
                        NSCursor.pointingHand.push()
                    } else {
                        NSCursor.pop()
                    }
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.sidebarItemContentPadding)
        .frame(minHeight: Theme.Spacing.sidebarItemHeight)
        .background(isSelected ? Theme.sidebarSelection : (isHovered ? Theme.sidebarSelection.opacity(0.5) : .clear))
        .cornerRadius(6)
        .padding(.horizontal, 8)
        .contentShape(Rectangle())
        .onTapGesture { onSelect() }
        .draggable(note.id.uuidString)
        .onHover { hovering in
            isHovered = hovering
        }
        .contextMenu {
            Button(note.isPinned ? "Unpin" : "Pin") {
                appState.noteRepository.togglePin(note)
            }
            Divider()
            Button("Delete", role: .destructive) {
                onDelete()
            }
        }
    }
}

// MARK: - Home Content View

private struct HomeContentView: View {

    @Binding var isSidebarCollapsed: Bool
    let onSelectNote: (UUID) -> Void
    let onNewNote: () -> Void
    var onNewStandaloneNote: (() -> Void)? = nil
    @Environment(AppState.self) private var appState
    @State private var isNewMeetingHovered = false
    @State private var isNewNoteHovered = false

    /// 10-second auto-refresh timer for upcoming calendar events.
    private let refreshTimer = Timer.publish(every: 10, on: .main, in: .common).autoconnect()
    
    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Page title
                    Text("Home")
                        .font(Theme.titleFont(28))
                        .foregroundColor(Theme.textPrimary)
                        .padding(.top, Theme.Spacing.mainContentTopPadding)
                    
                    // New Meeting and New Note cards — side by side
                    HStack(alignment: .top, spacing: 12) {
                        Button(action: onNewNote) {
                            HStack(spacing: 14) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(Theme.olive.opacity(0.08))
                                        .frame(width: 36, height: 36)
                                    Image(systemName: "waveform.circle.fill")
                                        .font(.system(size: 18))
                                        .foregroundColor(Theme.olive)
                                }
                                
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("New Meeting")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(Theme.textPrimary)
                                    Text("Record and transcribe")
                                        .font(.system(size: 11))
                                        .foregroundColor(Theme.textTertiary)
                                }
                                
                                Spacer(minLength: 0)
                                
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(Theme.textQuaternary)
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Theme.cardBackground)
                            .cornerRadius(10)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Theme.divider.opacity(0.5), lineWidth: 1)
                            )
                            .shadow(color: .black.opacity(isNewMeetingHovered ? 0.06 : 0.02), radius: isNewMeetingHovered ? 4 : 2, y: 1)
                            .scaleEffect(isNewMeetingHovered ? 1.01 : 1.0)
                            .animation(.easeOut(duration: 0.15), value: isNewMeetingHovered)
                        }
                        .buttonStyle(.plain)
                        .onHover { isNewMeetingHovered = $0 }
                        .frame(maxWidth: .infinity)
                        
                        if let onNewStandaloneNote {
                            Button(action: onNewStandaloneNote) {
                                HStack(spacing: 14) {
                                    ZStack {
                                        RoundedRectangle(cornerRadius: 8)
                                            .fill(Theme.olive.opacity(0.08))
                                            .frame(width: 36, height: 36)
                                        Image(systemName: "square.and.pencil")
                                            .font(.system(size: 16))
                                            .foregroundColor(Theme.olive)
                                    }
                                    
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("New Note")
                                            .font(.system(size: 14, weight: .semibold))
                                            .foregroundColor(Theme.textPrimary)
                                        Text("Quick thoughts, no recording")
                                            .font(.system(size: 11))
                                            .foregroundColor(Theme.textTertiary)
                                    }
                                    
                                    Spacer(minLength: 0)
                                    
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 10, weight: .medium))
                                        .foregroundColor(Theme.textQuaternary)
                                }
                                .padding(14)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Theme.cardBackground)
                                .cornerRadius(10)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(Theme.divider.opacity(0.5), lineWidth: 1)
                                )
                                .shadow(color: .black.opacity(isNewNoteHovered ? 0.06 : 0.02), radius: isNewNoteHovered ? 4 : 2, y: 1)
                                .scaleEffect(isNewNoteHovered ? 1.01 : 1.0)
                                .animation(.easeOut(duration: 0.15), value: isNewNoteHovered)
                            }
                            .buttonStyle(.plain)
                            .onHover { isNewNoteHovered = $0 }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    
                    // Pinned section
                    let pinnedNotes = appState.noteRepository.fetchAllNotes().filter(\.isPinned)
                    if !pinnedNotes.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Pinned")
                                .font(Theme.headingFont())
                                .foregroundColor(Theme.textSecondary)
                            
                            VStack(spacing: 0) {
                                ForEach(Array(pinnedNotes.enumerated()), id: \.element.id) { index, note in
                                    Button {
                                        onSelectNote(note.id)
                                    } label: {
                                        HStack(spacing: 12) {
                                            Image(systemName: "star.fill")
                                                .font(.system(size: 12))
                                                .foregroundColor(.orange)
                                                .frame(width: 20)
                                            
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(note.title)
                                                    .font(.system(size: 14, weight: .medium))
                                                    .foregroundColor(Theme.textPrimary)
                                                    .lineLimit(1)
                                                
                                                Text(note.formattedDate)
                                                    .font(Theme.captionFont(11))
                                                    .foregroundColor(Theme.textTertiary)
                                            }
                                            
                                            Spacer()
                                            
                                            Image(systemName: note.noteType == .standalone ? "doc.text" : "calendar.badge.clock")
                                                .font(.system(size: 11))
                                                .foregroundColor(Theme.textQuaternary)
                                            
                                            Image(systemName: "chevron.right")
                                                .font(.system(size: 10, weight: .medium))
                                                .foregroundColor(Theme.textQuaternary)
                                        }
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 12)
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    
                                    if index < pinnedNotes.count - 1 {
                                        Rectangle()
                                            .fill(Theme.divider)
                                            .frame(height: 1)
                                            .padding(.leading, 48)
                                    }
                                }
                            }
                            .background(Theme.cardBackground)
                            .cornerRadius(12)
                            .shadow(color: .black.opacity(0.03), radius: 3, y: 1)
                        }
                    }
                    
                    // Coming up — Google Calendar events
                    if appState.googleCalendarService.isConnected {
                        let upcoming = Array(appState.calendarService.upcomingEvents.prefix(5))
                        
                        if !upcoming.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Coming Up")
                                    .font(Theme.headingFont())
                                    .foregroundColor(Theme.textSecondary)
                                
                                VStack(spacing: 0) {
                                    ForEach(Array(upcoming.enumerated()), id: \.element.id) { index, event in
                                        Button {
                                            appState.startMeeting(title: event.title, calendarEventId: event.id, attendees: event.attendeeNames)
                                        } label: {
                                            HStack(spacing: 12) {
                                                // Date badge
                                                VStack(spacing: 0) {
                                                    Text(monthString(event.startDate))
                                                        .font(.system(size: 8, weight: .bold))
                                                        .textCase(.uppercase)
                                                    Text(dayString(event.startDate))
                                                        .font(.system(size: 14, weight: .bold))
                                                }
                                                .foregroundColor(.white)
                                                .frame(width: 32, height: 32)
                                                .background(Theme.olive)
                                                .cornerRadius(6)
                                                
                                                VStack(alignment: .leading, spacing: 2) {
                                                    Text(event.title)
                                                        .font(.system(size: 14, weight: .medium))
                                                        .foregroundColor(Theme.textPrimary)
                                                        .lineLimit(1)
                                                    
                                                    HStack(spacing: 4) {
                                                        Text(event.formattedTime)
                                                            .font(Theme.captionFont(11))
                                                            .foregroundColor(Theme.textTertiary)
                                                        
                                                        // Show account source when multiple accounts are connected
                                                        if appState.googleCalendarService.accounts.count > 1,
                                                           !event.calendarSource.isEmpty,
                                                           event.calendarSource != "Apple Calendar" {
                                                            Text("·")
                                                                .font(Theme.captionFont(11))
                                                                .foregroundColor(Theme.textQuaternary)
                                                            Text(event.calendarSource.split(separator: "@").first.map(String.init) ?? event.calendarSource)
                                                                .font(Theme.captionFont(10))
                                                                .foregroundColor(Theme.textQuaternary)
                                                        }
                                                    }
                                                }
                                                
                                                Spacer()
                                                
                                                if event.isHappeningNow {
                                                    Text("Now")
                                                        .font(.system(size: 10, weight: .semibold))
                                                        .foregroundColor(Theme.recording)
                                                        .padding(.horizontal, 6)
                                                        .padding(.vertical, 2)
                                                        .background(Theme.recording.opacity(0.08))
                                                        .cornerRadius(4)
                                                }
                                                
                                                if let meetingURL = event.meetingURL {
                                                    Button {
                                                        NSWorkspace.shared.open(meetingURL)
                                                    } label: {
                                                        HStack(spacing: 3) {
                                                            Image(systemName: "video.fill")
                                                                .font(.system(size: 9))
                                                            Text("Join")
                                                                .font(.system(size: 10, weight: .medium))
                                                        }
                                                        .foregroundColor(Theme.olive)
                                                        .padding(.horizontal, 8)
                                                        .padding(.vertical, 3)
                                                        .background(Theme.olive.opacity(0.12))
                                                        .cornerRadius(4)
                                                    }
                                                    .buttonStyle(.plain)
                                                }
                                                
                                                CompanyLogoView(event: event, size: 20)
                                            }
                                            .padding(.horizontal, 16)
                                            .padding(.vertical, 10)
                                            .contentShape(Rectangle())
                                        }
                                        .buttonStyle(.plain)
                                        
                                        if index < upcoming.count - 1 {
                                            Rectangle()
                                                .fill(Theme.divider)
                                                .frame(height: 1)
                                                .padding(.leading, 60)
                                        }
                                    }
                                }
                                .background(Theme.cardBackground)
                                .cornerRadius(12)
                                .shadow(color: .black.opacity(0.03), radius: 3, y: 1)
                            }
                        }
                    }
                    
                    // Recent notes
                    let recentNotes = Array(appState.noteRepository.fetchAllNotes().prefix(5))
                    
                    if !recentNotes.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Recent")
                                .font(Theme.headingFont())
                                .foregroundColor(Theme.textSecondary)
                            
                            VStack(spacing: 0) {
                                ForEach(Array(recentNotes.enumerated()), id: \.element.id) { index, note in
                                    Button {
                                        onSelectNote(note.id)
                                    } label: {
                                        HStack(spacing: 12) {
                                            Image(systemName: note.noteType == .standalone ? "doc.text" : "calendar.badge.clock")
                                                .font(.system(size: 14))
                                                .foregroundColor(Theme.textQuaternary)
                                                .frame(width: 20)
                                            
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(note.title)
                                                    .font(.system(size: 14, weight: .medium))
                                                    .foregroundColor(Theme.textPrimary)
                                                    .lineLimit(1)
                                                
                                                Text(note.formattedDate)
                                                    .font(Theme.captionFont(11))
                                                    .foregroundColor(Theme.textTertiary)
                                            }
                                            
                                            Spacer()
                                            
                                            if note.status == .enhanced {
                                                Text("Enhanced")
                                                    .font(.system(size: 10, weight: .medium))
                                                    .foregroundColor(Theme.olive)
                                                    .padding(.horizontal, 6)
                                                    .padding(.vertical, 2)
                                                    .background(Theme.oliveFaint)
                                                    .cornerRadius(4)
                                            }
                                            
                                            Image(systemName: "chevron.right")
                                                .font(.system(size: 10, weight: .medium))
                                                .foregroundColor(Theme.textQuaternary)
                                        }
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 12)
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    
                                    if index < recentNotes.count - 1 {
                                        Rectangle()
                                            .fill(Theme.divider)
                                            .frame(height: 1)
                                            .padding(.leading, 48)
                                    }
                                }
                            }
                            .background(Theme.cardBackground)
                            .cornerRadius(12)
                            .shadow(color: .black.opacity(0.03), radius: 3, y: 1)
                        }
                    } else {
                        // Empty state
                        VStack(spacing: 8) {
                            Text("No meetings yet")
                                .font(Theme.headingFont())
                                .foregroundColor(Theme.textTertiary)
                            Text("Tap New Meeting to get started.")
                                .font(Theme.captionFont())
                                .foregroundColor(Theme.textQuaternary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                    }
                    
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, Theme.Spacing.contentPadding)
                .padding(.top, 4)
            }
        }
        .background(Theme.background)
        .onAppear {
            // Refresh calendar events when Home appears
            if appState.googleCalendarService.isConnected {
                Task {
                    await appState.googleCalendarService.fetchEvents()
                }
            } else {
                appState.calendarService.fetchUpcomingEvents()
            }
        }
        .onReceive(refreshTimer) { _ in
            if appState.googleCalendarService.isConnected {
                Task {
                    await appState.googleCalendarService.fetchEvents()
                }
            } else {
                appState.calendarService.fetchUpcomingEvents()
            }
        }
    }
    
    private func monthString(_ date: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "MMM"; return f.string(from: date)
    }
    
    private func dayString(_ date: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "d"; return f.string(from: date)
    }
}

// MARK: - Meeting Control Buttons

/// Compact stop and pause buttons shown in the top-right when a meeting is active.
struct MeetingControlButtons: View {
    @Environment(AppState.self) private var appState
    @State private var elapsed: TimeInterval = 0
    @State private var dotOpacity: Double = 1.0
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    
    var body: some View {
        HStack(spacing: 8) {
            // Pulsing recording dot + elapsed time
            if !appState.isMeetingPaused {
                Circle()
                    .fill(Theme.recording)
                    .frame(width: 6, height: 6)
                    .opacity(dotOpacity)
                    .onAppear {
                        withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                            dotOpacity = 0.3
                        }
                    }
            }
            
            Text(formattedElapsed)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundColor(appState.isMeetingPaused ? Theme.textTertiary : Theme.textSecondary)
            
            // Pause / Resume
            Button {
                appState.toggleMeetingPause()
            } label: {
                Image(systemName: appState.isMeetingPaused ? "play.fill" : "pause.fill")
                    .font(.system(size: 9))
                    .foregroundColor(Theme.textSecondary)
                    .frame(width: 24, height: 24)
                    .background(Theme.cardBackground)
                    .cornerRadius(6)
                    .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
            }
            .buttonStyle(.plain)
            .help(appState.isMeetingPaused ? "Resume recording" : "Pause recording")
            
            // Stop
            Button {
                appState.stopMeeting()
            } label: {
                Image(systemName: "stop.fill")
                    .font(.system(size: 8))
                    .foregroundColor(.white)
                    .frame(width: 24, height: 24)
                    .background(Theme.recording)
                    .cornerRadius(6)
            }
            .buttonStyle(.plain)
            .help("End meeting")
        }
        .onReceive(timer) { _ in
            if let start = appState.currentMeeting?.startedAt, !appState.isMeetingPaused {
                elapsed = Date.now.timeIntervalSince(start)
            }
        }
    }
    
    private var formattedElapsed: String {
        let m = Int(elapsed) / 60
        let s = Int(elapsed) % 60
        return String(format: "%d:%02d", m, s)
    }
}

// MARK: - Date Group Model

private struct DateGroup {
    let date: String
    let notes: [Note]
}

// MARK: - Date Group Section

private struct DateGroupSection: View {
    let group: DateGroup
    let folders: [Folder]
    let onSelectNote: (UUID) -> Void
    let onDeleteNote: (Note) -> Void
    let onMoveNote: (Note, Folder?) -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(group.date)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Theme.textTertiary)
                .padding(.top, 20)
                .padding(.bottom, 8)
            
            VStack(spacing: 0) {
                ForEach(Array(group.notes.enumerated()), id: \.element.id) { index, note in
                    if index > 0 {
                        Rectangle()
                            .fill(Theme.divider)
                            .frame(height: 1)
                            .padding(.leading, 36)
                    }
                    
                    NoteRow(
                        note: note,
                        folders: folders,
                        onSelect: { onSelectNote(note.id) },
                        onDelete: { onDeleteNote(note) },
                        onMoveToFolder: { folder in onMoveNote(note, folder) }
                    )
                }
            }
        }
    }
}

// MARK: - Note Row

private struct NoteRow: View {
    let note: Note
    let folders: [Folder]
    let onSelect: () -> Void
    let onDelete: () -> Void
    let onMoveToFolder: (Folder?) -> Void
    
    @State private var isHovered = false
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "doc.text")
                .font(.system(size: 14))
                .foregroundColor(Theme.textQuaternary)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(note.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                    .lineLimit(1)
                
                if !note.rawNotes.isEmpty {
                    Text(note.rawNotes)
                        .font(Theme.captionFont())
                        .foregroundColor(Theme.textTertiary)
                        .lineLimit(1)
                }
            }
            
            Spacer()
            
            // Folder tag — shows current folder, click to change
            if !folders.isEmpty {
                Menu {
                    Button {
                        onMoveToFolder(nil)
                    } label: {
                        HStack {
                            Text("None")
                            if note.folder == nil {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                    
                    Divider()
                    
                    ForEach(folders, id: \.id) { folder in
                        Button {
                            onMoveToFolder(folder)
                        } label: {
                            HStack {
                                Text(folder.name)
                                if note.folder?.id == folder.id {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "folder")
                            .font(.system(size: 10))
                        Text(note.folder?.name ?? "Add to folder")
                            .font(.system(size: 11))
                            .lineLimit(1)
                    }
                    .foregroundColor(note.folder != nil ? Theme.textSecondary : Theme.textQuaternary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(isHovered ? Theme.divider.opacity(0.5) : .clear)
                    .cornerRadius(4)
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .opacity(note.folder != nil || isHovered ? 1 : 0)
            }
            
            if note.status == .enhanced {
                Text("Enhanced")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Theme.olive)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Theme.oliveFaint)
                    .cornerRadius(4)
            }
            
            Text(note.createdAt.timeOnly)
                .font(Theme.captionFont())
                .foregroundColor(Theme.textQuaternary)
            
            if isHovered {
                Button {
                    onDelete()
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.textTertiary)
                }
                .buttonStyle(.plain)
                .onHover { hovering in
                    if hovering {
                        NSCursor.pointingHand.push()
                    } else {
                        NSCursor.pop()
                    }
                }
            }
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .onTapGesture { onSelect() }
        .draggable(note.id.uuidString)
        .onHover { isHovered = $0 }
        .contextMenu {
            if !folders.isEmpty {
                Menu("Move to Folder") {
                    Button("None") {
                        onMoveToFolder(nil)
                    }
                    
                    Divider()
                    
                    ForEach(folders, id: \.id) { folder in
                        Button(folder.name) {
                            onMoveToFolder(folder)
                        }
                    }
                }
                
                Divider()
            }
            
            Button("Delete", role: .destructive) {
                onDelete()
            }
        }
    }
}

// MARK: - Folder Content View

/// Full-page list of notes in a folder (or uncategorised when folderId is nil).
private struct FolderContentView: View {
    let folderId: UUID?
    @Binding var isSidebarCollapsed: Bool
    let onSelectNote: (UUID) -> Void
    let onNewNote: () -> Void
    
    @Environment(AppState.self) private var appState
    @State private var isRenaming = false
    @State private var renameText = ""
    @State private var isTitleHovered = false
    @FocusState private var isRenameFocused: Bool
    
    private var folder: Folder? {
        guard let folderId else { return nil }
        return appState.noteRepository.fetchAllFolders().first { $0.id == folderId }
    }
    
    private var allFolders: [Folder] {
        appState.noteRepository.fetchAllFolders()
    }
    
    private var notes: [Note] {
        appState.noteRepository.fetchNotes(in: folder)
    }
    
    private var groupedNotes: [DateGroup] {
        var groups: [String: [Note]] = [:]
        var dateOrder: [String] = []
        
        for note in notes {
            let key = dateGroupLabel(for: note.createdAt)
            if groups[key] == nil {
                groups[key] = []
                dateOrder.append(key)
            }
            groups[key]?.append(note)
        }
        
        return dateOrder.compactMap { key in
            guard let notes = groups[key] else { return nil }
            return DateGroup(date: key, notes: notes)
        }
    }
    
    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Folder title — editable for real folders
                    HStack(spacing: 8) {
                        if isRenaming, folder != nil {
                            TextField("Folder name", text: $renameText)
                                .textFieldStyle(.plain)
                                .font(Theme.titleFont(28))
                                .foregroundColor(Theme.textPrimary)
                                .focused($isRenameFocused)
                                .onSubmit { commitRename() }
                                .onExitCommand { cancelRename() }
                        } else {
                            Text(folder?.name ?? "Uncategorised")
                                .font(Theme.titleFont(28))
                                .foregroundColor(Theme.textPrimary)
                        }
                        
                        if folder != nil && !isRenaming && isTitleHovered {
                            Button {
                                startRename()
                            } label: {
                                Image(systemName: "pencil")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(Theme.textTertiary)
                            }
                            .buttonStyle(.plain)
                            .onHover { hovering in
                                if hovering { NSCursor.pointingHand.push() } else { NSCursor.pop() }
                            }
                        }
                    }
                    .onHover { isTitleHovered = $0 }
                    .onTapGesture(count: 2) {
                        if folder != nil { startRename() }
                    }
                    .padding(.top, Theme.Spacing.mainContentTopPadding)
                    .padding(.bottom, 12)
                    .onChange(of: isRenameFocused) { _, focused in
                        if !focused && isRenaming { commitRename() }
                    }
                    
                    let grouped = groupedNotes
                    
                    if grouped.isEmpty {
                        VStack(spacing: 8) {
                            Text("No meetings in this folder")
                                .font(Theme.headingFont())
                                .foregroundColor(Theme.textTertiary)
                            Text("Drag meetings from the sidebar or Meetings view.")
                                .font(Theme.captionFont())
                                .foregroundColor(Theme.textQuaternary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                    } else {
                        ForEach(grouped, id: \.date) { group in
                            DateGroupSection(
                                group: group,
                                folders: allFolders,
                                onSelectNote: onSelectNote,
                                onDeleteNote: { note in
                                    appState.noteRepository.deleteNote(note)
                                },
                                onMoveNote: { note, targetFolder in
                                    appState.noteRepository.moveNote(note, to: targetFolder)
                                }
                            )
                        }
                    }
                    
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, Theme.Spacing.contentPadding)
                .padding(.top, 4)
            }
        }
        .background(Theme.background)
    }
    
    private func startRename() {
        renameText = folder?.name ?? ""
        isRenaming = true
        isRenameFocused = true
    }
    
    private func commitRename() {
        guard isRenaming else { return }
        isRenaming = false
        isRenameFocused = false
        let trimmed = renameText.trimmingCharacters(in: .whitespaces)
        if let folder, !trimmed.isEmpty, trimmed != folder.name {
            appState.noteRepository.renameFolder(folder, to: trimmed)
        }
    }
    
    private func cancelRename() {
        isRenaming = false
        isRenameFocused = false
        renameText = folder?.name ?? ""
    }
    
    private func dateGroupLabel(for date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, d MMM"
        return formatter.string(from: date)
    }
}

// MARK: - Meetings Content View

/// Full-page meetings list — shows all meetings grouped by date.
private struct MeetingsContentView: View {

    @Binding var isSidebarCollapsed: Bool
    let onSelectNote: (UUID) -> Void
    let onNewNote: () -> Void
    @Environment(AppState.self) private var appState
    
    private var folders: [Folder] {
        appState.noteRepository.fetchAllFolders()
    }
    
    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Page title + Quick Start button
                    HStack(alignment: .center, spacing: 12) {
                        Text("Meetings")
                            .font(Theme.titleFont(28))
                            .foregroundColor(Theme.textPrimary)
                        
                        Spacer(minLength: 0)
                        
                        Button(action: onNewNote) {
                            HStack(spacing: 6) {
                                Image(systemName: "waveform.circle.fill")
                                    .font(.system(size: 13))
                                Text("Quick Start")
                                    .font(.system(size: 13, weight: .medium))
                            }
                            .foregroundColor(Theme.textPrimary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Theme.cardBackground)
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Theme.divider.opacity(0.5), lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .help("Start a new meeting")
                    }
                    .padding(.top, Theme.Spacing.mainContentTopPadding)
                    .padding(.bottom, 12)
                    
                    let grouped = groupedNotes
                    
                    if grouped.isEmpty {
                        VStack(spacing: 8) {
                            Text("No meetings yet")
                                .font(Theme.headingFont())
                                .foregroundColor(Theme.textTertiary)
                            Text("Start a meeting from the menu bar.")
                                .font(Theme.captionFont())
                                .foregroundColor(Theme.textQuaternary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                    } else {
                        ForEach(grouped, id: \.date) { group in
                            DateGroupSection(
                                group: group,
                                folders: folders,
                                onSelectNote: onSelectNote,
                                onDeleteNote: { note in
                                    appState.noteRepository.deleteNote(note)
                                },
                                onMoveNote: { note, folder in
                                    appState.noteRepository.moveNote(note, to: folder)
                                }
                            )
                        }
                    }
                    
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, Theme.Spacing.contentPadding)
                .padding(.top, 4)
            }
        }
        .background(Theme.background)
    }
    
    private var groupedNotes: [DateGroup] {
        let notes = appState.noteRepository.fetchAllNotes()
        
        var groups: [String: [Note]] = [:]
        var dateOrder: [String] = []
        
        for note in notes {
            let key = dateGroupLabel(for: note.createdAt)
            if groups[key] == nil {
                groups[key] = []
                dateOrder.append(key)
            }
            groups[key]?.append(note)
        }
        
        return dateOrder.compactMap { key in
            guard let notes = groups[key] else { return nil }
            return DateGroup(date: key, notes: notes)
        }
    }
    
    private func dateGroupLabel(for date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, d MMM"
        return formatter.string(from: date)
    }
}

// MARK: - Tag Content View

/// Full-page list of notes with a specific tag.
private struct TagContentView: View {
    let tagId: UUID
    @Binding var isSidebarCollapsed: Bool
    let onSelectNote: (UUID) -> Void
    
    @Environment(AppState.self) private var appState
    
    private var tag: Tag? {
        appState.noteRepository.fetchAllTags().first { $0.id == tagId }
    }
    
    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let tag {
                        HStack(spacing: 8) {
                            Image(systemName: "tag")
                                .font(.system(size: 20))
                                .foregroundColor(Theme.tagColor(hex: tag.colorHex))
                            Text(tag.name)
                                .font(Theme.titleFont(28))
                                .foregroundColor(Theme.textPrimary)
                        }
                        .padding(.top, Theme.Spacing.mainContentTopPadding)
                        .padding(.bottom, 4)
                        
                        Text("\(tag.notes.count) note\(tag.notes.count == 1 ? "" : "s")")
                            .font(Theme.captionFont())
                            .foregroundColor(Theme.textTertiary)
                            .padding(.bottom, 16)
                        
                        let notes = tag.notes.sorted { $0.createdAt > $1.createdAt }
                        
                        if notes.isEmpty {
                            VStack(spacing: 8) {
                                Text("No notes with this tag")
                                    .font(Theme.headingFont())
                                    .foregroundColor(Theme.textTertiary)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.top, 60)
                        } else {
                            VStack(spacing: 0) {
                                ForEach(Array(notes.enumerated()), id: \.element.id) { index, note in
                                    Button {
                                        onSelectNote(note.id)
                                    } label: {
                                        HStack(spacing: 12) {
                                            Image(systemName: note.noteType == .standalone ? "doc.text" : "calendar.badge.clock")
                                                .font(.system(size: 14))
                                                .foregroundColor(Theme.textQuaternary)
                                                .frame(width: 20)
                                            
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(note.title)
                                                    .font(.system(size: 14, weight: .medium))
                                                    .foregroundColor(Theme.textPrimary)
                                                    .lineLimit(1)
                                                
                                                Text(note.formattedDate)
                                                    .font(Theme.captionFont(11))
                                                    .foregroundColor(Theme.textTertiary)
                                            }
                                            
                                            Spacer()
                                            
                                            Image(systemName: "chevron.right")
                                                .font(.system(size: 10, weight: .medium))
                                                .foregroundColor(Theme.textQuaternary)
                                        }
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 12)
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    
                                    if index < notes.count - 1 {
                                        Rectangle()
                                            .fill(Theme.divider)
                                            .frame(height: 1)
                                            .padding(.leading, 48)
                                    }
                                }
                            }
                            .background(Theme.cardBackground)
                            .cornerRadius(12)
                            .shadow(color: .black.opacity(0.03), radius: 3, y: 1)
                        }
                    } else {
                        Text("Tag not found")
                            .font(Theme.headingFont())
                            .foregroundColor(Theme.textTertiary)
                            .padding(.top, 60)
                    }
                    
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, Theme.Spacing.contentPadding)
                .padding(.top, 4)
            }
        }
        .background(Theme.background)
    }
}

// MARK: - Apple Notes Content View

/// Full-page list of notes imported from the macOS Apple Notes app, grouped by folder.
private struct AppleNotesContentView: View {
    
    @Binding var isSidebarCollapsed: Bool
    let onSelectNote: (String) -> Void
    var onCreateNote: ((String) -> Void)? = nil
    @Environment(AppState.self) private var appState
    @State private var searchText = ""
    @State private var isCreating = false
    
    private var service: AppleNotesService { appState.appleNotesService }
    
    private var displayedNotes: [AppleNote] {
        searchText.isEmpty ? service.notes : service.searchNotes(query: searchText)
    }
    
    private var groupedByFolder: [(folder: String, notes: [AppleNote])] {
        var groups: [String: [AppleNote]] = [:]
        var order: [String] = []
        for note in displayedNotes {
            if groups[note.folder] == nil {
                groups[note.folder] = []
                order.append(note.folder)
            }
            groups[note.folder]?.append(note)
        }
        return order.compactMap { folder in
            guard let notes = groups[folder] else { return nil }
            return (folder: folder, notes: notes)
        }
    }
    
    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Header
                    HStack(alignment: .center, spacing: 12) {
                        Text("Apple Notes")
                            .font(Theme.titleFont(28))
                            .foregroundColor(Theme.textPrimary)
                        
                        Spacer(minLength: 0)
                        
                        if service.isLoading {
                            ProgressView()
                                .scaleEffect(0.7)
                                .frame(width: 20, height: 20)
                        }
                        
                        Button {
                            Task { await service.fetchNotes() }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "arrow.clockwise")
                                    .font(.system(size: 13))
                                Text("Refresh")
                                    .font(.system(size: 13, weight: .medium))
                            }
                            .foregroundColor(Theme.textPrimary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Theme.cardBackground)
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Theme.divider.opacity(0.5), lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(service.isLoading)
                        .help("Refresh notes from Apple Notes")
                        
                        Button {
                            guard !isCreating else { return }
                            isCreating = true
                            Task {
                                if let newNote = await service.createNote() {
                                    onCreateNote?(newNote.id)
                                }
                                isCreating = false
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "plus")
                                    .font(.system(size: 13))
                                Text("New Note")
                                    .font(.system(size: 13, weight: .medium))
                            }
                            .foregroundColor(Theme.textPrimary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Theme.cardBackground)
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Theme.divider.opacity(0.5), lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(isCreating)
                        .help("Create a new note in Apple Notes")
                    }
                    .padding(.top, Theme.Spacing.mainContentTopPadding)
                    .padding(.bottom, 12)
                    
                    // Search bar
                    if !service.notes.isEmpty {
                        HStack(spacing: 8) {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.textTertiary)
                            TextField("Search Apple Notes…", text: $searchText)
                                .textFieldStyle(.plain)
                                .font(.system(size: 13))
                                .foregroundColor(Theme.textPrimary)
                        }
                        .padding(.horizontal, 12)
                        .frame(height: 32)
                        .background(Theme.sidebarSelection)
                        .cornerRadius(6)
                        .padding(.bottom, 16)
                    }
                    
                    // Content states
                    if let error = service.errorMessage {
                        // Error / permission denied
                        VStack(spacing: 12) {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.system(size: 32))
                                .foregroundColor(Theme.textTertiary)
                            
                            Text(error)
                                .font(Theme.bodyFont())
                                .foregroundColor(Theme.textSecondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 40)
                            
                            if error.contains("permission") || error.contains("Automation") {
                                Button("Open System Settings") {
                                    if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation") {
                                        NSWorkspace.shared.open(url)
                                    }
                                }
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(Theme.olive)
                                .padding(.top, 4)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                    } else if service.isLoading && service.notes.isEmpty {
                        // Initial loading
                        VStack(spacing: 12) {
                            ProgressView()
                                .scaleEffect(0.8)
                            Text("Loading Apple Notes…")
                                .font(Theme.captionFont())
                                .foregroundColor(Theme.textTertiary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                    } else if service.notes.isEmpty {
                        // Empty state
                        VStack(spacing: 8) {
                            Image(systemName: "note.text")
                                .font(.system(size: 32))
                                .foregroundColor(Theme.textQuaternary)
                            Text("No Apple Notes found")
                                .font(Theme.headingFont())
                                .foregroundColor(Theme.textTertiary)
                            Text("Notes from the Apple Notes app will appear here.")
                                .font(Theme.captionFont())
                                .foregroundColor(Theme.textQuaternary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                    } else if displayedNotes.isEmpty {
                        // No search results
                        VStack(spacing: 8) {
                            Text("No matching notes")
                                .font(Theme.headingFont())
                                .foregroundColor(Theme.textTertiary)
                            Text("Try a different search term.")
                                .font(Theme.captionFont())
                                .foregroundColor(Theme.textQuaternary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                    } else {
                        // Notes grouped by folder
                        ForEach(groupedByFolder, id: \.folder) { group in
                            AppleNoteFolderSection(
                                folder: group.folder,
                                notes: group.notes,
                                onSelectNote: onSelectNote
                            )
                        }
                    }
                    
                    // Footer
                    if let lastFetched = service.lastFetchedAt {
                        Text("Last updated \(lastFetched.formatted(date: .abbreviated, time: .shortened))")
                            .font(Theme.captionFont(11))
                            .foregroundColor(Theme.textQuaternary)
                            .padding(.top, 20)
                    }
                    
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, Theme.Spacing.contentPadding)
                .padding(.top, 4)
            }
        }
        .background(Theme.background)
        .onAppear {
            if service.notes.isEmpty {
                Task { await service.fetchNotes() }
            }
        }
    }
}

// MARK: - Apple Note Folder Section

/// A group of Apple Notes from the same folder, rendered as a card list.
private struct AppleNoteFolderSection: View {
    let folder: String
    let notes: [AppleNote]
    let onSelectNote: (String) -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: "folder")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.textTertiary)
                Text(folder)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Theme.textTertiary)
                
                Text("(\(notes.count))")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textQuaternary)
            }
            .padding(.top, 20)
            .padding(.bottom, 8)
            
            VStack(spacing: 0) {
                ForEach(Array(notes.enumerated()), id: \.element.id) { index, note in
                    Button {
                        onSelectNote(note.id)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "note.text")
                                .font(.system(size: 14))
                                .foregroundColor(Theme.textQuaternary)
                                .frame(width: 20)
                            
                            VStack(alignment: .leading, spacing: 2) {
                                Text(note.title)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(Theme.textPrimary)
                                    .lineLimit(1)
                                
                                if !note.snippet.isEmpty {
                                    Text(note.snippet)
                                        .font(Theme.captionFont())
                                        .foregroundColor(Theme.textTertiary)
                                        .lineLimit(1)
                                }
                            }
                            
                            Spacer()
                            
                            Text(note.formattedDate)
                                .font(Theme.captionFont())
                                .foregroundColor(Theme.textQuaternary)
                            
                            Image(systemName: "chevron.right")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(Theme.textQuaternary)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    
                    if index < notes.count - 1 {
                        Rectangle()
                            .fill(Theme.divider)
                            .frame(height: 1)
                            .padding(.leading, 48)
                    }
                }
            }
            .background(Theme.cardBackground)
            .cornerRadius(12)
            .shadow(color: .black.opacity(0.03), radius: 3, y: 1)
        }
    }
}

// MARK: - Apple Note Detail View

/// Editable detail view for a single Apple Note.
/// Supports editing the title and body, with debounced auto-save back to Apple Notes.
private struct AppleNoteDetailView: View {
    let noteId: String
    @Binding var isSidebarCollapsed: Bool
    var onBack: (() -> Void)?
    
    @Environment(AppState.self) private var appState
    
    // Loading
    @State private var isLoadingBody = true
    
    // Editing
    @State private var editableBody = ""
    @State private var isEditingTitle = false
    @State private var editingTitle = ""
    @State private var hasLoadedBody = false
    
    // Save state
    @State private var saveStatus: SaveStatus = .saved
    @State private var saveTask: Task<Void, Never>?
    
    // Delete
    @State private var showDeleteConfirm = false
    
    private enum SaveStatus {
        case saved, unsaved, saving
        
        var label: String {
            switch self {
            case .saved: return "Saved"
            case .unsaved: return "Unsaved changes"
            case .saving: return "Saving…"
            }
        }
    }
    
    private var note: AppleNote? {
        appState.appleNotesService.notes.first { $0.id == noteId }
    }
    
    var body: some View {
        VStack(spacing: 0) {
            if let note {
                // Top bar: back, metadata, actions
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .center) {
                        // Back button
                        if let onBack {
                            Button(action: onBack) {
                                HStack(spacing: 4) {
                                    Image(systemName: "chevron.left")
                                        .font(.system(size: 12, weight: .medium))
                                    Text("Apple Notes")
                                        .font(.system(size: 13))
                                }
                                .foregroundColor(Theme.textSecondary)
                            }
                            .buttonStyle(.plain)
                        }
                        
                        Spacer()
                        
                        // Save status indicator
                        if !isLoadingBody {
                            HStack(spacing: 4) {
                                Circle()
                                    .fill(saveStatus == .saved ? Color.green.opacity(0.6) :
                                          saveStatus == .saving ? Color.orange.opacity(0.6) :
                                          Theme.textQuaternary)
                                    .frame(width: 6, height: 6)
                                Text(saveStatus.label)
                                    .font(.system(size: 11))
                                    .foregroundColor(Theme.textTertiary)
                            }
                        }
                        
                        // Actions
                        HStack(spacing: 8) {
                            Button {
                                appState.appleNotesService.openInAppleNotes(id: note.id)
                            } label: {
                                HStack(spacing: 5) {
                                    Image(systemName: "arrow.up.forward.square")
                                        .font(.system(size: 11))
                                    Text("Open in Notes")
                                        .font(.system(size: 12, weight: .medium))
                                }
                                .foregroundColor(Theme.olive)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Theme.oliveFaint)
                                .cornerRadius(6)
                            }
                            .buttonStyle(.plain)
                            
                            Button {
                                showDeleteConfirm = true
                            } label: {
                                Image(systemName: "trash")
                                    .font(.system(size: 12))
                                    .foregroundColor(Theme.textTertiary)
                                    .frame(width: 28, height: 28)
                                    .background(Theme.sidebarSelection)
                                    .cornerRadius(6)
                            }
                            .buttonStyle(.plain)
                            .help("Delete this note")
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.contentPadding)
                    .padding(.top, Theme.Spacing.mainContentTopPadding)
                    .padding(.bottom, 8)
                    
                    // Metadata row
                    HStack(spacing: 16) {
                        HStack(spacing: 4) {
                            Image(systemName: "folder")
                                .font(.system(size: 11))
                            Text(note.folder)
                                .font(Theme.captionFont(12))
                        }
                        .foregroundColor(Theme.textTertiary)
                        
                        HStack(spacing: 4) {
                            Image(systemName: "clock")
                                .font(.system(size: 11))
                            Text("Modified \(note.formattedDate)")
                                .font(Theme.captionFont(12))
                        }
                        .foregroundColor(Theme.textTertiary)
                    }
                    .padding(.horizontal, Theme.Spacing.contentPadding)
                    .padding(.bottom, 12)
                    
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(height: 1)
                }
                
                // Editor area
                if isLoadingBody {
                    Spacer()
                    VStack(spacing: 8) {
                        ProgressView()
                            .scaleEffect(0.7)
                        Text("Loading note…")
                            .font(Theme.captionFont())
                            .foregroundColor(Theme.textTertiary)
                    }
                    Spacer()
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            // Editable title
                            if isEditingTitle {
                                TextField("Note title", text: $editingTitle, onCommit: {
                                    commitTitleRename()
                                })
                                .font(Theme.titleFont(26))
                                .foregroundColor(Theme.textPrimary)
                                .textFieldStyle(.plain)
                                .onExitCommand { isEditingTitle = false }
                                .padding(.top, 16)
                                .padding(.bottom, 4)
                            } else {
                                Text(note.title)
                                    .font(Theme.titleFont(26))
                                    .foregroundColor(
                                        note.title == "Untitled Note" ? Theme.textTertiary : Theme.textPrimary
                                    )
                                    .contentShape(Rectangle())
                                    .onTapGesture {
                                        editingTitle = note.title == "Untitled Note" ? "" : note.title
                                        isEditingTitle = true
                                    }
                                    .help("Click to rename")
                                    .padding(.top, 16)
                                    .padding(.bottom, 4)
                            }
                            
                            // Body editor
                            AppleNoteTextEditor(text: $editableBody)
                                .frame(minHeight: 400)
                        }
                        .padding(.horizontal, Theme.Spacing.contentPadding)
                        .padding(.bottom, 40)
                    }
                }
            } else {
                Spacer()
                Text("Note not found")
                    .font(Theme.headingFont())
                    .foregroundColor(Theme.textTertiary)
                Spacer()
            }
        }
        .background(Theme.background)
        .task(id: noteId) {
            isLoadingBody = true
            hasLoadedBody = false
            saveStatus = .saved
            let body = await appState.appleNotesService.fetchNoteBody(id: noteId)
            editableBody = body
            hasLoadedBody = true
            isLoadingBody = false
        }
        .onChange(of: editableBody) { _, _ in
            guard hasLoadedBody else { return }
            saveStatus = .unsaved
            
            // Debounced auto-save (1.5 seconds after last keystroke)
            saveTask?.cancel()
            saveTask = Task {
                try? await Task.sleep(for: .seconds(1.5))
                guard !Task.isCancelled else { return }
                await saveBody()
            }
        }
        .onDisappear {
            // Save immediately when navigating away if there are unsaved changes
            if saveStatus == .unsaved {
                saveTask?.cancel()
                Task { await saveBody() }
            }
        }
        .alert("Delete Note", isPresented: $showDeleteConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                Task {
                    try? await appState.appleNotesService.deleteNote(id: noteId)
                    onBack?()
                }
            }
        } message: {
            Text("This will permanently delete \"\(note?.title ?? "this note")\" from Apple Notes. This cannot be undone.")
        }
    }
    
    private func saveBody() async {
        await MainActor.run { saveStatus = .saving }
        do {
            try await appState.appleNotesService.saveNoteBody(id: noteId, plainText: editableBody)
            await MainActor.run { saveStatus = .saved }
        } catch {
            print("[AppleNoteDetail] Save failed: \(error.localizedDescription)")
            await MainActor.run { saveStatus = .unsaved }
        }
    }
    
    private func commitTitleRename() {
        isEditingTitle = false
        let trimmed = editingTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != note?.title else { return }
        Task {
            try? await appState.appleNotesService.renameNote(id: noteId, title: trimmed)
        }
    }
}

// MARK: - Apple Note Text Editor

/// A styled `TextEditor` wrapper that matches the app's warm cream aesthetic.
private struct AppleNoteTextEditor: NSViewRepresentable {
    @Binding var text: String
    
    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSTextView.scrollableTextView()
        guard let textView = scrollView.documentView as? NSTextView else {
            return scrollView
        }
        
        textView.isRichText = false
        textView.allowsUndo = true
        textView.isEditable = true
        textView.isSelectable = true
        textView.font = .systemFont(ofSize: 14)
        textView.textColor = NSColor(Theme.textPrimary)
        textView.backgroundColor = .clear
        textView.drawsBackground = false
        textView.textContainerInset = NSSize(width: 0, height: 8)
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.delegate = context.coordinator
        
        // Match the line spacing
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.lineSpacing = 4
        textView.defaultParagraphStyle = paragraphStyle
        
        scrollView.hasVerticalScroller = false
        scrollView.hasHorizontalScroller = false
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        
        return scrollView
    }
    
    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? NSTextView else { return }
        // Only update if the text actually changed externally (not from typing)
        if textView.string != text && !context.coordinator.isEditing {
            textView.string = text
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }
    
    class Coordinator: NSObject, NSTextViewDelegate {
        var text: Binding<String>
        var isEditing = false
        
        init(text: Binding<String>) {
            self.text = text
        }
        
        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            isEditing = true
            text.wrappedValue = textView.string
            isEditing = false
        }
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let newStandaloneNote = Notification.Name("newStandaloneNote")
}
