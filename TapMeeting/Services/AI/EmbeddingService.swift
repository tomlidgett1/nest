import Foundation

/// Generates text embeddings using the OpenAI Embeddings API via server-side proxy.
/// Supports both single and batch embedding with automatic batching for efficiency.
final class EmbeddingService {

    /// Maximum inputs per OpenAI embedding API call.
    private let batchSize = 64

    // MARK: - Single Embedding

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

    // MARK: - Batch Embedding

    /// Embeds multiple texts in a single API call (batched automatically if > batchSize).
    /// Returns vectors in the same order as the input texts.
    /// Empty/whitespace-only inputs produce empty vectors at their respective index.
    func embedBatch(texts: [String]) async throws -> [[Double]] {
        guard !texts.isEmpty else { return [] }

        let cleaned = texts.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }

        // Build index map: which cleaned texts are non-empty and need embedding
        var nonEmptyIndices: [Int] = []
        var nonEmptyTexts: [String] = []
        for (index, text) in cleaned.enumerated() {
            if !text.isEmpty {
                nonEmptyIndices.append(index)
                nonEmptyTexts.append(text)
            }
        }

        guard !nonEmptyTexts.isEmpty else {
            return Array(repeating: [], count: texts.count)
        }

        // Batch into chunks of batchSize and call API
        var allEmbeddings: [(index: Int, vector: [Double])] = []

        for batchStart in stride(from: 0, to: nonEmptyTexts.count, by: batchSize) {
            let batchEnd = min(batchStart + batchSize, nonEmptyTexts.count)
            let batchTexts = Array(nonEmptyTexts[batchStart..<batchEnd])
            let batchOriginalIndices = Array(nonEmptyIndices[batchStart..<batchEnd])

            let body: [String: Any] = [
                "input": batchTexts,
                "model": Constants.AI.embeddingModel
            ]

            let data = try await AIProxyClient.shared.request(
                provider: .openai,
                endpoint: "/v1/embeddings",
                body: body
            )

            let payload = try JSONDecoder().decode(EmbeddingsResponse.self, from: data)

            // OpenAI returns embeddings sorted by `index` field
            let sorted = payload.data.sorted { $0.index < $1.index }
            for (batchOffset, datum) in sorted.enumerated() {
                let originalIndex = batchOriginalIndices[batchOffset]
                allEmbeddings.append((index: originalIndex, vector: datum.embedding))
            }
        }

        // Reconstruct result array in original order
        var result = Array(repeating: [Double](), count: texts.count)
        for entry in allEmbeddings {
            result[entry.index] = entry.vector
        }
        return result
    }
}

// MARK: - Response Models

private struct EmbeddingsResponse: Decodable {
    let data: [EmbeddingsDatum]
}

private struct EmbeddingsDatum: Decodable {
    let embedding: [Double]
    let index: Int

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        embedding = try container.decode([Double].self, forKey: .embedding)
        index = try container.decodeIfPresent(Int.self, forKey: .index) ?? 0
    }

    private enum CodingKeys: String, CodingKey {
        case embedding, index
    }
}
