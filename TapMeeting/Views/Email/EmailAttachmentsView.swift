import SwiftUI

/// Browsable list of all email attachments across loaded mailboxes.
/// Shown in the right panel of EmailView when the user toggles the attachments browser.
struct EmailAttachmentsView: View {
    
    @Environment(AppState.self) private var appState
    @State private var searchText: String = ""
    @FocusState private var isSearchFocused: Bool
    
    /// Callback to navigate to a specific thread (closes the browser).
    var onNavigateToThread: ((GmailThread) -> Void)?
    
    private var gmail: GmailService { appState.gmailService }
    
    // MARK: - Filtered & Grouped Data
    
    private var filteredAttachments: [AttachmentItem] {
        let all = gmail.allAttachments
        guard !searchText.isEmpty else { return all }
        let query = searchText.lowercased()
        return all.filter {
            $0.attachment.filename.lowercased().contains(query) ||
            $0.senderName.lowercased().contains(query) ||
            $0.senderEmail.lowercased().contains(query) ||
            $0.subject.lowercased().contains(query)
        }
    }
    
    private struct AttachmentGroup: Identifiable {
        let label: String
        let items: [AttachmentItem]
        var id: String { label }
    }
    
    private var groupedAttachments: [AttachmentGroup] {
        let calendar = Calendar.current
        let now = Date.now
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "d MMMM yyyy"
        
        var todayItems: [AttachmentItem] = []
        var yesterdayItems: [AttachmentItem] = []
        var olderGroups: [String: [AttachmentItem]] = [:]
        var olderOrder: [String] = []
        
        for item in filteredAttachments {
            if calendar.isDateInToday(item.date) {
                todayItems.append(item)
            } else if calendar.isDateInYesterday(item.date) {
                yesterdayItems.append(item)
            } else {
                let daysAgo = calendar.dateComponents([.day], from: item.date, to: now).day ?? 99
                let label: String
                if daysAgo < 7 {
                    let weekdayFormatter = DateFormatter()
                    weekdayFormatter.dateFormat = "EEEE"
                    label = weekdayFormatter.string(from: item.date)
                } else {
                    label = dateFormatter.string(from: item.date)
                }
                if olderGroups[label] == nil {
                    olderOrder.append(label)
                }
                olderGroups[label, default: []].append(item)
            }
        }
        
        var result: [AttachmentGroup] = []
        if !todayItems.isEmpty { result.append(AttachmentGroup(label: "Today", items: todayItems)) }
        if !yesterdayItems.isEmpty { result.append(AttachmentGroup(label: "Yesterday", items: yesterdayItems)) }
        for label in olderOrder {
            if let items = olderGroups[label] {
                result.append(AttachmentGroup(label: label, items: items))
            }
        }
        return result
    }
    
    // MARK: - Body
    
    var body: some View {
        VStack(spacing: 0) {
            header
            
            Rectangle()
                .fill(Theme.divider.opacity(0.5))
                .frame(height: 1)
                .padding(.horizontal, 12)
            
            if filteredAttachments.isEmpty {
                emptyState
            } else {
                attachmentsList
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    // MARK: - Header
    
    private var header: some View {
        HStack(spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "paperclip")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.textPrimary)
                
                Text("Attachments")
                    .font(.system(size: 14, weight: .semibold, design: .serif))
                    .foregroundColor(Theme.textPrimary)
                
                Text("\(gmail.allAttachments.count)")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Theme.textTertiary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Theme.sidebarBackground)
                    .cornerRadius(4)
            }
            
            Spacer()
            
            // Search field
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Theme.textTertiary)
                
                TextField("Search attachments…", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
                    .focused($isSearchFocused)
                
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.textTertiary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .frame(maxWidth: 240)
            .background(Theme.sidebarBackground)
            .cornerRadius(6)
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(isSearchFocused ? Theme.olive.opacity(0.4) : Color.clear, lineWidth: 1)
            )
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
    
    // MARK: - List
    
    private var attachmentsList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(Array(groupedAttachments.enumerated()), id: \.element.id) { groupIndex, group in
                    // Date group header
                    HStack {
                        Text(group.label)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, groupIndex == 0 ? 6 : 16)
                    .padding(.bottom, 6)
                    
                    ForEach(group.items) { item in
                        attachmentRow(item)
                    }
                }
            }
            .padding(.bottom, 20)
        }
    }
    
    // MARK: - Attachment Row
    
    private func attachmentRow(_ item: AttachmentItem) -> some View {
        HStack(spacing: 0) {
            // File type icon
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(iconBackground(for: item.attachment.mimeType))
                    .frame(width: 40, height: 40)
                
                Image(systemName: item.attachment.iconName)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(iconForeground(for: item.attachment.mimeType))
            }
            .padding(.trailing, 12)
            
            // File details
            VStack(alignment: .leading, spacing: 3) {
                Text(item.attachment.filename)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                
                HStack(spacing: 4) {
                    Text(item.senderName.isEmpty ? item.senderEmail : item.senderName)
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textSecondary)
                        .lineLimit(1)
                    
                    Text("·")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textQuaternary)
                    
                    Text(item.subject)
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textTertiary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
            
            Spacer(minLength: 12)
            
            // Size + date on the right
            VStack(alignment: .trailing, spacing: 3) {
                Text(item.attachment.formattedSize)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Theme.textSecondary)
                
                Text(shortDate(item.date))
                    .font(.system(size: 10))
                    .foregroundColor(Theme.textTertiary)
            }
            .padding(.trailing, 8)
            
            // Actions
            Menu {
                Button {
                    Task { await gmail.openAttachment(item.attachment) }
                } label: {
                    Label("Open", systemImage: "eye")
                }
                
                Button {
                    Task { await gmail.saveAttachmentToFile(item.attachment) }
                } label: {
                    Label("Save As…", systemImage: "arrow.down.to.line")
                }
                
                Divider()
                
                Button {
                    navigateToEmail(item)
                } label: {
                    Label("View Email", systemImage: "envelope")
                }
            } label: {
                Image(systemName: "arrow.down.circle")
                    .font(.system(size: 15))
                    .foregroundColor(Theme.textQuaternary)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.white)
        .contentShape(Rectangle())
        .overlay(
            Rectangle()
                .fill(Theme.divider.opacity(0.3))
                .frame(height: 1),
            alignment: .bottom
        )
    }
    
    // MARK: - Empty State
    
    private var emptyState: some View {
        VStack(spacing: 10) {
            Spacer()
            
            Image(systemName: "paperclip")
                .font(.system(size: 28))
                .foregroundColor(Theme.textQuaternary)
            
            if searchText.isEmpty {
                Text("No attachments yet")
                    .font(Theme.headingFont(15))
                    .foregroundColor(Theme.textPrimary)
                
                Text("Attachments from your emails will appear here.")
                    .font(Theme.captionFont(12))
                    .foregroundColor(Theme.textTertiary)
            } else {
                Text("No results")
                    .font(Theme.headingFont(15))
                    .foregroundColor(Theme.textPrimary)
                
                Text("No attachments match \"\(searchText)\".")
                    .font(Theme.captionFont(12))
                    .foregroundColor(Theme.textTertiary)
            }
            
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    // MARK: - Helpers
    
    private func navigateToEmail(_ item: AttachmentItem) {
        let allThreads = gmail.inboxThreads + gmail.sentThreads + gmail.draftThreads + gmail.archivedThreads + gmail.trashThreads
        if let thread = allThreads.first(where: { $0.id == item.threadId }) {
            onNavigateToThread?(thread)
        }
    }
    
    private func shortDate(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            let formatter = DateFormatter()
            formatter.dateFormat = "h:mm a"
            return formatter.string(from: date)
        } else if calendar.isDateInYesterday(date) {
            return "Yesterday"
        } else {
            let formatter = DateFormatter()
            formatter.dateFormat = "d MMM"
            return formatter.string(from: date)
        }
    }
    
    private func iconBackground(for mimeType: String) -> Color {
        let lower = mimeType.lowercased()
        if lower.hasPrefix("image/") { return Color(red: 0.93, green: 0.89, blue: 0.95) }
        if lower.contains("pdf") { return Color(red: 0.95, green: 0.90, blue: 0.88) }
        if lower.contains("spreadsheet") || lower.contains("excel") || lower.contains("csv") { return Color(red: 0.88, green: 0.94, blue: 0.88) }
        if lower.contains("presentation") || lower.contains("powerpoint") { return Color(red: 0.95, green: 0.93, blue: 0.86) }
        if lower.contains("word") || lower.contains("document") || lower.hasPrefix("text/") { return Color(red: 0.88, green: 0.92, blue: 0.97) }
        if lower.contains("zip") || lower.contains("compressed") || lower.contains("archive") { return Color(red: 0.93, green: 0.93, blue: 0.90) }
        return Theme.sidebarBackground
    }
    
    private func iconForeground(for mimeType: String) -> Color {
        let lower = mimeType.lowercased()
        if lower.hasPrefix("image/") { return Color(red: 0.58, green: 0.40, blue: 0.68) }
        if lower.contains("pdf") { return Color(red: 0.75, green: 0.30, blue: 0.25) }
        if lower.contains("spreadsheet") || lower.contains("excel") || lower.contains("csv") { return Color(red: 0.25, green: 0.55, blue: 0.30) }
        if lower.contains("presentation") || lower.contains("powerpoint") { return Color(red: 0.72, green: 0.58, blue: 0.20) }
        if lower.contains("word") || lower.contains("document") || lower.hasPrefix("text/") { return Color(red: 0.25, green: 0.45, blue: 0.70) }
        if lower.contains("zip") || lower.contains("compressed") || lower.contains("archive") { return Color(red: 0.50, green: 0.50, blue: 0.45) }
        return Theme.textSecondary
    }
}
