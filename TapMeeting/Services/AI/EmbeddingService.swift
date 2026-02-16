import Foundation

/// Generates text embeddings using the OpenAI Embeddings API via server-side proxy.
final class EmbeddingService {

    func embed(text: String) async throws -> [Double] {
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return [] }

        let body: [String: Any] = [
            "input": cleaned,
            "model": Constants.AI.embeddingModel
        ]

        let data = try await AIProxyClient.shared.request(
            provider: .openai,
            endpoint: "/v1/embeddings",
            body: body
        )

        let payload = try JSONDecoder().decode(EmbeddingsResponse.self, from: data)
        guard let vector = payload.data.first?.embedding else {
            throw AIProxyError.emptyResponse
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
