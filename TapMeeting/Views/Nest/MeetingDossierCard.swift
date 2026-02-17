import SwiftUI
import AppKit

/// Contextual "dossier" card for upcoming meetings — mirrors the Home page calendar
/// card design with date badge, company logo, join button, and time. Expands to reveal
/// prior meeting context, email threads, open items, and AI preparation brief.
struct MeetingDossierCard: View {
    
    let dossier: MeetingDossier
    /// AI-generated preparation brief (nil = not yet requested).
    let aiBrief: String?
    let isAIBriefStreaming: Bool
    let onStartRecording: (String, String, [String]) -> Void
    let onJoinMeeting: ((URL) -> Void)?
    let onRequestAIBrief: (() -> Void)?
    
    @State private var isExpanded: Bool = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header — always visible, matches Home card style
            headerRow
            
            // Expanded content — animates open/closed
            if isExpanded {
                expandedContent
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .clipped()
        .background(Theme.cardBackground)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Theme.divider.opacity(0.5), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.03), radius: 3, y: 1)
        .onAppear {
            if dossier.minutesAway < 30 { isExpanded = true }
        }
    }
    
    // MARK: - Header (Home-page style)
    
    private var headerRow: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                isExpanded.toggle()
            }
        } label: {
            HStack(spacing: 12) {
                // Date badge — olive rounded square
                VStack(spacing: 0) {
                    Text(monthString(dossier.startDate))
                        .font(.system(size: 8, weight: .bold))
                        .textCase(.uppercase)
                    Text(dayString(dossier.startDate))
                        .font(.system(size: 14, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(width: 32, height: 32)
                .background(Theme.olive)
                .cornerRadius(6)
                
                // Title + time
                VStack(alignment: .leading, spacing: 2) {
                    Text(dossier.title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Theme.textPrimary)
                        .lineLimit(1)
                    
                    HStack(spacing: 4) {
                        Text(dossier.formattedTime)
                            .font(Theme.captionFont(11))
                            .foregroundColor(Theme.textTertiary)
                        
                        // Context badges
                        if dossier.priorMeetingCount > 0 {
                            Text("·")
                                .font(Theme.captionFont(11))
                                .foregroundColor(Theme.textQuaternary)
                            Text("\(dossier.priorMeetingCount) prior")
                                .font(Theme.captionFont(10))
                                .foregroundColor(Theme.textQuaternary)
                        }
                        if dossier.openItemCount > 0 {
                            Text("·")
                                .font(Theme.captionFont(11))
                                .foregroundColor(Theme.textQuaternary)
                            Text("\(dossier.openItemCount) open")
                                .font(Theme.captionFont(10))
                                .foregroundColor(Theme.textQuaternary)
                        }
                    }
                }
                
                Spacer()
                
                // "Now" badge
                if dossier.isHappeningNow {
                    Text("Now")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(Theme.recording)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Theme.recording.opacity(0.08))
                        .cornerRadius(4)
                } else {
                    // Time-until badge
                    Text(timeUntilLabel)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(dossier.minutesAway < 5 ? Theme.recording : Theme.olive)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background((dossier.minutesAway < 5 ? Theme.recording : Theme.olive).opacity(0.08))
                        .cornerRadius(4)
                }
                
                // Join button
                if let meetingURL = dossier.meetingURL {
                    Button {
                        onJoinMeeting?(meetingURL)
                    } label: {
                        HStack(spacing: 3) {
                            Image(systemName: "video.fill")
                                .font(.system(size: 9))
                            Text("Join")
                                .font(.system(size: 10, weight: .medium))
                        }
                        .foregroundColor(Theme.olive)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Theme.olive.opacity(0.12))
                        .cornerRadius(4)
                    }
                    .buttonStyle(.plain)
                }
                
                // Company logo
                DossierLogoView(logoURL: dossier.organizerLogoURL, size: 20)
                
                // Chevron
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Theme.textQuaternary)
                    .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    .animation(.easeInOut(duration: 0.2), value: isExpanded)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
    
    // MARK: - Expanded content
    
    private var expandedContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            Rectangle()
                .fill(Theme.divider)
                .frame(height: 1)
                .padding(.horizontal, 16)
            
            // AI Brief section
            aiBriefSection
            
            // Attendees
            if !dossier.attendeeNames.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("ATTENDEES")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(Theme.textTertiary)
                        .tracking(0.5)
                    
                    Text(dossier.attendeeNames.joined(separator: ", "))
                        .font(Theme.captionFont(12))
                        .foregroundColor(Theme.textSecondary)
                }
                .padding(.horizontal, 16)
            }
            
            // Meeting History
            if dossier.priorMeetingCount > 0 {
                VStack(alignment: .leading, spacing: 6) {
                    Text("MEETING HISTORY")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(Theme.textTertiary)
                        .tracking(0.5)
                    
                    Text("\(dossier.priorMeetingCount) meeting\(dossier.priorMeetingCount == 1 ? "" : "s") with this group")
                        .font(Theme.bodyFont(13))
                        .foregroundColor(Theme.textPrimary)
                    
                    if let title = dossier.lastMeetingTitle, let date = dossier.lastMeetingDate {
                        Text("Last: \"\(title)\" (\(date.formatted(date: .abbreviated, time: .omitted)))")
                            .font(Theme.captionFont(12))
                            .foregroundColor(Theme.textSecondary)
                    }
                    
                    if let preview = dossier.lastMeetingPreview {
                        Text(preview)
                            .font(Theme.captionFont(12))
                            .foregroundColor(Theme.textTertiary)
                            .lineLimit(3)
                            .padding(.leading, 8)
                    }
                }
                .padding(.horizontal, 16)
            }
            
            // Email threads since last meeting
            if !dossier.emailSubjects.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("SINCE LAST MEETING")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(Theme.textTertiary)
                        .tracking(0.5)
                    
                    ForEach(dossier.emailSubjects.indices, id: \.self) { i in
                        let item = dossier.emailSubjects[i]
                        HStack(spacing: 6) {
                            Image(systemName: "envelope")
                                .font(.system(size: 10))
                                .foregroundColor(Theme.textTertiary)
                            Text("\(item.sender): \"\(item.subject)\"")
                                .font(Theme.captionFont(12))
                                .foregroundColor(Theme.textSecondary)
                                .lineLimit(1)
                            
                            if item.isUnread {
                                Circle()
                                    .fill(Theme.olive)
                                    .frame(width: 6, height: 6)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            
            // Open items
            if !dossier.openItems.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("OPEN ITEMS")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(Theme.textTertiary)
                        .tracking(0.5)
                    
                    ForEach(dossier.openItems.indices, id: \.self) { i in
                        let item = dossier.openItems[i]
                        HStack(spacing: 6) {
                            if item.isOverdue {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 9))
                                    .foregroundColor(Theme.recording)
                            } else {
                                Circle()
                                    .stroke(Theme.olive, lineWidth: 1)
                                    .frame(width: 10, height: 10)
                            }
                            Text(item.title)
                                .font(Theme.captionFont(12))
                                .foregroundColor(item.isOverdue ? Theme.recording : Theme.textPrimary)
                                .lineLimit(1)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            
            // Action buttons
            HStack(spacing: 12) {
                Button {
                    onStartRecording(dossier.title, dossier.calendarEventId, dossier.attendees)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "waveform")
                            .font(.system(size: 10))
                        Text("Record")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Theme.olive)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Theme.olive.opacity(0.1))
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
    }
    
    // MARK: - AI Brief
    
    @ViewBuilder
    private var aiBriefSection: some View {
        if let brief = aiBrief, !brief.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 5) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 10))
                        .foregroundColor(Theme.olive)
                    Text("AI Preparation Brief")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(Theme.textTertiary)
                        .tracking(0.5)
                }
                
                Text(brief)
                    .font(Theme.bodyFont(13))
                    .foregroundColor(Theme.textPrimary)
                    .lineSpacing(3)
                    .textSelection(.enabled)
                
                if isAIBriefStreaming {
                    HStack(spacing: 4) {
                        ProgressView()
                            .controlSize(.mini)
                        Text("Preparing brief…")
                            .font(Theme.captionFont(11))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
            }
            .padding(12)
            .background(Theme.olive.opacity(0.03))
            .cornerRadius(8)
            .padding(.horizontal, 16)
        } else if isAIBriefStreaming {
            HStack(spacing: 6) {
                ProgressView()
                    .controlSize(.mini)
                Text("Generating AI brief…")
                    .font(Theme.captionFont(12))
                    .foregroundColor(Theme.textTertiary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.olive.opacity(0.03))
            .cornerRadius(8)
            .padding(.horizontal, 16)
        } else if dossier.priorMeetingCount > 0 || dossier.emailThreadCount > 0 {
            Button {
                onRequestAIBrief?()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 11))
                    Text("Prepare me for this meeting")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(Theme.olive)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .background(Theme.olive.opacity(0.06))
                .cornerRadius(8)
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 16)
        }
    }
    
    // MARK: - Helpers
    
    private var timeUntilLabel: String {
        if dossier.minutesAway < 60 {
            return "in \(dossier.minutesAway)m"
        } else {
            let hours = dossier.minutesAway / 60
            let mins = dossier.minutesAway % 60
            return mins > 0 ? "in \(hours)h \(mins)m" : "in \(hours)h"
        }
    }
    
    private func monthString(_ date: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "MMM"; return f.string(from: date)
    }
    
    private func dayString(_ date: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "d"; return f.string(from: date)
    }
}

// MARK: - Dossier Logo View

/// Fetches and displays a company logo from a favicon URL.
/// Falls back to a calendar icon if unavailable.
private struct DossierLogoView: View {
    let logoURL: URL?
    var size: CGFloat = 20
    
    @State private var logoImage: NSImage?
    @State private var didLoad = false
    
    var body: some View {
        Group {
            if let image = logoImage {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: size, height: size)
                    .clipShape(RoundedRectangle(cornerRadius: size * 0.2))
            } else {
                Image("GoogleCalendarIcon")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: size, height: size)
            }
        }
        .task(id: logoURL) {
            guard !didLoad, let url = logoURL else { return }
            didLoad = true
            await loadFavicon(from: url)
        }
    }
    
    private func loadFavicon(from url: URL) async {
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }
            guard data.count > 1000 else { return }
            guard let nsImage = NSImage(data: data), nsImage.size.width > 1 else { return }
            await MainActor.run { logoImage = nsImage }
        } catch { }
    }
}
