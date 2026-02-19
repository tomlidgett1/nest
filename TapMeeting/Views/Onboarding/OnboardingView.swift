import SwiftUI

/// Onboarding — thin wrapper around the multi-step OnboardingFlowView.
/// Shown on first launch to introduce Nest, handle sign-in, permissions,
/// and optional account connections.
struct OnboardingView: View {

    var body: some View {
        OnboardingFlowView()
    }
}
