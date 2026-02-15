import SwiftUI
import CryptoKit

// MARK: - Avatar Cache

/// Thread-safe cache that loads profile photos from Gravatar by email address.
/// Returns `nil` for emails with no public Gravatar — the view falls back to coloured initials.
actor AvatarCache {
    static let shared = AvatarCache()
    
    /// email (lowercased, trimmed) -> loaded image (or nil if we tried and got nothing)
    private var cache: [String: NSImage?] = [:]
    
    /// Load (or return cached) avatar for the given email.
    func loadAvatar(for rawEmail: String) async -> NSImage? {
        let key = rawEmail.lowercased().trimmingCharacters(in: .whitespaces)
        
        if let cached = cache[key] {
            return cached
        }
        
        let image = await fetchGravatar(email: key)
        cache[key] = image
        return image
    }
    
    /// Gravatar URL: MD5-hash the email → fetch 80px image → 404 = no avatar.
    private func fetchGravatar(email: String) async -> NSImage? {
        let digest = Insecure.MD5.hash(data: Data(email.utf8))
        let hash = digest.map { String(format: "%02x", $0) }.joined()
        
        guard let url = URL(string: "https://www.gravatar.com/avatar/\(hash)?s=80&d=404") else {
            return nil
        }
        
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200,
                  let image = NSImage(data: data) else {
                return nil
            }
            return image
        } catch {
            return nil
        }
    }
}

// MARK: - Sender Avatar View

/// Reusable avatar that shows the sender's Gravatar photo or falls back
/// to a coloured circle with their initial.
struct SenderAvatarView: View {
    let email: String
    let name: String
    let size: CGFloat
    
    @State private var loadedImage: NSImage?
    @State private var didAttemptLoad = false
    
    var body: some View {
        ZStack {
            if let image = loadedImage {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: size, height: size)
                    .clipShape(Circle())
            } else {
                Circle()
                    .fill(avatarColour(for: name))
                    .frame(width: size, height: size)
                    .overlay(
                        Text(senderInitial(name))
                            .font(.system(size: size * 0.375, weight: .semibold))
                            .foregroundColor(.white)
                    )
            }
        }
        .frame(width: size, height: size)
        .task(id: email) {
            guard !didAttemptLoad else { return }
            didAttemptLoad = true
            loadedImage = await AvatarCache.shared.loadAvatar(for: email)
        }
    }
    
    // MARK: - Fallback Helpers
    
    private func senderInitial(_ from: String) -> String {
        String((from.trimmingCharacters(in: .whitespaces).first ?? "?")).uppercased()
    }
    
    static let fallbackColours: [Color] = [
        Color(red: 0.25, green: 0.47, blue: 0.70),
        Color(red: 0.61, green: 0.35, blue: 0.55),
        Color(red: 0.20, green: 0.55, blue: 0.45),
        Color(red: 0.80, green: 0.50, blue: 0.20),
        Color(red: 0.55, green: 0.35, blue: 0.65),
        Color(red: 0.75, green: 0.35, blue: 0.35),
        Color(red: 0.35, green: 0.55, blue: 0.35),
        Color(red: 0.50, green: 0.50, blue: 0.65),
    ]
    
    private func avatarColour(for name: String) -> Color {
        Self.fallbackColours[abs(name.hashValue) % Self.fallbackColours.count]
    }
}
