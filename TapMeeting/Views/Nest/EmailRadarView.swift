import SwiftUI

/// Curated "Needs Your Attention" email section — scored and ranked by
/// genuine actionability, enriched with AI triage classification.
struct EmailRadarView: View {
    
    let emails: [ActionableEmail]
    /// AI triage results (keyed by thread ID).
    let aiTriageScores: [String: EmailTriageResult]
    let isTriaging: Bool
    /// Navigate to the Email tab with a specific thread selected.
    let onSelectThread: (String) -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack(spacing: 6) {
                Text(headerText)
                    .font(Theme.headingFont())
                    .foregroundColor(Theme.textSecondary)
                
                if isTriaging {
                    HStack(spacing: 4) {
                        ProgressView()
                            .controlSize(.mini)
                        Text("AI analysing…")
                            .font(Theme.captionFont(10))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
            }
            
            VStack(spacing: 0) {
                ForEach(Array(emails.enumerated()), id: \.element.id) { index, email in
                    VStack(alignment: .leading, spacing: 0) {
                        emailRow(email: email)
                        
                        if index < emails.count - 1 {
                            Rectangle()
                                .fill(Theme.divider)
                                .frame(height: 1)
                                .padding(.leading, 56)
                        }
                    }
                }
            }
            .background(Theme.cardBackground)
            .cornerRadius(12)
            .shadow(color: .black.opacity(0.03), radius: 3, y: 1)
        }
    }
    
    private var headerText: String {
        let count = emails.count
        if count == 1 { return "1 email needs you" }
        return "\(count) emails need you"
    }
    
    private func emailRow(email: ActionableEmail) -> some View {
        let aiTriage = aiTriageScores[email.threadId]
        
        return Button { onSelectThread(email.threadId) } label: {
            HStack(alignment: .top, spacing: 12) {
                // Avatar
                ZStack {
                    Circle()
                        .fill(Theme.olive.opacity(0.12))
                        .frame(width: 32, height: 32)
                    
                    Text(email.senderInitials)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Theme.olive)
                }
                
                VStack(alignment: .leading, spacing: 3) {
                    // Sender + time + direct badge
                    HStack(spacing: 6) {
                        Text(email.senderName)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.textPrimary)
                            .lineLimit(1)
                        
                        if email.isOneToOne {
                            Text("direct")
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundColor(Theme.olive)
                                .padding(.horizontal, 4)
                                .padding(.vertical, 1)
                                .background(Theme.oliveFaint)
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                        }
                        
                        Spacer()
                        
                        Text(relativeTime(email.date))
                            .font(Theme.captionFont(11))
                            .foregroundColor(Theme.textTertiary)
                    }
                    
                    // Subject
                    Text(email.subject)
                        .font(Theme.bodyFont(13))
                        .foregroundColor(Theme.textSecondary)
                        .lineLimit(1)
                    
                    // Snippet
                    if !email.snippet.isEmpty {
                        Text(email.snippet)
                            .font(Theme.captionFont(12))
                            .foregroundColor(Theme.textTertiary)
                            .lineLimit(1)
                            .italic()
                    }
                    
                    // Signal badges row
                    HStack(spacing: 8) {
                        // AI reason (preferred) or heuristic "why" tag
                        if let ai = aiTriage, ai.score >= 50 {
                            HStack(spacing: 3) {
                                Image(systemName: "sparkles")
                                    .font(.system(size: 8))
                                    .foregroundColor(Theme.olive)
                                Text(ai.reason)
                                    .font(Theme.captionFont(11))
                                    .foregroundColor(Theme.olive)
                                    .lineLimit(1)
                            }
                        } else if let whyTag = email.whyTag {
                            HStack(spacing: 3) {
                                Image(systemName: whyIconName(for: email))
                                    .font(.system(size: 8))
                                    .foregroundColor(email.hasDeadline ? Theme.recording : Theme.olive)
                                Text(whyTag)
                                    .font(Theme.captionFont(11))
                                    .foregroundColor(email.hasDeadline ? Theme.recording : Theme.olive)
                            }
                        }
                        
                        // Todo linkage
                        if email.hasTodos {
                            HStack(spacing: 3) {
                                Image(systemName: "checklist")
                                    .font(.system(size: 8))
                                    .foregroundColor(Theme.olive)
                                Text("Action items extracted")
                                    .font(Theme.captionFont(11))
                                    .foregroundColor(Theme.olive)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
    
    /// Pick an icon for the "why" tag based on the email's signal flags.
    private func whyIconName(for email: ActionableEmail) -> String {
        if email.hasDeadline { return "clock.badge.exclamationmark" }
        if email.meetingLink != nil { return "bolt.fill" }
        if email.hasQuestion { return "questionmark.bubble" }
        if email.isReplyBack { return "arrowshape.turn.up.left.fill" }
        if email.hasTodos { return "checklist" }
        if email.isOneToOne { return "person.fill" }
        return "envelope.fill"
    }
    
    /// Format a relative time string: "2m ago", "3h ago", "Yesterday"
    private func relativeTime(_ date: Date) -> String {
        let seconds = Date.now.timeIntervalSince(date)
        if seconds < 60 { return "Just now" }
        if seconds < 3600 {
            let min = Int(seconds / 60)
            return "\(min)m ago"
        }
        if seconds < 86400 {
            let hrs = Int(seconds / 3600)
            return "\(hrs)h ago"
        }
        if seconds < 172800 { return "Yesterday" }
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}
