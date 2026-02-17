import SwiftUI
import ServiceManagement
import Sparkle

struct GeneralPreferencesView: View {
    
    @EnvironmentObject private var updaterService: UpdaterService
    @AppStorage(Constants.Defaults.launchAtLogin) private var launchAtLogin = false
    @AppStorage(Constants.Defaults.captureMicAudio) private var captureMic = true
    @AppStorage(Constants.Defaults.captureSystemAudio) private var captureSystem = true
    
    var body: some View {
        VStack(spacing: 16) {
            // Startup
            SettingsCard(title: "Startup") {
                SettingsToggleRow(
                    icon: "power",
                    title: "Launch Tap at login",
                    subtitle: "Automatically start when you log in to your Mac",
                    isOn: $launchAtLogin
                )
                .onChange(of: launchAtLogin) { _, enabled in
                    try? enabled ? SMAppService.mainApp.register() : SMAppService.mainApp.unregister()
                }
            }
            
            // Audio Capture
            SettingsCard(
                title: "Audio Capture",
                subtitle: "Choose which audio sources to record during meetings."
            ) {
                VStack(spacing: 0) {
                    SettingsToggleRow(
                        icon: "mic",
                        title: "Microphone (You)",
                        subtitle: "Captures your voice through the microphone",
                        isOn: $captureMic
                    )
                    
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(height: 1)
                        .padding(.vertical, 12)
                    
                    SettingsToggleRow(
                        icon: "speaker.wave.2",
                        title: "System Audio (Them)",
                        subtitle: "Captures audio from meeting apps and browsers",
                        isOn: $captureSystem
                    )
                }
                
                HStack(spacing: 6) {
                    Image(systemName: "info.circle")
                        .font(.system(size: 10))
                        .foregroundColor(Theme.textQuaternary)
                    Text("System audio capture requires Screen Recording permission to be granted.")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textTertiary)
                }
                .padding(.top, 4)
            }

            // Updates
            SettingsCard(title: "Updates", subtitle: "Nest checks for updates automatically on launch.") {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Theme.olive.opacity(0.08))
                            .frame(width: 32, height: 32)
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.system(size: 13))
                            .foregroundColor(Theme.olive)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Software Update")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Theme.textPrimary)
                        Text("Version \(Bundle.main.shortVersionString)")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.textTertiary)
                    }

                    Spacer()

                    Button {
                        updaterService.checkForUpdates()
                    } label: {
                        Text("Check for Updates")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .disabled(!updaterService.canCheckForUpdates)
                }
            }
        }
    }
}

// MARK: - Bundle helper

private extension Bundle {
    var shortVersionString: String {
        infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
    }
}
