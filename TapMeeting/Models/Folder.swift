import Foundation
import SwiftData

/// A folder for organising meeting notes.
@Model
final class Folder {
    var id: UUID
    var name: String
    var createdAt: Date
    var sortOrder: Int
    
    @Relationship(deleteRule: .nullify, inverse: \Note.folder)
    var notes: [Note]
    
    init(
        id: UUID = UUID(),
        name: String,
        createdAt: Date = .now,
        sortOrder: Int = 0,
        notes: [Note] = []
    ) {
        self.id = id
        self.name = name
        self.createdAt = createdAt
        self.sortOrder = sortOrder
        self.notes = notes
    }
}
