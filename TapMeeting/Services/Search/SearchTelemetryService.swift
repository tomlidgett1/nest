import Foundation

// MARK: - Telemetry Service

@Observable
final class SearchTelemetryService {

    // MARK: - Structured Event Stores

    private(set) var events: [SearchTelemetryEvent] = []
    private(set) var ingestionEvents: [IngestionEvent] = []
    private(set) var queryEvents: [QueryEvent] = []
    private(set) var pipelineErrors: [PipelineError] = []

    /// Live counts refreshed by ingestion service.
    var indexCounts: IndexCounts = .empty

    private let maxEvents = 500
    private let maxStructured = 200

    // MARK: - Generic Event

    func track(event: String, fields: [String: String] = [:]) {
        let value = SearchTelemetryEvent(name: event, fields: fields, timestamp: .now)
        events.append(value)
        if events.count > maxEvents { events.removeFirst(events.count - maxEvents) }
    }

    // MARK: - Ingestion

    func recordIngestion(_ event: IngestionEvent) {
        ingestionEvents.append(event)
        if ingestionEvents.count > maxStructured {
            ingestionEvents.removeFirst(ingestionEvents.count - maxStructured)
        }
        track(event: "ingestion_\(event.error == nil ? "success" : "error")", fields: [
            "source_type": event.sourceType,
            "source_id": event.sourceId,
            "chunks": "\(event.chunksCreated)",
            "latency_ms": "\(event.latencyMs)"
        ])
    }

    // MARK: - Query

    func recordQuery(_ event: QueryEvent) {
        queryEvents.append(event)
        if queryEvents.count > maxStructured {
            queryEvents.removeFirst(queryEvents.count - maxStructured)
        }
        track(event: "query_\(event.didRefuse ? "refused" : "success")", fields: [
            "query": String(event.rawQuery.prefix(80)),
            "results": "\(event.resultCount)",
            "evidence": "\(event.evidenceBlockCount)",
            "search_ms": "\(event.searchLatencyMs)",
            "llm_ms": "\(event.llmLatencyMs)"
        ])
    }

    // MARK: - Errors

    func recordError(component: String, message: String, context: [String: String] = [:]) {
        let error = PipelineError(
            timestamp: .now,
            component: component,
            message: message,
            context: context
        )
        pipelineErrors.append(error)
        if pipelineErrors.count > maxStructured {
            pipelineErrors.removeFirst(pipelineErrors.count - maxStructured)
        }
        track(event: "pipeline_error", fields: context.merging(
            ["component": component, "message": String(message.prefix(200))],
            uniquingKeysWith: { _, new in new }
        ))
    }

    // MARK: - Counts

    func updateIndexCounts(_ counts: IndexCounts) {
        indexCounts = counts
    }

    // MARK: - Reset

    func clearAll() {
        events.removeAll()
        ingestionEvents.removeAll()
        queryEvents.removeAll()
        pipelineErrors.removeAll()
        indexCounts = .empty
    }
}

// MARK: - Event Types

struct SearchTelemetryEvent: Identifiable {
    let id = UUID()
    let name: String
    let fields: [String: String]
    let timestamp: Date
}

struct IngestionEvent: Identifiable {
    let id = UUID()
    let timestamp: Date
    let sourceType: String
    let sourceId: String
    let title: String
    let chunksCreated: Int
    let embeddingsGenerated: Int
    let embeddingsCached: Int
    let latencyMs: Int
    let chunkPreviews: [String]
    let documentIds: [UUID]
    let error: String?
}

struct QueryResultEntry: Identifiable {
    let id = UUID()
    let documentId: UUID
    let sourceType: String
    let sourceId: String
    let title: String?
    let semanticScore: Double
    let lexicalScore: Double
    let fusedScore: Double
    let chunkPreview: String
    let wasSelectedAsEvidence: Bool
}

struct EvidenceBlockEntry: Identifiable {
    let id = UUID()
    let index: Int
    let sourceType: String
    let title: String
    let text: String
    let characterCount: Int
}

struct QueryEvent: Identifiable {
    let id = UUID()
    let timestamp: Date
    let rawQuery: String
    let enrichedQuery: String?
    let subQueries: [String]
    let embeddingLatencyMs: Int
    let searchLatencyMs: Int
    let resultCount: Int
    let results: [QueryResultEntry]
    let evidenceBlockCount: Int
    let evidenceBlocks: [EvidenceBlockEntry]
    let llmModel: String
    let llmInputTokenEstimate: Int
    let llmLatencyMs: Int
    let responsePreview: String
    let didRefuse: Bool
    let fallbackUsed: Bool
    let retrievalRounds: Int
    /// Sources identified by the orchestration planner (e.g. ["notes", "transcripts", "calendar"])
    var queryPlanSources: [String] = []
    /// Intent classified by the planner (e.g. "summarise", "find", "draft")
    var queryPlanIntent: String?
}

struct PipelineError: Identifiable {
    let id = UUID()
    let timestamp: Date
    let component: String
    let message: String
    let context: [String: String]
}

struct IndexCounts: Equatable {
    let totalDocuments: Int
    let totalEmbeddings: Int
    let bySourceType: [String: Int]
    let lastUpdated: Date

    static let empty = IndexCounts(
        totalDocuments: 0,
        totalEmbeddings: 0,
        bySourceType: [:],
        lastUpdated: .distantPast
    )
}
