import SwiftUI

/// A single note row — used in sidebar note list.
struct NoteListItemView: View {
    
    let note: Note
    let isSelected: Bool
    
    init(note: Note, isSelected: Bool = false) {
        self.note = note
        self.isSelected = isSelected
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(note.title)
                .font(.system(size: 13, weight: isSelected ? .semibold : .regular))
                .foregroundColor(Theme.textPrimary)
                .lineLimit(1)
            
            HStack(spacing: 4) {
                Text(note.createdAt.relativeDescription)
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textTertiary)
                
                if let duration = note.duration {
                    Text("·")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textQuaternary)
                    Text(duration)
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textTertiary)
                }
            }
            
            if !note.rawNotes.isEmpty {
                Text(note.rawNotes)
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textSecondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 4)
    }
}
