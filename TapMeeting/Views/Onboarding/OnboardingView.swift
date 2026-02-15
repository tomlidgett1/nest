import SwiftUI

/// Onboarding — clean single-step permissions setup.
/// API keys are now managed server-side via Supabase, so no key entry needed.
struct OnboardingView: View {

    @Environment(AppState.self) private var appState

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 12) {
                Text("Welcome to Nest")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(Theme.textPrimary)
                    .padding(.top, Theme.Spacing.titleTopPadding)

                Text("Nest captures meeting audio, transcribes it,\nand enhances your notes with AI.")
                    .font(Theme.bodyFont())
                    .foregroundColor(Theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(2)

                VStack(alignment: .leading, spacing: 8) {
                    PermItem(label: "Microphone", detail: "Capture your voice", status: appState.permissionsManager.microphoneStatus)
                    PermItem(label: "Screen Recording", detail: "Capture system audio (not your screen)", status: appState.permissionsManager.screenRecordingStatus)
                }
                .padding(.top, 8)
            }

            Spacer()

            HStack {
                Spacer()
                Button("Get Started") {
                    requestPermissions()
                    appState.completeOnboarding()
                    NSApp.keyWindow?.close()
                    appState.shouldOpenNotesWindow = true
                }
                .font(.system(size: 13, weight: .medium))
                .buttonStyle(.plain)
                .foregroundColor(Theme.olive)
                Spacer()
            }
            .padding(.bottom, 28)
        }
        .frame(width: 420, height: 320)
        .background(Theme.background)
    }

    private func requestPermissions() {
        let pm = appState.permissionsManager
        Task {
            _ = await pm.requestMicrophone()
            pm.requestScreenRecording()
            _ = await pm.requestNotifications()
            _ = await pm.requestCalendar()
        }
    }
}

private struct PermItem: View {
    let label: String; let detail: String; let status: PermissionStatus
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: status == .granted ? "checkmark.circle" : "circle")
                .font(.system(size: 12))
                .foregroundColor(status == .granted ? .green : Theme.textQuaternary)
            VStack(alignment: .leading, spacing: 0) {
                Text(label).font(.system(size: 12, weight: .medium)).foregroundColor(Theme.textPrimary)
                Text(detail).font(.system(size: 11)).foregroundColor(Theme.textTertiary)
            }
        }
    }
}
