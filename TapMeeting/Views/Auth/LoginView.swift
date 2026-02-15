import SwiftUI

/// Compact login window using the app's warm cream palette.
struct LoginView: View {

    @Environment(SupabaseService.self) private var supabaseService
    @State private var isHoveringButton = false

    var body: some View {
        ZStack {
            // Fill the entire window with the warm cream
            Theme.background
                .ignoresSafeArea()

            // Centred login content
            VStack(spacing: 28) {
                Spacer()

                // App icon
                Image(systemName: "bird.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(
                        .linearGradient(
                            colors: [Theme.olive, Theme.olive.opacity(0.6)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                // App name & tagline
                VStack(spacing: 6) {
                    Text("Nest")
                        .font(.system(size: 28, weight: .bold, design: .serif))
                        .foregroundColor(Theme.textPrimary)

                    Text("Your meetings, beautifully captured")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(Theme.textSecondary)
                }

                Spacer().frame(height: 4)

                // Sign in button or loading
                if supabaseService.isSigningIn {
                    ProgressView()
                        .controlSize(.regular)
                        .tint(Theme.textSecondary)
                        .frame(height: 42)
                } else {
                    Button {
                        Task {
                            await supabaseService.signInWithGoogle()
                        }
                    } label: {
                        HStack(spacing: 10) {
                            GoogleLogo()
                                .frame(width: 18, height: 18)

                            Text("Sign in with Google")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(Theme.textPrimary)
                        }
                        .frame(width: 220, height: 42)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(Color.white)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .strokeBorder(Theme.divider, lineWidth: 1)
                        )
                        .shadow(color: Color.black.opacity(isHoveringButton ? 0.08 : 0.04), radius: isHoveringButton ? 6 : 3, y: isHoveringButton ? 3 : 1)
                        .scaleEffect(isHoveringButton ? 1.01 : 1.0)
                        .animation(.easeOut(duration: 0.15), value: isHoveringButton)
                    }
                    .buttonStyle(.plain)
                    .contentShape(Rectangle())
                    .onHover { hovering in
                        isHoveringButton = hovering
                    }
                }

                // Error message
                if let error = supabaseService.authError {
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundColor(Theme.recording)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 240)
                }

                Spacer()
            }
        }
    }
}

// MARK: - Google Logo

/// Google "G" icon.
private struct GoogleLogo: View {
    var body: some View {
        ZStack {
            Circle()
                .trim(from: 0.00, to: 0.24)
                .stroke(Color(red: 0.92, green: 0.26, blue: 0.21), style: StrokeStyle(lineWidth: 2.6, lineCap: .round))
                .rotationEffect(.degrees(38))

            Circle()
                .trim(from: 0.24, to: 0.49)
                .stroke(Color(red: 0.98, green: 0.74, blue: 0.02), style: StrokeStyle(lineWidth: 2.6, lineCap: .round))
                .rotationEffect(.degrees(38))

            Circle()
                .trim(from: 0.49, to: 0.74)
                .stroke(Color(red: 0.20, green: 0.66, blue: 0.33), style: StrokeStyle(lineWidth: 2.6, lineCap: .round))
                .rotationEffect(.degrees(38))

            Circle()
                .trim(from: 0.74, to: 0.98)
                .stroke(Color(red: 0.26, green: 0.52, blue: 0.96), style: StrokeStyle(lineWidth: 2.6, lineCap: .round))
                .rotationEffect(.degrees(38))

            Rectangle()
                .fill(Color(red: 0.26, green: 0.52, blue: 0.96))
                .frame(width: 7, height: 2.6)
                .offset(x: 3.5)
        }
        .frame(width: 18, height: 18)
    }
}
