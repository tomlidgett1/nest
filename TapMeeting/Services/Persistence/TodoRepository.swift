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
    
    init(modelContext: ModelContext) {
        self.modelContext = modelContext
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
            sourceSnippet: sourceSnippet
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
    
    // MARK: - Private
    
    private func save() {
        do {
            try modelContext.save()
        } catch {
            print("[TodoRepository] Save failed: \(error.localizedDescription)")
        }
    }
}
