import SwiftUI

/// Sidebar section showing all tags as clickable filter items with note counts.
/// Clicking a tag navigates to a filtered list of notes with that tag.
struct TagFilterView: View {
    
    let tags: [Tag]
    let selectedTagId: UUID?
    let onSelectTag: (UUID) -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(tags, id: \.id) { tag in
                TagFilterRow(
                    tag: tag,
                    isSelected: selectedTagId == tag.id,
                    onSelect: { onSelectTag(tag.id) }
                )
            }
        }
    }
}

// MARK: - Tag Filter Row

private struct TagFilterRow: View {
    let tag: Tag
    let isSelected: Bool
    let onSelect: () -> Void
    
    @State private var isHovered = false
    
    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 8) {
                Circle()
                    .fill(Theme.tagColor(hex: tag.colorHex))
                    .frame(width: 8, height: 8)
                
                Text(tag.name)
                    .font(.system(size: 13, weight: isSelected ? .medium : .regular))
                    .foregroundColor(isSelected ? Theme.textPrimary : Theme.textSecondary)
                    .lineLimit(1)
                
                Spacer()
                
                Text("\(tag.notes.count)")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textQuaternary)
            }
            .padding(.horizontal, 12)
            .frame(height: 30)
            .background(isSelected ? Theme.sidebarSelection : (isHovered ? Theme.sidebarSelection.opacity(0.5) : .clear))
            .cornerRadius(6)
            .padding(.horizontal, 10)
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
    }
}
