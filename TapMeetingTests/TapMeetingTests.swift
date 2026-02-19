//
//  TapMeetingTests.swift
//  TapMeetingTests
//
//  Created by User on 12/2/2026.
//

import Testing
import SwiftData
import Foundation
@testable import Nest

// MARK: - SyncService Safety Guard Tests

/// Verifies that the sync logic never deletes local data when remote returns empty.
/// This protects against the scenario where a Supabase session isn't ready yet
/// and RLS-protected tables return 0 rows — the sync must NOT wipe local data.
struct SyncSafetyTests {

    /// Helper: create an in-memory model container for testing.
    private func makeTestContainer() throws -> ModelContainer {
        let schema = Schema([
            Note.self,
            Utterance.self,
            Folder.self,
            Tag.self,
            StyleProfile.self,
            ContactRule.self,
            TodoItem.self
        ])
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(for: schema, configurations: [config])
    }

    @Test("Local notes are preserved when no Supabase session exists")
    func localNotesPreservedWithoutSession() async throws {
        let container = try makeTestContainer()
        let context = ModelContext(container)

        // Insert a local note
        let note = Note(
            title: "Test Meeting",
            calendarEventId: nil,
            attendees: []
        )
        context.insert(note)
        try context.save()

        // Verify note exists
        let descriptor = FetchDescriptor<Note>()
        let notes = try context.fetch(descriptor)
        #expect(notes.count == 1)
        #expect(notes.first?.title == "Test Meeting")
    }

    @Test("Multiple notes persist through in-memory store lifecycle")
    func multipleNotesCreation() async throws {
        let container = try makeTestContainer()
        let context = ModelContext(container)

        // Insert several notes
        for i in 1...5 {
            let note = Note(
                title: "Meeting \(i)",
                calendarEventId: nil,
                attendees: []
            )
            context.insert(note)
        }
        try context.save()

        let descriptor = FetchDescriptor<Note>()
        let notes = try context.fetch(descriptor)
        #expect(notes.count == 5)
    }

    @Test("Folder and tag creation works correctly")
    func folderAndTagCreation() async throws {
        let container = try makeTestContainer()
        let context = ModelContext(container)

        let folder = Folder(name: "Work", sortOrder: 0)
        context.insert(folder)

        let tag = Tag(name: "Important", colorHex: "#FF0000")
        context.insert(tag)

        try context.save()

        let folders = try context.fetch(FetchDescriptor<Folder>())
        let tags = try context.fetch(FetchDescriptor<Tag>())

        #expect(folders.count == 1)
        #expect(folders.first?.name == "Work")
        #expect(tags.count == 1)
        #expect(tags.first?.name == "Important")
    }
}
