import SwiftUI
import AppKit

/// Displays a company logo fetched from Google's favicon service based on the organiser's email domain.
/// Detects the default blue globe response and falls back to the Google Calendar icon.
struct CompanyLogoView: View {

    let event: CalendarEvent
    var size: CGFloat = 24

    @State private var logoImage: NSImage?
    @State private var didLoad = false

    var body: some View {
        Group {
            if let image = logoImage {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: size, height: size)
                    .clipShape(RoundedRectangle(cornerRadius: size * 0.2))
            } else {
                fallbackIcon
            }
        }
        .task(id: event.organizerLogoURL) {
            guard !didLoad, let url = event.organizerLogoURL else { return }
            didLoad = true
            await loadFavicon(from: url)
        }
    }

    private var fallbackIcon: some View {
        Image("GoogleCalendarIcon")
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(width: size, height: size)
    }

    private func loadFavicon(from url: URL) async {
        do {
            let (data, response) = try await URLSession.shared.data(from: url)

            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }

            // Google's default blue globe is very small (~726 bytes at sz=128).
            // Real company favicons are significantly larger.
            guard data.count > 1000 else { return }

            guard let nsImage = NSImage(data: data),
                  nsImage.size.width > 1 else { return }

            await MainActor.run {
                logoImage = nsImage
            }
        } catch {
            // Network error — keep fallback
        }
    }
}
