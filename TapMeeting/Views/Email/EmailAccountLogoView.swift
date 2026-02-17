import SwiftUI
import AppKit

/// Displays a company logo fetched from Google's favicon service based on an email domain.
/// Uses the same approach as CompanyLogoView but takes an email string directly.
/// Falls back to a Gmail-style envelope when the favicon is the default blue globe.
struct EmailAccountLogoView: View {
    
    /// The email address to extract the domain from.
    let email: String
    var size: CGFloat = 20
    
    @State private var logoImage: NSImage?
    @State private var lastLoadedEmail: String?
    
    private var domain: String? {
        let parts = email.components(separatedBy: "@")
        return parts.count == 2 ? parts[1] : nil
    }
    
    private var faviconURL: URL? {
        guard let domain else { return nil }
        return URL(string: "https://www.google.com/s2/favicons?domain=\(domain)&sz=128")
    }
    
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
        .task(id: email) {
            guard email != lastLoadedEmail, let url = faviconURL else { return }
            logoImage = nil
            lastLoadedEmail = email
            await loadFavicon(from: url)
        }
    }
    
    private var fallbackIcon: some View {
        Image("gmail")
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
