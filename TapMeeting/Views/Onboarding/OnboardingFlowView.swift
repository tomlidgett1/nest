import SwiftUI

/// Multi-step onboarding flow — introduces Nest, handles sign-in, permissions,
/// and optional account connections in a single seamless experience.
struct OnboardingFlowView: View {

    @Environment(AppState.self) private var appState
    @Environment(SupabaseService.self) private var supabaseService

    @State private var currentPage = 0
    @State private var direction: NavigationDirection = .forward
    @State private var appeared = false

    private let totalPages = 7

    var body: some View {
        VStack(spacing: 0) {
            // Content area
            ZStack {
                pageContent
                    .id(currentPage)
                    .transition(pageTransition)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()

            // Bottom bar — progress dots + navigation
            bottomBar
        }
        .frame(width: 560, height: 460)
        .background(Theme.background)
        .onAppear {
            withAnimation(.easeOut(duration: 0.6)) {
                appeared = true
            }
            Task { await appState.permissionsManager.checkAll() }
        }
        .onChange(of: supabaseService.isAuthenticated) { _, isAuth in
            if isAuth && currentPage == 3 {
                advancePage()
            }
        }
    }

    // MARK: - Page Router

    @ViewBuilder
    private var pageContent: some View {
        switch currentPage {
        case 0: welcomePage
        case 1: meetingsPage
        case 2: connectedPage
        case 3: signInPage
        case 4: permissionsPage
        case 5: accountsPage
        case 6: allSetPage
        default: EmptyView()
        }
    }

    // MARK: - Page 0: Welcome

    private var welcomePage: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 20) {
                // Bird logo
                nestLogo(size: 32)
                    .opacity(appeared ? 1 : 0)
                    .offset(y: appeared ? 0 : 8)
                    .animation(.easeOut(duration: 0.7).delay(0.1), value: appeared)

                VStack(spacing: 8) {
                    Text("Welcome to Nest")
                        .font(.system(size: 26, weight: .bold, design: .serif))
                        .foregroundColor(Theme.textPrimary)
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 6)
                        .animation(.easeOut(duration: 0.7).delay(0.2), value: appeared)

                    Text("Focus on the conversation.\nNest handles the rest.")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundColor(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                        .opacity(appeared ? 1 : 0)
                        .animation(.easeOut(duration: 0.7).delay(0.35), value: appeared)
                }
            }

            Spacer()

            continueButton("Get Started")
                .opacity(appeared ? 1 : 0)
                .animation(.easeOut(duration: 0.5).delay(0.5), value: appeared)
                .padding(.bottom, 8)
        }
        .padding(.horizontal, 48)
    }

    // MARK: - Page 1: Meetings + Notes

    private var meetingsPage: some View {
        featurePage(
            icon: "waveform",
            title: "Never take notes again",
            subtitle: "Nest listens, transcribes, and writes your\nnotes — every action item, captured for you.",
            pills: ["Live Transcription", "AI Notes", "Auto Todos"]
        )
    }

    // MARK: - Page 2: Calendar, Email + AI

    private var connectedPage: some View {
        featurePage(
            icon: "sparkles",
            title: "Prepared for everything",
            subtitle: "Morning briefings. Meeting dossiers.\nYour inbox, triaged and prioritised.",
            pills: ["Morning Briefing", "Meeting Dossiers", "Email Triage"]
        )
    }

    // MARK: - Page 3: Sign In

    private var signInPage: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 20) {
                nestLogo(size: 28)

                VStack(spacing: 8) {
                    Text("Sign in to get started")
                        .font(.system(size: 22, weight: .bold, design: .serif))
                        .foregroundColor(Theme.textPrimary)

                    Text("Connect your Google account so Nest\ncan work its magic.")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(2)
                }

                // Sign-in button or loading
                if supabaseService.isSigningIn {
                    ProgressView()
                        .controlSize(.regular)
                        .tint(Theme.textSecondary)
                        .frame(height: 40)
                        .padding(.top, 4)
                } else {
                    googleSignInButton
                        .padding(.top, 4)
                }

                if let error = supabaseService.authError {
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundColor(Theme.recording)
                        .multilineTextAlignment(.center)
                        .padding(.top, 2)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 48)
    }

    // MARK: - Page 4: Permissions

    private var permissionsPage: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 20) {
                Image(systemName: "lock.shield")
                    .font(.system(size: 28, weight: .light))
                    .foregroundStyle(
                        .linearGradient(
                            colors: [Theme.olive, Theme.olive.opacity(0.6)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                VStack(spacing: 8) {
                    Text("A couple of things")
                        .font(.system(size: 22, weight: .bold, design: .serif))
                        .foregroundColor(Theme.textPrimary)

                    Text("So Nest can listen in on your meetings.")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                }

                // Permission rows
                VStack(spacing: 0) {
                    permissionRow(
                        icon: "mic",
                        label: "Microphone",
                        detail: "Capture your voice during meetings",
                        status: appState.permissionsManager.microphoneStatus
                    )

                    Theme.divider
                        .frame(height: 1)
                        .padding(.horizontal, 16)

                    permissionRow(
                        icon: "rectangle.inset.filled.and.person.filled",
                        label: "Screen Recording",
                        detail: "Capture system audio (not your screen)",
                        status: appState.permissionsManager.screenRecordingStatus
                    )
                }
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.white)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(Theme.divider.opacity(0.5), lineWidth: 1)
                )
                .padding(.horizontal, 8)

                Button {
                    requestPermissions()
                } label: {
                    Text("Grant Permissions")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: 220)
                        .frame(height: 38)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(Theme.olive)
                        )
                }
                .buttonStyle(.plain)
                .padding(.top, 4)

                Button {
                    advancePage()
                } label: {
                    Text("Skip for now")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Theme.textTertiary)
                }
                .buttonStyle(.plain)
            }

            Spacer()
        }
        .padding(.horizontal, 48)
    }

    // MARK: - Page 5: Connect Accounts

    private var accountsPage: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 20) {
                Image(systemName: "person.2")
                    .font(.system(size: 28, weight: .light))
                    .foregroundStyle(
                        .linearGradient(
                            colors: [Theme.olive, Theme.olive.opacity(0.6)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                VStack(spacing: 8) {
                    Text("Add your accounts")
                        .font(.system(size: 22, weight: .bold, design: .serif))
                        .foregroundColor(Theme.textPrimary)

                    Text("Connect additional accounts\nfor calendar and email.")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(2)
                }

                VStack(spacing: 0) {
                    // Google Calendar — primary connected
                    accountRow(
                        icon: "calendar",
                        label: "Google Calendar",
                        detail: supabaseService.currentUserEmail ?? "Connected",
                        isConnected: true
                    )

                    Theme.divider
                        .frame(height: 1)
                        .padding(.horizontal, 16)

                    // Gmail — primary connected
                    accountRow(
                        icon: "envelope",
                        label: "Gmail",
                        detail: supabaseService.currentUserEmail ?? "Connected",
                        isConnected: true
                    )

                    Theme.divider
                        .frame(height: 1)
                        .padding(.horizontal, 16)

                    // Apple Calendar
                    accountRow(
                        icon: "apple.logo",
                        label: "Apple Calendar",
                        detail: "System calendars",
                        isConnected: true
                    )
                }
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.white)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(Theme.divider.opacity(0.5), lineWidth: 1)
                )
                .padding(.horizontal, 8)

                // Add another account button
                Button {
                    appState.gmailService.signInAdditionalAccount()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus.circle")
                            .font(.system(size: 12))
                        Text("Add Another Google Account")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(Theme.olive)
                }
                .buttonStyle(.plain)
            }

            Spacer()

            continueButton("Continue")
                .padding(.bottom, 8)
        }
        .padding(.horizontal, 48)
    }

    // MARK: - Page 6: All Set

    private var allSetPage: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 20) {
                nestLogo(size: 40)

                VStack(spacing: 8) {
                    Text("You're all set")
                        .font(.system(size: 26, weight: .bold, design: .serif))
                        .foregroundColor(Theme.textPrimary)

                    Text("Your next meeting is\nalready covered.")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundColor(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                }
            }

            Spacer()

            Button {
                appState.completeOnboarding()
                NSApp.keyWindow?.close()
                appState.shouldOpenNotesWindow = true
            } label: {
                Text("Open Nest")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: 200)
                    .frame(height: 40)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Theme.olive)
                    )
            }
            .buttonStyle(.plain)
            .padding(.bottom, 8)
        }
        .padding(.horizontal, 48)
    }

    // MARK: - Shared Components

    private func nestLogo(size: CGFloat) -> some View {
        Image(systemName: "bird.fill")
            .font(.system(size: size, weight: .regular))
            .foregroundStyle(
                .linearGradient(
                    colors: [Theme.olive, Theme.olive.opacity(0.6)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
    }

    private func featurePage(icon: String, title: String, subtitle: String, pills: [String]) -> some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 20) {
                Image(systemName: icon)
                    .font(.system(size: 30, weight: .light))
                    .foregroundStyle(
                        .linearGradient(
                            colors: [Theme.olive, Theme.olive.opacity(0.6)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                VStack(spacing: 8) {
                    Text(title)
                        .font(.system(size: 22, weight: .bold, design: .serif))
                        .foregroundColor(Theme.textPrimary)

                    Text(subtitle)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(2)
                }

                // Feature pills
                HStack(spacing: 8) {
                    ForEach(pills, id: \.self) { pill in
                        Text(pill)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Theme.olive)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .fill(Theme.oliveFaint)
                            )
                    }
                }
                .padding(.top, 4)
            }

            Spacer()

            continueButton("Continue")
                .padding(.bottom, 8)
        }
        .padding(.horizontal, 48)
    }

    private func continueButton(_ label: String) -> some View {
        Button {
            advancePage()
        } label: {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Theme.olive)
                .frame(maxWidth: 200)
                .frame(height: 38)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Theme.olive.opacity(0.1))
                )
        }
        .buttonStyle(.plain)
    }

    private var googleSignInButton: some View {
        Button {
            Task { await supabaseService.signInWithGoogle() }
        } label: {
            HStack(spacing: 8) {
                Image("google")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 16, height: 16)

                Text("Continue with Google")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
            }
            .frame(maxWidth: 260)
            .frame(height: 40)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(Theme.divider, lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.04), radius: 3, y: 1)
        }
        .buttonStyle(.plain)
    }

    private func permissionRow(icon: String, label: String, detail: String, status: PermissionStatus) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(Theme.olive)
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                Text(detail)
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textTertiary)
            }

            Spacer()

            Image(systemName: status == .granted ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 14))
                .foregroundColor(status == .granted ? Theme.olive : Theme.textQuaternary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func accountRow(icon: String, label: String, detail: String, isConnected: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(Theme.olive)
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                Text(detail)
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textTertiary)
            }

            Spacer()

            if isConnected {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 14))
                    .foregroundColor(Theme.olive)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        HStack {
            // Back button
            if currentPage > 0 && currentPage != 3 || (currentPage == 3 && !supabaseService.isSigningIn) {
                Button {
                    goBack()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Theme.textTertiary)
                }
                .buttonStyle(.plain)
            }

            Spacer()

            // Progress dots
            HStack(spacing: 6) {
                ForEach(0..<totalPages, id: \.self) { index in
                    Circle()
                        .fill(index == currentPage ? Theme.olive : Theme.textQuaternary.opacity(0.5))
                        .frame(width: index == currentPage ? 7 : 5, height: index == currentPage ? 7 : 5)
                        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: currentPage)
                }
            }

            Spacer()

            // Invisible spacer to balance back button
            Image(systemName: "chevron.left")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.clear)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
    }

    // MARK: - Navigation

    private enum NavigationDirection {
        case forward, backward
    }

    private var pageTransition: AnyTransition {
        switch direction {
        case .forward:
            return .asymmetric(
                insertion: .opacity.combined(with: .move(edge: .trailing)),
                removal: .opacity.combined(with: .move(edge: .leading))
            )
        case .backward:
            return .asymmetric(
                insertion: .opacity.combined(with: .move(edge: .leading)),
                removal: .opacity.combined(with: .move(edge: .trailing))
            )
        }
    }

    private func advancePage() {
        guard currentPage < totalPages - 1 else { return }
        direction = .forward
        withAnimation(.easeInOut(duration: 0.4)) {
            currentPage += 1
        }
    }

    private func goBack() {
        guard currentPage > 0 else { return }
        direction = .backward
        withAnimation(.easeInOut(duration: 0.4)) {
            currentPage -= 1
        }
    }

    // MARK: - Actions

    private func requestPermissions() {
        let pm = appState.permissionsManager
        Task {
            _ = await pm.requestMicrophone()
            pm.requestScreenRecording()
            _ = await pm.requestNotifications()
            _ = await pm.requestCalendar()
            // Re-check after a short delay for screen recording
            try? await Task.sleep(for: .seconds(1))
            await pm.checkAll()
        }
    }
}
