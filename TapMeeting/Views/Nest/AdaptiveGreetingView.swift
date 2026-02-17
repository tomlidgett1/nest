import SwiftUI

/// Dynamic, time-aware, context-aware greeting that makes the app feel alive.
struct AdaptiveGreetingView: View {
    
    let greeting: GreetingModel
    @State private var hasAppeared = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(greeting.main)
                .font(Theme.titleFont(28))
                .foregroundColor(Theme.textPrimary)
                .lineLimit(2)
            
            if !greeting.sub.isEmpty {
                Text(greeting.sub)
                    .font(Theme.captionFont(14))
                    .foregroundColor(Theme.textSecondary)
                    .lineLimit(1)
            }
        }
        .opacity(hasAppeared ? 1 : 0)
        .animation(.easeIn(duration: 0.3), value: hasAppeared)
        .onAppear {
            if !hasAppeared { hasAppeared = true }
        }
    }
}
