import Foundation

final class EmbeddingService {
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 120
        return URLSession(configuration: config)
    }()

    func embed(text: String) async throws -> [Double] {
        let apiKey = KeychainHelper.get(key: Constants.Keychain.openAIAPIKey) ?? ""
        guard !apiKey.isEmpty else {
            throw EnhancementError.missingAPIKey
        }

        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return [] }

        let body: [String: Any] = [
            "input": cleaned,
            "model": Constants.AI.embeddingModel
        ]

        var request = URLRequest(url: URL(string: Constants.AI.embeddingsEndpoint)!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw EnhancementError.apiError("Invalid embeddings response")
        }
        guard (200...299).contains(http.statusCode) else {
            let text = String(data: data, encoding: .utf8) ?? ""
            throw EnhancementError.apiError("Embeddings failed (\(http.statusCode)): \(text)")
        }

        let payload = try JSONDecoder().decode(EmbeddingsResponse.self, from: data)
        guard let vector = payload.data.first?.embedding else {
            throw EnhancementError.emptyResponse
        }
        return vector
    }
}

private struct EmbeddingsResponse: Decodable {
    let data: [EmbeddingsDatum]
}

private struct EmbeddingsDatum: Decodable {
    let embedding: [Double]
}
