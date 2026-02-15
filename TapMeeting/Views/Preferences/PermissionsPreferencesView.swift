import SwiftUI

struct PermissionsPreferencesView: View {
    
    @Environment(AppState.self) private var appState
    
    var body: some View {
        VStack(spacing: 16) {
            SettingsCard(
                title: "System Permissions",
                subtitle: "Tap needs these permissions to capture audio and show calendar events."
            ) {
                let pm = appState.permissionsManager
                
                VStack(spacing: 0) {
                    PermissionRow(
                        icon: "mic",
                        name: "Microphone",
                        description: "Required to capture your voice during meetings",
                        status: pm.microphoneStatus
                    ) {
                        Task { _ = await pm.requestMicrophone() }
                    }
                    
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(height: 1)
                        .padding(.vertical, 12)
                    
                    PermissionRow(
                        icon: "rectangle.dashed.badge.record",
                        name: "Screen Recording",
                        description: "Required to capture system audio from meeting apps",
                        status: pm.screenRecordingStatus
                    ) {
                        pm.requestScreenRecording()
                    }
                    
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(height: 1)
                        .padding(.vertical, 12)
                    
                    PermissionRow(
                        icon: "calendar",
                        name: "Calendar",
                        description: "Required to detect upcoming calendar events",
                        status: pm.calendarStatus
                    ) {
                        Task { _ = await pm.requestCalendar() }
                    }
                    
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(height: 1)
                        .padding(.vertical, 12)
                    
                    PermissionRow(
                        icon: "bell",
                        name: "Notifications",
                        description: "Required to send meeting reminders",
                        status: pm.notificationStatus
                    ) {
                        Task { _ = await pm.requestNotifications() }
                    }
                }
            }
        }
        .task { await appState.permissionsManager.checkAll() }
    }
}

// MARK: - Permission Row

private struct PermissionRow: View {
    let icon: String
    let name: String
    let description: String
    let status: PermissionStatus
    let action: () -> Void
    
    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(statusColor.opacity(0.08))
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .foregroundColor(statusColor)
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                
                Text(description)
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textTertiary)
            }
            
            Spacer()
            
            if status == .granted {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 12))
                    Text("Granted")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(Color(red: 0.30, green: 0.69, blue: 0.31))
            } else {
                Button {
                    action()
                } label: {
                    Text(status == .notRequested ? "Allow" : "Open Settings")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Theme.olive)
                        .cornerRadius(5)
                }
                .buttonStyle(.plain)
            }
        }
    }
    
    private var statusColor: Color {
        status == .granted ? Color(red: 0.30, green: 0.69, blue: 0.31) : Theme.olive
    }
}
