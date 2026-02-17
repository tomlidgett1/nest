import Foundation
import SwiftData

/// CRUD operations for TodoItem models.
/// Wraps SwiftData ModelContext for clean data access.
/// After each mutation, fires a sync push to Supabase (if available).
@Observable
final class TodoRepository {
    
    private let modelContext: ModelContext
    
    /// Optional sync service — set after Supabase authentication.
    var syncService: SyncService?
    
    /// Live count of pending (incomplete, non-deleted) to-dos.
    /// Automatically refreshed after every mutation so the sidebar badge stays current.
    private(set) var livePendingCount: Int = 0
    
    /// Live count of unseen, non-deleted, non-completed to-dos.
    /// Automatically refreshed after every mutation so the sidebar "new" badge stays current.
    private(set) var liveUnseenCount: Int = 0
    
    init(modelContext: ModelContext) {
        self.modelContext = modelContext
        refreshBadgeCounts()
    }
    
    // MARK: - Create
    
    /// Create a new to-do item and insert it into the store.
    @discardableResult
    func createTodo(
        title: String,
        details: String? = nil,
        dueDate: Date? = nil,
        priority: TodoItem.Priority = .medium,
        sourceType: TodoItem.SourceType = .manual,
        sourceId: String? = nil,
        sourceTitle: String? = nil,
        sourceSnippet: String? = nil
    ) -> TodoItem {
        let todo = TodoItem(
            title: title,
            details: details,
            dueDate: dueDate,
            priority: priority,
            sourceType: sourceType,
            sourceId: sourceId,
            sourceTitle: sourceTitle,
            sourceSnippet: sourceSnippet,
            isSeen: true // User-created to-dos are immediately seen
        )
        modelContext.insert(todo)
        save()
        syncService?.pushTodo(todo)
        return todo
    }
    
    /// Batch-save multiple to-do items (used by AI extraction).
    @discardableResult
    func saveTodos(_ items: [TodoItem]) -> [TodoItem] {
        for item in items {
            modelContext.insert(item)
        }
        save()
        for item in items {
            syncService?.pushTodo(item)
        }
        return items
    }
    
    // MARK: - Read
    
    /// Fetch all non-deleted to-dos, sorted by creation date (newest first).
    /// Fetch a single to-do by its UUID.
    func fetchTodoById(_ id: UUID) -> TodoItem? {
        let predicate = #Predicate<TodoItem> { todo in
            todo.id == id && todo.isDeleted == false
        }
        let descriptor = FetchDescriptor<TodoItem>(predicate: predicate)
        return (try? modelContext.fetch(descriptor))?.first
    }
    
    func fetchAllTodos() -> [TodoItem] {
        let predicate = #Predicate<TodoItem> { todo in
            todo.isDeleted == false
        }
        let descriptor = FetchDescriptor<TodoItem>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }
    
    /// Fetch incomplete to-dos.
    func fetchPendingTodos() -> [TodoItem] {
        let predicate = #Predicate<TodoItem> { todo in
            todo.isDeleted == false && todo.isCompleted == false
        }
        let descriptor = FetchDescriptor<TodoItem>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }
    
    /// Fetch completed to-dos.
    func fetchCompletedTodos() -> [TodoItem] {
        let predicate = #Predicate<TodoItem> { todo in
            todo.isDeleted == false && todo.isCompleted == true
        }
        let descriptor = FetchDescriptor<TodoItem>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.completedAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }
    
    /// Count of pending (incomplete, non-deleted) to-dos.
    func pendingCount() -> Int {
        fetchPendingTodos().count
    }
    
    /// Count of unseen, non-deleted, non-completed to-dos.
    func unseenCount() -> Int {
        let predicate = #Predicate<TodoItem> { todo in
            todo.isDeleted == false && todo.isCompleted == false && todo.isSeen == false
        }
        let descriptor = FetchDescriptor<TodoItem>(predicate: predicate)
        return (try? modelContext.fetchCount(descriptor))
            ?? (try? modelContext.fetch(descriptor).count)
            ?? 0
    }
    
    /// Mark all unseen to-dos as seen. Called when the user views the To-Dos page.
    func markAllAsSeen() {
        let predicate = #Predicate<TodoItem> { todo in
            todo.isDeleted == false && todo.isSeen == false
        }
        let descriptor = FetchDescriptor<TodoItem>(predicate: predicate)
        guard let unseen = try? modelContext.fetch(descriptor), !unseen.isEmpty else { return }
        for todo in unseen {
            todo.isSeen = true
        }
        save()
        print("[TodoRepository] Marked \(unseen.count) to-dos as seen")
    }
    
    /// Fetch to-dos for a specific source (note or email thread).
    func fetchTodos(forSourceId sourceId: String) -> [TodoItem] {
        let predicate = #Predicate<TodoItem> { todo in
            todo.sourceId == sourceId && todo.isDeleted == false
        }
        let descriptor = FetchDescriptor<TodoItem>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }
    
    // MARK: - Update
    
    /// Toggle the completion state of a to-do.
    func toggleComplete(_ todo: TodoItem) {
        todo.isCompleted.toggle()
        todo.completedAt = todo.isCompleted ? Date.now : nil
        save()
        syncService?.pushTodo(todo)
    }
    
    /// Update to-do fields.
    func updateTodo(
        _ todo: TodoItem,
        title: String? = nil,
        details: String? = nil,
        dueDate: Date? = nil,
        priority: TodoItem.Priority? = nil
    ) {
        if let title { todo.title = title }
        if let details { todo.details = details }
        if let dueDate { todo.dueDate = dueDate }
        if let priority { todo.priority = priority }
        save()
        syncService?.pushTodo(todo)
    }
    
    /// Clear the due date from a to-do.
    func clearDueDate(_ todo: TodoItem) {
        todo.dueDate = nil
        save()
        syncService?.pushTodo(todo)
    }
    
    // MARK: - Delete
    
    /// Soft-delete a to-do (marks as deleted, keeps in database).
    func deleteTodo(_ todo: TodoItem) {
        todo.isDeleted = true
        save()
        syncService?.pushTodo(todo)
    }
    
    /// Hard-delete a to-do (removes from database entirely).
    func permanentlyDeleteTodo(_ todo: TodoItem) {
        let todoId = todo.id
        modelContext.delete(todo)
        save()
        syncService?.deleteRemote(table: "todos", id: todoId)
    }
    
    /// Delete all to-dos for a specific source (used when re-enhancing a note).
    func deleteTodosForSource(sourceId: String) {
        let existing = fetchTodos(forSourceId: sourceId)
        for todo in existing {
            todo.isDeleted = true
        }
        save()
        for todo in existing {
            syncService?.pushTodo(todo)
        }
    }
    
    // MARK: - Sender Exclusions
    
    /// Returns the set of excluded sender emails (lowercased).
    func excludedSenders() -> Set<String> {
        let arr = UserDefaults.standard.stringArray(forKey: Constants.Defaults.todoExcludedSenders) ?? []
        return Set(arr.map { $0.lowercased() })
    }
    
    /// Add a sender email to the exclusion list.
    /// Also soft-deletes any existing to-dos from this sender.
    func excludeSender(_ email: String) {
        var arr = UserDefaults.standard.stringArray(forKey: Constants.Defaults.todoExcludedSenders) ?? []
        let normalised = email.lowercased().trimmingCharacters(in: .whitespaces)
        guard !normalised.isEmpty, !arr.map({ $0.lowercased() }).contains(normalised) else { return }
        arr.append(normalised)
        UserDefaults.standard.set(arr, forKey: Constants.Defaults.todoExcludedSenders)
        
        // Also remove existing to-dos from this sender
        let allTodos = fetchAllTodos()
        for todo in allTodos where todo.senderEmail?.lowercased() == normalised {
            todo.isDeleted = true
            syncService?.pushTodo(todo)
        }
        save()
        
        print("[TodoRepository] Excluded sender: \(normalised)")
    }
    
    /// Remove a sender email from the exclusion list.
    func removeExclusion(_ email: String) {
        var arr = UserDefaults.standard.stringArray(forKey: Constants.Defaults.todoExcludedSenders) ?? []
        let normalised = email.lowercased().trimmingCharacters(in: .whitespaces)
        arr.removeAll { $0.lowercased() == normalised }
        UserDefaults.standard.set(arr, forKey: Constants.Defaults.todoExcludedSenders)
        print("[TodoRepository] Removed exclusion: \(normalised)")
    }
    
    /// Check whether a sender email is excluded.
    func isSenderExcluded(_ email: String) -> Bool {
        excludedSenders().contains(email.lowercased().trimmingCharacters(in: .whitespaces))
    }
    
    // MARK: - Category Exclusions
    
    /// Returns the set of excluded email categories.
    func excludedCategories() -> Set<EmailCategory> {
        let arr = UserDefaults.standard.stringArray(forKey: Constants.Defaults.todoExcludedCategories) ?? []
        return Set(arr.compactMap { EmailCategory(rawValue: $0) })
    }
    
    /// Toggle an email category exclusion on or off.
    /// When enabling an exclusion, also soft-deletes existing email-sourced to-dos
    /// that match the category (based on stored sender + subject metadata).
    func toggleCategoryExclusion(_ category: EmailCategory) {
        var arr = UserDefaults.standard.stringArray(forKey: Constants.Defaults.todoExcludedCategories) ?? []
        
        if arr.contains(category.rawValue) {
            // Remove — re-enable this category
            arr.removeAll { $0 == category.rawValue }
            UserDefaults.standard.set(arr, forKey: Constants.Defaults.todoExcludedCategories)
            print("[TodoRepository] Re-enabled category: \(category.label)")
        } else {
            // Add — exclude this category
            arr.append(category.rawValue)
            UserDefaults.standard.set(arr, forKey: Constants.Defaults.todoExcludedCategories)
            
            // Retroactively soft-delete matching email-sourced to-dos
            let allTodos = fetchAllTodos()
            var removedCount = 0
            for todo in allTodos where todo.sourceType == .email {
                let matched = EmailCategory.classifyFromTodoMetadata(
                    senderEmail: todo.senderEmail,
                    sourceTitle: todo.sourceTitle
                )
                if matched.contains(category) {
                    todo.isDeleted = true
                    syncService?.pushTodo(todo)
                    removedCount += 1
                }
            }
            if removedCount > 0 { save() }
            
            print("[TodoRepository] Excluded category: \(category.label) (removed \(removedCount) existing to-dos)")
        }
    }
    
    /// Check whether a specific category is excluded.
    func isCategoryExcluded(_ category: EmailCategory) -> Bool {
        excludedCategories().contains(category)
    }
    
    /// Check whether a Gmail message should be skipped based on category exclusions.
    /// Returns the matched excluded categories (empty if the message should be processed).
    func matchesExcludedCategory(
        subject: String,
        fromEmail: String,
        labelIds: [String] = [],
        attachmentFilenames: [String] = [],
        attachmentMimeTypes: [String] = []
    ) -> Set<EmailCategory> {
        let excluded = excludedCategories()
        guard !excluded.isEmpty else { return [] }
        
        let detected = EmailCategory.classify(
            subject: subject,
            fromEmail: fromEmail,
            labelIds: labelIds,
            attachmentFilenames: attachmentFilenames,
            attachmentMimeTypes: attachmentMimeTypes
        )
        
        return detected.intersection(excluded)
    }
    
    /// Total number of active exclusion rules (senders + categories).
    func totalExclusionCount() -> Int {
        excludedSenders().count + excludedCategories().count
    }
    
    // MARK: - Badge Counts
    
    /// Re-fetch pending and unseen counts from SwiftData and update the stored properties.
    /// Called automatically after every `save()` so the sidebar badges stay in sync.
    func refreshBadgeCounts() {
        livePendingCount = pendingCount()
        liveUnseenCount = unseenCount()
    }
    
    // MARK: - Private
    
    private func save() {
        do {
            try modelContext.save()
        } catch {
            print("[TodoRepository] Save failed: \(error.localizedDescription)")
        }
        refreshBadgeCounts()
    }
}
