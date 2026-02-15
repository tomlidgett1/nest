import SwiftUI

// MARK: - Settings Section

enum SettingsSection: String, CaseIterable, Identifiable {
    case general
    case calendars
    case gmail
    case apiKeys
    case aiEmail
    case permissions
    
    var id: String { rawValue }
    
    var title: String {
        switch self {
        case .general: return "General"
        case .calendars: return "Calendars"
        case .gmail: return "Gmail"
        case .apiKeys: return "API Keys"
        case .aiEmail: return "AI Email"
        case .permissions: return "Permissions"
        }
    }
    
    var icon: String {
        switch self {
        case .general: return "gearshape"
        case .calendars: return "calendar"
        case .gmail: return "envelope"
        case .apiKeys: return "key"
        case .aiEmail: return "sparkles"
        case .permissions: return "lock.shield"
        }
    }
}

// MARK: - Settings Card

/// A reusable white card container for settings sections.
struct SettingsCard<Content: View>: View {
    let title: String?
    let subtitle: String?
    @ViewBuilder let content: () -> Content
    
    init(title: String? = nil, subtitle: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let title {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Theme.textPrimary)
                    
                    if let subtitle {
                        Text(subtitle)
                            .font(.system(size: 12))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
            }
            
            content()
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Theme.divider.opacity(0.5), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.02), radius: 3, y: 1)
    }
}

// MARK: - Settings Toggle Row

/// A reusable toggle row with icon, title, subtitle, and switch.
struct SettingsToggleRow: View {
    let icon: String
    let title: String
    let subtitle: String?
    @Binding var isOn: Bool
    
    init(icon: String, title: String, subtitle: String? = nil, isOn: Binding<Bool>) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self._isOn = isOn
    }
    
    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Theme.olive.opacity(0.08))
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.olive)
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textTertiary)
                }
            }
            
            Spacer()
            
            Toggle("", isOn: $isOn)
                .toggleStyle(.switch)
                .controlSize(.small)
                .tint(Theme.olive)
                .labelsHidden()
        }
    }
}

// MARK: - Settings Status Row

/// A row showing an item with a status indicator.
struct SettingsStatusRow: View {
    let icon: String
    let title: String
    let subtitle: String?
    let status: StatusType
    let action: (() -> Void)?
    let actionLabel: String?
    
    enum StatusType {
        case connected
        case active
        case warning
        case disconnected
        
        var color: Color {
            switch self {
            case .connected, .active: return Color(red: 0.30, green: 0.69, blue: 0.31)
            case .warning: return Color(red: 0.95, green: 0.65, blue: 0.15)
            case .disconnected: return Theme.textQuaternary
            }
        }
        
        var label: String {
            switch self {
            case .connected: return "Connected"
            case .active: return "Active"
            case .warning: return "Needs Attention"
            case .disconnected: return "Not Connected"
            }
        }
    }
    
    init(icon: String, title: String, subtitle: String? = nil, status: StatusType, action: (() -> Void)? = nil, actionLabel: String? = nil) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.status = status
        self.action = action
        self.actionLabel = actionLabel
    }
    
    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Theme.olive.opacity(0.08))
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.olive)
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textTertiary)
                }
            }
            
            Spacer()
            
            if let action, let actionLabel {
                Button(actionLabel, action: action)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Theme.recording)
                    .buttonStyle(.plain)
            }
            
            HStack(spacing: 4) {
                Circle()
                    .fill(status.color)
                    .frame(width: 6, height: 6)
                Text(status.label)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(status.color)
            }
        }
    }
}

// MARK: - Settings Tab Bar

struct SettingsTabBar: View {
    @Binding var selectedSection: SettingsSection
    
    var body: some View {
        HStack(spacing: 2) {
            ForEach(SettingsSection.allCases) { section in
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        selectedSection = section
                    }
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: section.icon)
                            .font(.system(size: 11))
                        Text(section.title)
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(selectedSection == section ? Theme.textPrimary : Theme.textSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(selectedSection == section ? Color.white : Color.clear)
                    .cornerRadius(6)
                    .shadow(color: selectedSection == section ? .black.opacity(0.06) : .clear, radius: 2, y: 1)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(Theme.sidebarSelection)
        .cornerRadius(8)
    }
}

// MARK: - Settings Content View (for main window sidebar integration)

struct SettingsContentView: View {
    @Binding var isSidebarCollapsed: Bool
    @Environment(AppState.self) private var appState
    @State private var selectedSection: SettingsSection = .general
    
    var body: some View {
        VStack(spacing: 0) {
            if appState.isMeetingActive {
                HStack(spacing: 10) {
                    Spacer()
                    MeetingControlButtons()
                }
                .padding(.horizontal, Theme.Spacing.contentPadding)
                .padding(.bottom, 8)
            }
            
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Settings")
                        .font(Theme.titleFont(28))
                        .foregroundColor(Theme.textPrimary)
                        .padding(.top, Theme.Spacing.mainContentTopPadding)
                    
                    SettingsTabBar(selectedSection: $selectedSection)
                    
                    sectionContent
                        .frame(maxWidth: 600)
                    
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, Theme.Spacing.contentPadding)
                .padding(.top, 4)
            }
        }
        .background(Theme.background)
    }
    
    @ViewBuilder
    private var sectionContent: some View {
        switch selectedSection {
        case .general:
            GeneralPreferencesView()
                .transition(.opacity)
        case .calendars:
            CalendarPreferencesView()
                .transition(.opacity)
        case .gmail:
            GmailPreferencesView()
                .transition(.opacity)
        case .apiKeys:
            AccountPreferencesView()
                .transition(.opacity)
        case .aiEmail:
            AIEmailPreferencesView()
                .transition(.opacity)
        case .permissions:
            PermissionsPreferencesView()
                .transition(.opacity)
        }
    }
}

// MARK: - Preferences View (standalone Cmd+, window)

/// Preferences — standalone window version with same tab navigation.
struct PreferencesView: View {
    @State private var selectedSection: SettingsSection = .general
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            VStack(spacing: 16) {
                Text("Settings")
                    .font(Theme.titleFont(22))
                    .foregroundColor(Theme.textPrimary)
                
                SettingsTabBar(selectedSection: $selectedSection)
            }
            .padding(.horizontal, 28)
            .padding(.top, 24)
            .padding(.bottom, 16)
            
            Rectangle().fill(Theme.divider).frame(height: 1)
            
            // Content
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    sectionContent
                    Spacer(minLength: 24)
                }
                .padding(.horizontal, 28)
                .padding(.top, 20)
                .padding(.bottom, 28)
            }
        }
        .frame(width: 580, height: 640)
        .background(Theme.background)
    }
    
    @ViewBuilder
    private var sectionContent: some View {
        switch selectedSection {
        case .general:
            GeneralPreferencesView()
        case .calendars:
            CalendarPreferencesView()
        case .gmail:
            GmailPreferencesView()
        case .apiKeys:
            AccountPreferencesView()
        case .aiEmail:
            AIEmailPreferencesView()
        case .permissions:
            PermissionsPreferencesView()
        }
    }
}
