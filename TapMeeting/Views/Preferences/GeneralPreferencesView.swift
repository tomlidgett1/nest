import SwiftUI
import ServiceManagement

struct GeneralPreferencesView: View {
    
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
        }
    }
}
