import SwiftUI

/// Horizontal scrollable tag pills below the note title.
/// Shows confirmed tags (with × remove), pending AI suggestions (sparkle indicator),
/// and a "+" button that opens an add popover with autocomplete.
struct TagStripView: View {
    
    let note: Note
    @Binding var pendingTags: [String]
    
    @Environment(AppState.self) private var appState
    @State private var showAddPopover = false
    @State private var newTagName = ""
    
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                // Confirmed tags
                ForEach(note.tags, id: \.id) { tag in
                    TagPill(
                        name: tag.name,
                        colorHex: tag.colorHex,
                        isPending: false,
                        onRemove: {
                            appState.noteRepository.removeTag(tag, from: note)
                        }
                    )
                }
                
                // Pending AI suggestions
                ForEach(pendingTags, id: \.self) { tagName in
                    TagPill(
                        name: tagName,
                        colorHex: nil,
                        isPending: true,
                        onConfirm: {
                            let allTags = appState.noteRepository.fetchAllTags()
                            let colorIndex = allTags.count
                            let hex = Theme.tagColors[colorIndex % Theme.tagColors.count].hex
                            let tag = appState.noteRepository.findOrCreateTag(name: tagName, colorHex: hex)
                            appState.noteRepository.addTag(tag, to: note)
                            pendingTags.removeAll { $0 == tagName }
                        },
                        onDismiss: {
                            pendingTags.removeAll { $0 == tagName }
                        }
                    )
                }
                
                // Add tag button
                Button {
                    showAddPopover = true
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "plus")
                            .font(.system(size: 10, weight: .medium))
                        Text("Tag")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(Theme.textTertiary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Theme.sidebarSelection)
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showAddPopover) {
                    TagAddPopover(
                        note: note,
                        newTagName: $newTagName,
                        isPresented: $showAddPopover
                    )
                }
            }
        }
    }
}

// MARK: - Tag Pill

private struct TagPill: View {
    let name: String
    let colorHex: String?
    let isPending: Bool
    var onRemove: (() -> Void)? = nil
    var onConfirm: (() -> Void)? = nil
    var onDismiss: (() -> Void)? = nil
    
    @State private var isHovered = false
    
    private var pillColor: Color {
        Theme.tagColor(hex: colorHex)
    }
    
    var body: some View {
        HStack(spacing: 4) {
            if isPending {
                Image(systemName: "sparkle")
                    .font(.system(size: 8))
                    .foregroundColor(Theme.olive)
            }
            
            Text(name)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(isPending ? Theme.textSecondary : pillColor)
            
            if isPending {
                // Confirm button
                Button {
                    onConfirm?()
                } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(.green)
                }
                .buttonStyle(.plain)
                
                // Dismiss button
                Button {
                    onDismiss?()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(Theme.textTertiary)
                }
                .buttonStyle(.plain)
            } else if isHovered {
                Button {
                    onRemove?()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(Theme.textTertiary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            isPending
                ? Theme.oliveFaint
                : pillColor.opacity(0.12)
        )
        .cornerRadius(6)
        .overlay(
            isPending
                ? RoundedRectangle(cornerRadius: 6)
                    .strokeBorder(Theme.olive.opacity(0.3), style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                : nil
        )
        .onHover { isHovered = $0 }
    }
}

// MARK: - Tag Add Popover

private struct TagAddPopover: View {
    let note: Note
    @Binding var newTagName: String
    @Binding var isPresented: Bool
    
    @Environment(AppState.self) private var appState
    
    private var existingTags: [Tag] {
        appState.noteRepository.fetchAllTags()
    }
    
    private var filteredTags: [Tag] {
        if newTagName.isEmpty { return existingTags }
        return existingTags.filter {
            $0.name.localizedCaseInsensitiveContains(newTagName)
        }
    }
    
    /// Tags not already on this note.
    private var availableTags: [Tag] {
        let noteTagIds = Set(note.tags.map(\.id))
        return filteredTags.filter { !noteTagIds.contains($0.id) }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Add or search tags…", text: $newTagName)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .padding(8)
                .background(Theme.sidebarSelection)
                .cornerRadius(6)
                .onSubmit {
                    addTag(name: newTagName)
                }
            
            if !availableTags.isEmpty {
                ScrollView {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(availableTags, id: \.id) { tag in
                            Button {
                                appState.noteRepository.addTag(tag, to: note)
                                newTagName = ""
                                isPresented = false
                            } label: {
                                HStack(spacing: 6) {
                                    Circle()
                                        .fill(Theme.tagColor(hex: tag.colorHex))
                                        .frame(width: 8, height: 8)
                                    Text(tag.name)
                                        .font(.system(size: 13))
                                        .foregroundColor(Theme.textPrimary)
                                    Spacer()
                                    Text("\(tag.notes.count)")
                                        .font(.system(size: 11))
                                        .foregroundColor(Theme.textQuaternary)
                                }
                                .padding(.horizontal, 8)
                                .padding(.vertical, 6)
                                .background(Color.clear)
                                .cornerRadius(4)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(maxHeight: 160)
            }
            
            if !newTagName.isEmpty && !existingTags.contains(where: { $0.name.lowercased() == newTagName.lowercased() }) {
                Button {
                    addTag(name: newTagName)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.olive)
                        Text("Create \"\(newTagName)\"")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Theme.textSecondary)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .frame(width: 220)
    }
    
    private func addTag(name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        let allTags = appState.noteRepository.fetchAllTags()
        let colorIndex = allTags.count
        let hex = Theme.tagColors[colorIndex % Theme.tagColors.count].hex
        let tag = appState.noteRepository.findOrCreateTag(name: trimmed, colorHex: hex)
        appState.noteRepository.addTag(tag, to: note)
        newTagName = ""
        isPresented = false
    }
}
