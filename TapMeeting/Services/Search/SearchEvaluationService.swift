import Foundation

struct SearchEvaluationCase {
    let query: String
    let minimumResults: Int
    let minimumCitations: Int
}

struct SearchEvaluationResult {
    let query: String
    let latencyMs: Int
    let resultCount: Int
    let citationCount: Int
    let passed: Bool
}

final class SearchEvaluationService {
    private let searchService: SemanticSearchService
    private let telemetry: SearchTelemetryService

    init(searchService: SemanticSearchService, telemetry: SearchTelemetryService) {
        self.searchService = searchService
        self.telemetry = telemetry
    }

    func run(cases: [SearchEvaluationCase]) async -> [SearchEvaluationResult] {
        var outputs: [SearchEvaluationResult] = []

        for value in cases {
            let start = Date()
            do {
                let response = try await searchService.search(query: value.query)
                let latency = Int(Date().timeIntervalSince(start) * 1000)
                let passed = response.results.count >= value.minimumResults
                    && response.citations.count >= value.minimumCitations
                let result = SearchEvaluationResult(
                    query: value.query,
                    latencyMs: latency,
                    resultCount: response.results.count,
                    citationCount: response.citations.count,
                    passed: passed
                )
                outputs.append(result)

                telemetry.track(event: "search_eval_case", fields: [
                    "query": value.query,
                    "latency_ms": "\(latency)",
                    "passed": "\(passed)"
                ])
            } catch {
                telemetry.track(event: "search_eval_case_failed", fields: [
                    "query": value.query,
                    "error": error.localizedDescription
                ])
                outputs.append(
                    SearchEvaluationResult(
                        query: value.query,
                        latencyMs: Int(Date().timeIntervalSince(start) * 1000),
                        resultCount: 0,
                        citationCount: 0,
                        passed: false
                    )
                )
            }
        }

        return outputs
    }
}
