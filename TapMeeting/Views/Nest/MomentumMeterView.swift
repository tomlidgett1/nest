import SwiftUI

/// A warm, organic visualisation showing the day's progress as dots.
struct MomentumMeterView: View {
    
    let momentum: MomentumModel
    
    private let dotSize: CGFloat = 8
    private let dotSpacing: CGFloat = 6
    private let maxDots = 12
    
    var body: some View {
        if momentum.total > 0 {
            HStack(spacing: 12) {
                // Dots
                HStack(spacing: dotSpacing) {
                    let totalVisible = min(momentum.total, maxDots)
                    let completedCount = min(momentum.completedDots, totalVisible)
                    let overdueCount = min(momentum.overdueDots, totalVisible - completedCount)
                    let pendingCount = totalVisible - completedCount - overdueCount
                    
                    ForEach(0..<completedCount, id: \.self) { _ in
                        Circle()
                            .fill(Theme.olive)
                            .frame(width: dotSize, height: dotSize)
                    }
                    
                    ForEach(0..<overdueCount, id: \.self) { _ in
                        Circle()
                            .stroke(Theme.recording.opacity(0.5), lineWidth: 1)
                            .frame(width: dotSize, height: dotSize)
                    }
                    
                    ForEach(0..<pendingCount, id: \.self) { _ in
                        Circle()
                            .stroke(Theme.olive.opacity(0.3), lineWidth: 1)
                            .frame(width: dotSize, height: dotSize)
                    }
                    
                    if momentum.total > maxDots {
                        Text("+\(momentum.total - maxDots)")
                            .font(Theme.captionFont(10))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                
                Spacer()
                
                // Label
                if let label = momentum.label {
                    Text(label)
                        .font(Theme.captionFont(12))
                        .foregroundColor(Theme.textSecondary)
                }
            }
            .frame(height: 40)
        }
    }
}
