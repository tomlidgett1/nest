import Foundation
import SwiftData

/// Configures the SwiftData model container for the application.
enum DataController {
    
    /// The shared SwiftData model container.
    static let shared: ModelContainer = {
        let schema = Schema([
            Note.self,
            Utterance.self,
            Folder.self,
            Tag.self,
            StyleProfile.self,
            ContactRule.self,
            TodoItem.self
        ])
        
        let configuration = ModelConfiguration(
            "TapMeetingStore",
            schema: schema,
            isStoredInMemoryOnly: false,
            allowsSave: true
        )
        
        do {
            return try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            fatalError("Failed to create SwiftData ModelContainer: \(error.localizedDescription)")
        }
    }()
}
