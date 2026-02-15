import SwiftUI

/// Main to-do list view — shows AI-extracted and manually created to-dos.
struct TodoListView: View {
    
    @Binding var isSidebarCollapsed: Bool
    var onNavigateToNote: ((UUID) -> Void)?
    var onNavigateToEmail: (() -> Void)?
    
    @Environment(AppState.self) private var appState
    @State private var selectedFilter: TodoFilter = .pending
    @State private var expandedTodoId: UUID?
    @State private var isCreatingTodo = false
    @State private var newTodoTitle = ""
    @State private var newTodoPriority: TodoItem.Priority = .medium
    @State private var editingTodoId: UUID?
    @State private var editTitle = ""
    @State private var editDetails = ""
    @State private var showExclusions = false
    @State private var confirmExcludeSender: String?
    /// Tracks IDs of to-dos that were just completed — triggers the celebration animation.
    @State private var justCompletedIds: Set<UUID> = []
    @FocusState private var isNewTodoFieldFocused: Bool
    
    enum TodoFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case pending = "Pending"
        case completed = "Completed"
        
        var id: String { rawValue }
    }
    
    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Page title + Add button
                    HStack(alignment: .center, spacing: 12) {
                        Text("To-Dos")
                            .font(Theme.titleFont(28))
                            .foregroundColor(Theme.textPrimary)
                        
                        // Scanning indicator
                        if appState.isTodoScanning {
                            HStack(spacing: 5) {
                                ProgressView()
                                    .controlSize(.small)
                                Text("Scanning…")
                                    .font(.system(size: 11))
                                    .foregroundColor(Theme.textTertiary)
                            }
                            .transition(.opacity)
                            .animation(.easeInOut(duration: 0.3), value: appState.isTodoScanning)
                        }
                        
                        Spacer(minLength: 0)
                        
                        // Manage exclusions
                        let exclusionCount = appState.todoRepository.excludedSenders().count
                        Button(action: { showExclusions.toggle() }) {
                            HStack(spacing: 6) {
                                Image(systemName: "hand.raised")
                                    .font(.system(size: 13, weight: .medium))
                                Text("Excluded")
                                    .font(.system(size: 13, weight: .medium))
                                if exclusionCount > 0 {
                                    Text("\(exclusionCount)")
                                        .font(.system(size: 10, weight: .semibold))
                                        .foregroundColor(Theme.textTertiary)
                                }
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
                        .help("Manage excluded senders")
                        
                        Button(action: { isCreatingTodo.toggle() }) {
                            HStack(spacing: 6) {
                                Image(systemName: "plus")
                                    .font(.system(size: 13, weight: .medium))
                                Text("Add To-Do")
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
                        .help("Create a new to-do")
                    }
                    .padding(.top, Theme.Spacing.mainContentTopPadding)
                    .padding(.bottom, 12)
                    
                    // Filter tabs
                    filterTabs
                        .padding(.bottom, 16)
                    
                    // Exclusions panel
                    if showExclusions {
                        exclusionsPanel
                            .padding(.bottom, 12)
                    }
                    
                    // Inline creation form
                    if isCreatingTodo {
                        newTodoForm
                            .padding(.bottom, 12)
                    }
                    
                    // To-do list
                    let todos = filteredTodos
                    
                    if todos.isEmpty {
                        emptyState
                    } else {
                        let grouped = groupedTodos(todos)
                        ForEach(grouped, id: \.key) { group in
                            todoGroup(title: group.key, todos: group.todos)
                        }
                    }
                    
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, Theme.Spacing.contentPadding)
                .padding(.top, 4)
            }
        }
        .alert(
            "Exclude Sender",
            isPresented: Binding(
                get: { confirmExcludeSender != nil },
                set: { if !$0 { confirmExcludeSender = nil } }
            ),
            presenting: confirmExcludeSender
        ) { sender in
            Button("Exclude", role: .destructive) {
                withAnimation(.easeInOut(duration: 0.2)) {
                    appState.todoRepository.excludeSender(sender)
                }
                confirmExcludeSender = nil
            }
            Button("Cancel", role: .cancel) {
                confirmExcludeSender = nil
            }
        } message: { sender in
            Text("Emails from \(sender) will no longer create to-do items. Any existing to-dos from this sender will be removed.\n\nYou can undo this from the Excluded panel.")
        }
    }
    
    // MARK: - Filter Tabs
    
    private var filterTabs: some View {
        HStack(spacing: 0) {
            // Tab container
            HStack(spacing: 0) {
                ForEach(TodoFilter.allCases) { filter in
                    let isActive = selectedFilter == filter
                    let count = countForFilter(filter)
                    
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) {
                            selectedFilter = filter
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(filter.rawValue)
                                .font(.system(size: 12, weight: .medium))
                            
                            if count > 0 {
                                Text("\(count)")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundColor(isActive ? Theme.textSecondary : Theme.textTertiary)
                            }
                        }
                        .foregroundColor(isActive ? Theme.textPrimary : Theme.textSecondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(isActive ? Theme.cardBackground : Color.clear)
                        .cornerRadius(6)
                        .shadow(color: isActive ? .black.opacity(0.04) : .clear, radius: 1, y: 1)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(2)
            .background(Theme.sidebarSelection.opacity(0.6))
            .cornerRadius(8)
            
            Spacer()
        }
    }
    
    // MARK: - New To-Do Form
    
    private var newTodoForm: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "circle")
                    .font(.system(size: 16))
                    .foregroundColor(Theme.textTertiary)
                
                TextField("What do you need to do?", text: $newTodoTitle)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14))
                    .foregroundColor(Theme.textPrimary)
                    .focused($isNewTodoFieldFocused)
                    .onSubmit { submitNewTodo() }
                    .onAppear { isNewTodoFieldFocused = true }
                
                // Priority picker
                Menu {
                    ForEach(TodoItem.Priority.allCases) { priority in
                        Button {
                            newTodoPriority = priority
                        } label: {
                            HStack {
                                Circle()
                                    .fill(priorityColor(priority))
                                    .frame(width: 6, height: 6)
                                Text(priority.label)
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 3) {
                        Circle()
                            .fill(priorityColor(newTodoPriority))
                            .frame(width: 6, height: 6)
                        Text(newTodoPriority.label)
                            .font(.system(size: 11))
                            .foregroundColor(Theme.textSecondary)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Theme.sidebarSelection.opacity(0.5))
                    .cornerRadius(4)
                }
                .buttonStyle(.plain)
                
                Button("Add") { submitNewTodo() }
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Theme.sidebarSelection)
                    .cornerRadius(6)
                    .buttonStyle(.plain)
                    .disabled(newTodoTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                
                Button {
                    isCreatingTodo = false
                    newTodoTitle = ""
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Theme.textTertiary)
                }
                .buttonStyle(.plain)
            }
            .padding(12)
            .background(Theme.cardBackground)
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Theme.divider.opacity(0.5), lineWidth: 1)
            )
        }
    }
    
    // MARK: - To-Do Group
    
    private func todoGroup(title: String, todos: [TodoItem]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Group header
            HStack(spacing: 6) {
                Text(title)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Theme.textTertiary)
                    .textCase(.uppercase)
                    .tracking(0.5)
                
                Text("\(todos.count)")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Theme.textQuaternary)
            }
            .padding(.top, 16)
            .padding(.bottom, 8)
            
            // To-do rows
            VStack(spacing: 2) {
                ForEach(todos, id: \.id) { todo in
                    todoRow(todo)
                }
            }
        }
    }
    
    // MARK: - To-Do Row
    
    private func todoRow(_ todo: TodoItem) -> some View {
        let isExpanded = expandedTodoId == todo.id
        let isCelebrating = justCompletedIds.contains(todo.id)
        // Show filled checkmark if actually completed OR mid-celebration
        let showChecked = todo.isCompleted || isCelebrating
        
        return VStack(spacing: 0) {
            // Main row
            HStack(spacing: 10) {
                // Checkbox with celebration animation
                Button {
                    completeTodoWithAnimation(todo)
                } label: {
                    ZStack {
                        // Ring pulse 1 — expands and fades out
                        Circle()
                            .stroke(Theme.olive.opacity(0.6), lineWidth: 2)
                            .frame(width: 22, height: 22)
                            .scaleEffect(isCelebrating ? 2.4 : 1.0)
                            .opacity(isCelebrating ? 0 : 0)
                        
                        // Ring pulse 2 — wider, slightly delayed
                        Circle()
                            .stroke(Theme.olive.opacity(0.3), lineWidth: 1.5)
                            .frame(width: 22, height: 22)
                            .scaleEffect(isCelebrating ? 3.0 : 1.0)
                            .opacity(isCelebrating ? 0 : 0)
                        
                        // Burst particles — 6 dots flying outward
                        ForEach(0..<6, id: \.self) { i in
                            Circle()
                                .fill(Theme.olive.opacity(0.8))
                                .frame(width: 3.5, height: 3.5)
                                .offset(
                                    x: isCelebrating ? cos(Double(i) * .pi / 3) * 18 : 0,
                                    y: isCelebrating ? sin(Double(i) * .pi / 3) * 18 : 0
                                )
                                .scaleEffect(isCelebrating ? 0.3 : 1.0)
                                .opacity(isCelebrating ? 0 : 0)
                        }
                        
                        // Checkmark icon
                        Image(systemName: showChecked ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 18))
                            .foregroundColor(showChecked ? Theme.olive : Theme.textTertiary)
                            .scaleEffect(isCelebrating ? 1.4 : 1.0)
                    }
                    .frame(width: 28, height: 28)
                    .animation(
                        .spring(response: 0.3, dampingFraction: 0.4, blendDuration: 0),
                        value: isCelebrating
                    )
                }
                .buttonStyle(.plain)
                
                // Title + due date only (source shown in expanded detail)
                VStack(alignment: .leading, spacing: 3) {
                    Text(todo.title)
                        .font(.system(size: 14, weight: .regular))
                        .foregroundColor(showChecked ? Theme.textTertiary : Theme.textPrimary)
                        .strikethrough(showChecked, color: Theme.textTertiary)
                        .lineLimit(isExpanded ? nil : 1)
                    
                    // Due date only in collapsed row
                    if let dueDateStr = todo.formattedDueDate {
                        HStack(spacing: 3) {
                            Image(systemName: "calendar")
                                .font(.system(size: 9))
                            Text(dueDateStr)
                                .font(.system(size: 11))
                        }
                        .foregroundColor(todo.isOverdue ? Theme.recording : Theme.textTertiary)
                    }
                }
                .animation(.easeInOut(duration: 0.2), value: showChecked)
                
                Spacer(minLength: 0)
                
                // Priority dot
                Circle()
                    .fill(priorityColor(todo.priority))
                    .frame(width: 6, height: 6)
                
                // Expand chevron
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Theme.textQuaternary)
                    .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    .animation(.easeInOut(duration: 0.2), value: isExpanded)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation(.easeInOut(duration: 0.25)) {
                    expandedTodoId = isExpanded ? nil : todo.id
                }
            }
            .contextMenu {
                todoContextMenu(todo)
            }
            
            // Expanded detail — clipped so collapse doesn't overshoot
            if isExpanded {
                todoDetail(todo)
                    .clipped()
                    .transition(.opacity)
            }
        }
        .background(
            // Green flash on completion
            RoundedRectangle(cornerRadius: 8)
                .fill(Theme.olive.opacity(isCelebrating ? 0.08 : 0))
        )
        .background(Theme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(
                    isCelebrating ? Theme.olive.opacity(0.4) : Theme.divider.opacity(0.3),
                    lineWidth: isCelebrating ? 1.5 : 1
                )
        )
        .animation(.easeOut(duration: 0.3), value: isCelebrating)
    }
    
    // MARK: - Source Badge
    
    private func sourceBadge(_ todo: TodoItem) -> some View {
        Button {
            navigateToSource(todo)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: todo.sourceType.icon)
                    .font(.system(size: 9))
                Text(todo.sourceTitle ?? todo.sourceType.label)
                    .font(.system(size: 11))
                    .lineLimit(1)
            }
            .foregroundColor(Theme.textSecondary)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Theme.sidebarSelection.opacity(0.6))
            .cornerRadius(4)
        }
        .buttonStyle(.plain)
        .help("View source")
    }
    
    // MARK: - To-Do Detail (Expanded)
    
    private func todoDetail(_ todo: TodoItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider()
                .background(Theme.divider)
            
            // Source badge (shown only in expanded view)
            if todo.sourceType != .manual {
                sourceBadge(todo)
            }
            
            // Details
            if let details = todo.details, !details.isEmpty {
                Text(details)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            
            // Source snippet
            if let snippet = todo.sourceSnippet, !snippet.isEmpty {
                HStack(alignment: .top, spacing: 8) {
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(width: 2)
                    
                    Text(snippet)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(Theme.textTertiary)
                        .italic()
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, 2)
            }
            
            // Source navigation
            if todo.sourceType != .manual, let sourceTitle = todo.sourceTitle {
                Button {
                    navigateToSource(todo)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: todo.sourceType.icon)
                            .font(.system(size: 11))
                        Text("From: \(sourceTitle)")
                            .font(.system(size: 12))
                            .lineLimit(1)
                        Image(systemName: "arrow.right")
                            .font(.system(size: 9))
                    }
                    .foregroundColor(Theme.olive)
                }
                .buttonStyle(.plain)
                .help("Navigate to source")
            }
            
            // Action buttons
            HStack(spacing: 8) {
                // Priority picker
                Menu {
                    ForEach(TodoItem.Priority.allCases) { priority in
                        Button {
                            appState.todoRepository.updateTodo(todo, priority: priority)
                        } label: {
                            HStack {
                                Circle()
                                    .fill(priorityColor(priority))
                                    .frame(width: 6, height: 6)
                                Text(priority.label)
                                if todo.priority == priority {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(priorityColor(todo.priority))
                            .frame(width: 6, height: 6)
                        Text(todo.priority.label)
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(Theme.textSecondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Theme.sidebarSelection.opacity(0.5))
                    .cornerRadius(4)
                }
                .buttonStyle(.plain)
                
                Spacer()
                
                // Complete/Uncomplete
                Button {
                    completeTodoWithAnimation(todo)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: todo.isCompleted ? "arrow.uturn.backward" : "checkmark")
                            .font(.system(size: 10))
                        Text(todo.isCompleted ? "Uncomplete" : "Complete")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(Theme.textSecondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Theme.sidebarSelection.opacity(0.5))
                    .cornerRadius(4)
                }
                .buttonStyle(.plain)
                
                // Delete
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        if expandedTodoId == todo.id { expandedTodoId = nil }
                        appState.todoRepository.deleteTodo(todo)
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "trash")
                            .font(.system(size: 10))
                        Text("Delete")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(Theme.recording)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Theme.recording.opacity(0.08))
                    .cornerRadius(4)
                }
                .buttonStyle(.plain)
            }
            
            // Exclude sender (email to-dos)
            if todo.sourceType == .email {
                let sender = resolveSenderEmail(for: todo)
                if let sender, !sender.isEmpty {
                    Divider()
                        .background(Theme.divider)
                        .padding(.top, 4)
                    
                    Button {
                        confirmExcludeSender = sender
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "hand.raised")
                                .font(.system(size: 11))
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Don't create to-dos from this sender")
                                    .font(.system(size: 11, weight: .medium))
                                Text(sender)
                                    .font(.system(size: 10))
                                    .foregroundColor(Theme.textTertiary)
                            }
                        }
                        .foregroundColor(Theme.textSecondary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 10)
    }
    
    // MARK: - Context Menu
    
    @ViewBuilder
    private func todoContextMenu(_ todo: TodoItem) -> some View {
        Button(todo.isCompleted ? "Mark as Pending" : "Mark as Complete") {
            completeTodoWithAnimation(todo)
        }
        
        if todo.sourceType != .manual {
            Button("View Source") {
                navigateToSource(todo)
            }
        }
        
        Divider()
        
        Menu("Priority") {
            ForEach(TodoItem.Priority.allCases) { priority in
                Button {
                    appState.todoRepository.updateTodo(todo, priority: priority)
                } label: {
                    if todo.priority == priority {
                        Label(priority.label, systemImage: "checkmark")
                    } else {
                        Text(priority.label)
                    }
                }
            }
        }
        
        if todo.sourceType == .email {
            if let sender = resolveSenderEmail(for: todo), !sender.isEmpty {
                Divider()
                Button("Don't Create To-Dos from \(sender)") {
                    confirmExcludeSender = sender
                }
            }
        }
        
        Divider()
        
        Button("Delete", role: .destructive) {
            if expandedTodoId == todo.id { expandedTodoId = nil }
            appState.todoRepository.deleteTodo(todo)
        }
    }
    
    // MARK: - Empty State
    
    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "checklist")
                .font(.system(size: 32))
                .foregroundColor(Theme.textQuaternary)
                .padding(.bottom, 4)
            
            Text(emptyStateTitle)
                .font(Theme.headingFont())
                .foregroundColor(Theme.textTertiary)
            
            Text(emptyStateSubtitle)
                .font(Theme.captionFont())
                .foregroundColor(Theme.textQuaternary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }
    
    private var emptyStateTitle: String {
        switch selectedFilter {
        case .all: return "No to-dos yet"
        case .pending: return "All caught up"
        case .completed: return "No completed to-dos"
        }
    }
    
    private var emptyStateSubtitle: String {
        switch selectedFilter {
        case .all: return "They'll appear automatically from your meetings and emails,\nor create one manually with the + button."
        case .pending: return "You have no pending to-dos. Nice work!"
        case .completed: return "Completed to-dos will appear here."
        }
    }
    
    // MARK: - Exclusions Panel
    
    private var exclusionsPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "hand.raised")
                    .font(.system(size: 13))
                    .foregroundColor(Theme.textSecondary)
                Text("Excluded Senders")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.textPrimary)
                
                Spacer()
                
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showExclusions = false
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Theme.textTertiary)
                }
                .buttonStyle(.plain)
            }
            
            Text("Emails from these senders won't generate to-do items.")
                .font(.system(size: 12))
                .foregroundColor(Theme.textTertiary)
            
            let excluded = Array(appState.todoRepository.excludedSenders()).sorted()
            
            if excluded.isEmpty {
                HStack {
                    Spacer()
                    Text("No excluded senders yet")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.textQuaternary)
                    Spacer()
                }
                .padding(.vertical, 12)
            } else {
                VStack(spacing: 4) {
                    ForEach(excluded, id: \.self) { sender in
                        HStack(spacing: 8) {
                            Image(systemName: "envelope")
                                .font(.system(size: 11))
                                .foregroundColor(Theme.textTertiary)
                            
                            Text(sender)
                                .font(.system(size: 13))
                                .foregroundColor(Theme.textPrimary)
                                .lineLimit(1)
                            
                            Spacer()
                            
                            Button {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    appState.todoRepository.removeExclusion(sender)
                                }
                            } label: {
                                HStack(spacing: 3) {
                                    Image(systemName: "arrow.uturn.backward")
                                        .font(.system(size: 9))
                                    Text("Remove")
                                        .font(.system(size: 11, weight: .medium))
                                }
                                .foregroundColor(Theme.textSecondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Theme.sidebarSelection.opacity(0.5))
                                .cornerRadius(4)
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(Theme.sidebarSelection.opacity(0.3))
                        .cornerRadius(6)
                    }
                }
            }
        }
        .padding(14)
        .background(Color.white)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Theme.divider.opacity(0.5), lineWidth: 1)
        )
    }
    
    // MARK: - Data
    
    private var filteredTodos: [TodoItem] {
        switch selectedFilter {
        case .all: return appState.todoRepository.fetchAllTodos()
        case .pending: return appState.todoRepository.fetchPendingTodos()
        case .completed: return appState.todoRepository.fetchCompletedTodos()
        }
    }
    
    private func countForFilter(_ filter: TodoFilter) -> Int {
        switch filter {
        case .all: return appState.todoRepository.fetchAllTodos().count
        case .pending: return appState.todoRepository.fetchPendingTodos().count
        case .completed: return appState.todoRepository.fetchCompletedTodos().count
        }
    }
    
    private struct TodoGroup: Identifiable {
        let key: String
        let todos: [TodoItem]
        var id: String { key }
    }
    
    /// Group to-dos by their source type for display.
    private func groupedTodos(_ todos: [TodoItem]) -> [TodoGroup] {
        var groups: [String: [TodoItem]] = [:]
        
        for todo in todos {
            let key: String
            switch todo.sourceType {
            case .meeting:
                key = "From Meetings"
            case .email:
                key = "From Emails"
            case .manual:
                key = "Manual"
            }
            groups[key, default: []].append(todo)
        }
        
        // Sort order: Manual first, then Meetings, then Emails
        let order = ["Manual", "From Meetings", "From Emails"]
        return order.compactMap { key in
            guard let todos = groups[key], !todos.isEmpty else { return nil }
            return TodoGroup(key: key, todos: todos)
        }
    }
    
    // MARK: - Helpers
    
    private func priorityColor(_ priority: TodoItem.Priority) -> Color {
        switch priority {
        case .high: return Theme.recording
        case .medium: return Theme.olive
        case .low: return Theme.textQuaternary
        }
    }
    
    private func submitNewTodo() {
        let title = newTodoTitle.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return }
        
        appState.todoRepository.createTodo(
            title: title,
            priority: newTodoPriority,
            sourceType: .manual
        )
        
        newTodoTitle = ""
        newTodoPriority = .medium
        isCreatingTodo = false
    }
    
    private func navigateToSource(_ todo: TodoItem) {
        switch todo.sourceType {
        case .meeting:
            if let sourceId = todo.sourceId, let uuid = UUID(uuidString: sourceId) {
                onNavigateToNote?(uuid)
            }
        case .email:
            onNavigateToEmail?()
        case .manual:
            break
        }
    }
    
    /// Resolve the sender email for a to-do. If the `senderEmail` field is populated, use it.
    /// Otherwise, try to look it up from the current Gmail threads in memory.
    private func resolveSenderEmail(for todo: TodoItem) -> String? {
        // Use stored sender if available
        if let stored = todo.senderEmail, !stored.isEmpty {
            return stored
        }
        // Fallback: look up from Gmail threads by thread ID
        guard let threadId = todo.sourceId else { return nil }
        if let thread = appState.gmailService.inboxThreads.first(where: { $0.id == threadId }),
           let latestMessage = thread.messages.last {
            return latestMessage.fromEmail
        }
        return nil
    }
    
    /// Complete/uncomplete a to-do with a celebration animation when completing.
    private func completeTodoWithAnimation(_ todo: TodoItem) {
        let wasCompleted = todo.isCompleted
        
        // Uncompleting — just toggle immediately, no fanfare
        guard !wasCompleted else {
            withAnimation(.easeInOut(duration: 0.2)) {
                appState.todoRepository.toggleComplete(todo)
            }
            return
        }
        
        // === Completing: animate FIRST, persist AFTER ===
        
        // Step 1: Immediately trigger celebration visuals.
        // This shows the filled checkmark + ring burst + green flash
        // BEFORE the data model changes, so the row stays in the list.
        withAnimation(.spring(response: 0.3, dampingFraction: 0.4, blendDuration: 0)) {
            justCompletedIds.insert(todo.id)
        }
        
        // Step 2: After the animation has played, actually persist the completion
        // and remove the row from the pending filter.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) {
            withAnimation(.easeInOut(duration: 0.3)) {
                appState.todoRepository.toggleComplete(todo)
                _ = justCompletedIds.remove(todo.id)
            }
        }
    }
}
