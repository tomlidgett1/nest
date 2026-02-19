import SwiftUI

/// Compact card-in-card login window.
struct LoginView: View {

    @Environment(SupabaseService.self) private var supabaseService
    @State private var isHoveringButton = false

    var body: some View {
        ZStack {
            // Outer background
            Theme.background
                .ignoresSafeArea()

            // Inner card
            VStack(spacing: 0) {
                VStack(spacing: 20) {

                    // Nest logo
                    HStack(spacing: 6) {
                        Image(systemName: "bird.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(
                                .linearGradient(
                                    colors: [Theme.olive, Theme.olive.opacity(0.6)],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )

                        Text("Nest")
                            .font(.system(size: 17, weight: .bold, design: .serif))
                            .foregroundColor(Theme.textPrimary)
                    }
                    .padding(.top, 4)

                    // Heading
                    VStack(spacing: 4) {
                        Text("Welcome back")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(Theme.textPrimary)

                        Text("Sign in to continue")
                            .font(.system(size: 12, weight: .regular))
                            .foregroundColor(Theme.textSecondary)
                    }

                    // Divider
                    Theme.divider
                        .frame(height: 1)
                        .padding(.horizontal, -24)

                    // Sign in button or loading
                    if supabaseService.isSigningIn {
                        ProgressView()
                            .controlSize(.regular)
                            .tint(Theme.textSecondary)
                            .frame(height: 38)
                    } else {
                        Button {
                            Task {
                                await supabaseService.signInWithGoogle()
                            }
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
                            .frame(maxWidth: .infinity)
                            .frame(height: 38)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(Color.white)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .strokeBorder(Theme.divider, lineWidth: 1)
                            )
                            .shadow(color: Color.black.opacity(isHoveringButton ? 0.08 : 0.03), radius: isHoveringButton ? 4 : 2, y: isHoveringButton ? 2 : 1)
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
                    }
                }
                .padding(24)
            }
            .frame(width: 280)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(Theme.divider.opacity(0.5), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.06), radius: 12, y: 4)
        }
    }
}
