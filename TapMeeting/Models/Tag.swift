import Foundation
import SwiftData

/// A tag that can be applied to any note (meeting or standalone).
/// Supports many-to-many relationship with Note via SwiftData.
@Model
final class Tag {
    var id: UUID
    var name: String
    var colorHex: String?
    var createdAt: Date
    
    @Relationship(deleteRule: .nullify, inverse: \Note.tags)
    var notes: [Note]
    
    init(
        id: UUID = UUID(),
        name: String,
        colorHex: String? = nil,
        createdAt: Date = .now,
        notes: [Note] = []
    ) {
        self.id = id
        self.name = name
        self.colorHex = colorHex
        self.createdAt = createdAt
        self.notes = notes
    }
}
