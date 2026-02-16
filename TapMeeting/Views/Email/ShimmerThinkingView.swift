import SwiftUI

/// A "thinking" indicator with a shimmer/gradient sweep effect.
///
/// Used across all AI email features to show loading states:
/// drafts generating, summarising, style analysis, etc.
struct ShimmerThinkingView: View {
    
    let text: String
    var icon: String = "sparkles"
    var lineCount: Int = 0
    
    @State private var shimmerOffset: CGFloat = -1.0
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Thinking text with shimmer (hidden when text is empty)
            if !text.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: icon)
                        .font(.system(size: 11))
                        .foregroundColor(Theme.olive)
                    
                    Text(text)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(shimmerGradient)
                }
            }
            
            // Skeleton lines (optional)
            if lineCount > 0 {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(0..<lineCount, id: \.self) { index in
                        skeletonLine(widthFraction: lineWidth(for: index))
                    }
                }
            }
        }
        .onAppear {
            withAnimation(
                .linear(duration: 1.5)
                .repeatForever(autoreverses: false)
            ) {
                shimmerOffset = 2.0
            }
        }
    }
    
    // MARK: - Shimmer Gradient
    
    private var shimmerGradient: some ShapeStyle {
        LinearGradient(
            colors: [
                Theme.textTertiary,
                Theme.textPrimary,
                Theme.textTertiary
            ],
            startPoint: UnitPoint(x: shimmerOffset - 0.5, y: 0.5),
            endPoint: UnitPoint(x: shimmerOffset + 0.5, y: 0.5)
        )
    }
    
    // MARK: - Skeleton Lines
    
    private func skeletonLine(widthFraction: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 3)
            .fill(skeletonGradient)
            .frame(height: 10)
            .frame(maxWidth: .infinity)
            .scaleEffect(x: widthFraction, anchor: .leading)
    }
    
    private var skeletonGradient: some ShapeStyle {
        LinearGradient(
            colors: [
                Theme.divider.opacity(0.6),
                Theme.divider.opacity(0.3),
                Theme.divider.opacity(0.6)
            ],
            startPoint: UnitPoint(x: shimmerOffset - 0.5, y: 0.5),
            endPoint: UnitPoint(x: shimmerOffset + 0.5, y: 0.5)
        )
    }
    
    /// Vary widths so the skeleton looks organic.
    private func lineWidth(for index: Int) -> CGFloat {
        let widths: [CGFloat] = [0.95, 0.8, 0.9, 0.6, 0.75]
        return widths[index % widths.count]
    }
}

// MARK: - Quick Action Skeleton

/// Shimmer placeholder for quick action chips while they load.
struct QuickActionSkeletonView: View {
    
    @State private var shimmerOffset: CGFloat = -1.0
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Quick Actions")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Theme.textTertiary)
            
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { index in
                    skeletonChip(width: chipWidth(for: index))
                }
            }
        }
        .onAppear {
            withAnimation(
                .linear(duration: 1.5)
                .repeatForever(autoreverses: false)
            ) {
                shimmerOffset = 2.0
            }
        }
    }
    
    private func skeletonChip(width: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 6)
            .fill(chipGradient)
            .frame(width: width, height: 26)
    }
    
    private var chipGradient: some ShapeStyle {
        LinearGradient(
            colors: [
                Theme.divider.opacity(0.5),
                Theme.divider.opacity(0.25),
                Theme.divider.opacity(0.5)
            ],
            startPoint: UnitPoint(x: shimmerOffset - 0.5, y: 0.5),
            endPoint: UnitPoint(x: shimmerOffset + 0.5, y: 0.5)
        )
    }
    
    private func chipWidth(for index: Int) -> CGFloat {
        let widths: [CGFloat] = [72, 56, 84]
        return widths[index % widths.count]
    }
}
