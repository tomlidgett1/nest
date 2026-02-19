import SwiftUI

// MARK: - Main Dashboard

struct RAGPipelineDashboardView: View {
    @Environment(AppState.self) private var appState
    @Binding var isSidebarCollapsed: Bool
    @State private var selectedSection: DashboardSection = .overview
    @State private var expandedQueryId: UUID?
    @State private var expandedIngestionId: UUID?
    @State private var isReindexing = false
    @State private var copiedId: String?
    @State private var selectedBackfillAccountIds: Set<String> = {
        Set(UserDefaults.standard.stringArray(forKey: Constants.Defaults.backfillEmailAccountIds) ?? [])
    }()
    @State private var backfillEmailDays: Int = {
        let stored = UserDefaults.standard.integer(forKey: Constants.Defaults.backfillEmailDays)
        return stored > 0 ? stored : Constants.Backfill.defaultEmailDays
    }()

    enum DashboardSection: String, CaseIterable {
        case overview = "Overview"
        case ingestion = "Ingestion Log"
        case queries = "Query Inspector"
        case errors = "Error Log"
        case config = "Configuration"
    }

    private var telemetry: SearchTelemetryService { appState.searchTelemetryService }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().foregroundColor(Theme.divider)
            tabs
            Divider().foregroundColor(Theme.divider)

            ScrollView {
                VStack(spacing: 16) {
                    switch selectedSection {
                    case .overview: overviewSection
                    case .ingestion: ingestionSection
                    case .queries: queryInspectorSection
                    case .errors: errorLogSection
                    case .config: configSection
                    }
                }
                .padding(Theme.Spacing.contentPadding)
            }
        }
        .background(Theme.background)
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            if isSidebarCollapsed {
                Button { withAnimation(.spring(response: 0.3)) { isSidebarCollapsed = false } } label: {
                    Image(systemName: "sidebar.left")
                        .font(.system(size: 14))
                        .foregroundColor(Theme.textTertiary)
                }
                .buttonStyle(.plain)
            }

            Image(systemName: "chart.bar.doc.horizontal")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(Theme.olive)

            Text("RAG Pipeline")
                .font(Theme.headingFont(17))
                .foregroundColor(Theme.textPrimary)

            Spacer()

            backfillBadge

            Button {
                isReindexing = true
                Task {
                    await appState.triggerFullReindex()
                    isReindexing = false
                }
            } label: {
                HStack(spacing: 5) {
                    if isReindexing {
                        ProgressView().controlSize(.mini)
                    } else {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 11))
                    }
                    Text("Re-index All")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(Theme.textSecondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.white)
                .cornerRadius(6)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.divider, lineWidth: 0.5))
            }
            .buttonStyle(.plain)
            .disabled(isReindexing)
        }
        .padding(.horizontal, Theme.Spacing.contentPadding)
        .padding(.vertical, 14)
    }

    @ViewBuilder
    private var backfillBadge: some View {
        let stage = appState.searchIngestionService?.backfillStatus.stage ?? .idle
        HStack(spacing: 5) {
            Circle()
                .fill(stage == .completed ? Color.green.opacity(0.7) :
                      stage == .indexing ? Color.orange.opacity(0.7) :
                      stage == .failed ? Theme.recording.opacity(0.7) :
                      Theme.textQuaternary)
                .frame(width: 7, height: 7)
            Text(stage.rawValue.capitalized)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(Theme.textSecondary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color.white)
        .cornerRadius(6)
    }

    // MARK: - Tabs

    private var tabs: some View {
        HStack(spacing: 0) {
            ForEach(DashboardSection.allCases, id: \.self) { section in
                Button {
                    withAnimation(.easeOut(duration: 0.15)) { selectedSection = section }
                } label: {
                    HStack(spacing: 5) {
                        Text(section.rawValue)
                            .font(.system(size: 12, weight: selectedSection == section ? .semibold : .regular))
                            .foregroundColor(selectedSection == section ? Theme.textPrimary : Theme.textTertiary)

                        if section == .errors && !telemetry.pipelineErrors.isEmpty {
                            Text("\(telemetry.pipelineErrors.count)")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Theme.recording.opacity(0.8))
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(selectedSection == section ? Color.white : .clear)
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.contentPadding)
        .padding(.vertical, 6)
        .background(Theme.background.opacity(0.5))
    }

    // MARK: - Section: Overview

    private var overviewSection: some View {
        VStack(spacing: 16) {
            // Stats row
            LazyVGrid(columns: [
                GridItem(.flexible()), GridItem(.flexible()),
                GridItem(.flexible()), GridItem(.flexible())
            ], spacing: 12) {
                statCard("Documents", value: "\(telemetry.indexCounts.totalDocuments)", icon: "doc.text")
                statCard("Embeddings", value: "\(telemetry.indexCounts.totalEmbeddings)", icon: "cube")
                statCard("Queries", value: "\(telemetry.queryEvents.count)", icon: "magnifyingglass")
                statCard("Errors", value: "\(telemetry.pipelineErrors.count)", icon: "exclamationmark.triangle",
                         isError: !telemetry.pipelineErrors.isEmpty)
            }

            // Source type breakdown
            dashboardCard("Index by Source Type") {
                if telemetry.indexCounts.bySourceType.isEmpty {
                    Text("No data indexed yet")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.textTertiary)
                        .padding(.vertical, 8)
                } else {
                    ForEach(telemetry.indexCounts.bySourceType.sorted(by: { $0.value > $1.value }), id: \.key) { type, count in
                        HStack {
                            Image(systemName: iconForSourceType(type))
                                .font(.system(size: 11))
                                .foregroundColor(Theme.textTertiary)
                                .frame(width: 16)
                            Text(SearchSourceType(rawValue: type)?.displayName ?? type)
                                .font(.system(size: 12))
                                .foregroundColor(Theme.textPrimary)
                            Spacer()
                            Text("\(count)")
                                .font(.system(size: 12, weight: .semibold, design: .rounded))
                                .foregroundColor(Theme.textSecondary)
                        }
                        .padding(.vertical, 3)
                    }
                }
            }

            // Backfill status
            dashboardCard("Backfill Status") {
                let status = appState.searchIngestionService?.backfillStatus ?? .idle
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Stage")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.textTertiary)
                        Spacer()
                        Text(status.stage.rawValue.capitalized)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Theme.textPrimary)
                    }
                    if status.stage == .indexing {
                        ProgressView(value: status.progressPercent, total: 100)
                            .tint(Theme.olive)
                        HStack {
                            Text("\(status.processedCount) / \(status.totalCount)")
                                .font(.system(size: 10))
                                .foregroundColor(Theme.textTertiary)
                            Spacer()
                            Text("\(Int(status.progressPercent))%")
                                .font(.system(size: 10, weight: .medium, design: .rounded))
                                .foregroundColor(Theme.textSecondary)
                        }
                    }
                    if let error = status.lastError {
                        Text(error)
                            .font(.system(size: 10))
                            .foregroundColor(Theme.recording)
                            .lineLimit(2)
                    }
                }
            }

            // Recent activity
            dashboardCard("Recent Activity") {
                let recent = telemetry.events.suffix(10).reversed()
                if recent.isEmpty {
                    Text("No events recorded yet")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.textTertiary)
                        .padding(.vertical, 8)
                } else {
                    ForEach(Array(recent)) { event in
                        HStack(alignment: .top, spacing: 8) {
                            Text(shortTime(event.timestamp))
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(Theme.textQuaternary)
                                .frame(width: 50, alignment: .trailing)
                            Text(event.name)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(Theme.textPrimary)
                            Spacer()
                            Text(event.fields.map { "\($0.key)=\($0.value)" }.joined(separator: " "))
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(Theme.textTertiary)
                                .lineLimit(1)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
    }

    // MARK: - Section: Ingestion Log

    private var ingestionSection: some View {
        VStack(spacing: 12) {
            if telemetry.ingestionEvents.isEmpty {
                emptyStateCard("No ingestion events recorded yet", icon: "doc.badge.plus")
            } else {
                ForEach(telemetry.ingestionEvents.reversed()) { event in
                    let isExpanded = expandedIngestionId == event.id
                    dashboardCard(event.title) {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 12) {
                                label("Source", value: event.sourceType)
                                label("Chunks", value: "\(event.chunksCreated)")
                                label("Embeddings", value: "\(event.embeddingsGenerated)")
                                label("Latency", value: "\(event.latencyMs)ms")
                                Spacer()
                                statusDot(event.error == nil)
                                Text(shortTime(event.timestamp))
                                    .font(.system(size: 9, design: .monospaced))
                                    .foregroundColor(Theme.textQuaternary)
                            }

                            if let error = event.error {
                                HStack(spacing: 6) {
                                    Text("Error: \(error)")
                                        .font(.system(size: 10))
                                        .foregroundColor(Theme.recording)
                                        .textSelection(.enabled)
                                    copyButton("ingest_\(event.id.uuidString)") { error }
                                }
                            }

                            Button {
                                withAnimation(.easeOut(duration: 0.15)) {
                                    expandedIngestionId = isExpanded ? nil : event.id
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                                        .font(.system(size: 8))
                                    Text(isExpanded ? "Hide chunks" : "Show \(event.chunkPreviews.count) chunks")
                                        .font(.system(size: 10))
                                }
                                .foregroundColor(Theme.olive)
                            }
                            .buttonStyle(.plain)

                            if isExpanded {
                                VStack(alignment: .leading, spacing: 4) {
                                    ForEach(Array(event.chunkPreviews.enumerated()), id: \.offset) { i, preview in
                                        HStack(alignment: .top, spacing: 6) {
                                            Text("[\(i)]")
                                                .font(.system(size: 9, weight: .medium, design: .monospaced))
                                                .foregroundColor(Theme.textQuaternary)
                                                .frame(width: 24, alignment: .trailing)
                                            Text(preview)
                                                .font(.system(size: 10))
                                                .foregroundColor(Theme.textSecondary)
                                                .lineLimit(3)
                                        }
                                    }
                                    if !event.documentIds.isEmpty {
                                        Text("Doc IDs: \(event.documentIds.map { $0.uuidString.prefix(8) }.joined(separator: ", "))")
                                            .font(.system(size: 9, design: .monospaced))
                                            .foregroundColor(Theme.textQuaternary)
                                            .padding(.top, 4)
                                    }
                                }
                                .padding(.top, 4)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Section: Query Inspector

    private var queryInspectorSection: some View {
        VStack(spacing: 12) {
            if telemetry.queryEvents.isEmpty {
                emptyStateCard("No queries recorded yet. Ask Nest a question to see the full trace.", icon: "magnifyingglass")
            } else {
                ForEach(telemetry.queryEvents.reversed()) { event in
                    let isExpanded = expandedQueryId == event.id
                    queryCard(event, isExpanded: isExpanded)
                }
            }
        }
    }

    private func queryCard(_ event: QueryEvent, isExpanded: Bool) -> some View {
        dashboardCard(event.rawQuery) {
            VStack(alignment: .leading, spacing: 8) {
                // Summary row
                HStack(spacing: 12) {
                    label("Results", value: "\(event.resultCount)")
                    label("Evidence", value: "\(event.evidenceBlockCount)")
                    label("Search", value: "\(event.searchLatencyMs)ms")
                    label("LLM", value: "\(event.llmLatencyMs)ms")
                    Spacer()
                    if event.didRefuse {
                        Text("REFUSED")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(Theme.recording)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Theme.recording.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    } else {
                        Text("OK")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.green.opacity(0.8))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.green.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                    Text(shortTime(event.timestamp))
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(Theme.textQuaternary)
                }

                if let enriched = event.enrichedQuery {
                    HStack(alignment: .top) {
                        Text("Enriched:")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(Theme.textTertiary)
                        Text(enriched)
                            .font(.system(size: 10))
                            .foregroundColor(Theme.textSecondary)
                            .lineLimit(2)
                    }
                }

                if !event.queryPlanSources.isEmpty {
                    HStack(alignment: .top) {
                        Text("Planner:")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(Theme.textTertiary)
                        Text(event.queryPlanSources.joined(separator: ", "))
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.purple)
                        if let intent = event.queryPlanIntent {
                            Text("→ \(intent)")
                                .font(.system(size: 10))
                                .foregroundColor(Theme.textTertiary)
                        }
                    }
                }

                if event.subQueries.count > 1 {
                    HStack(alignment: .top) {
                        Text("Sub-queries:")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(Theme.textTertiary)
                        Text(event.subQueries.joined(separator: " | "))
                            .font(.system(size: 10))
                            .foregroundColor(Theme.textSecondary)
                            .lineLimit(2)
                    }
                }

                // Expand / Copy buttons
                HStack(spacing: 8) {
                    Button {
                        withAnimation(.easeOut(duration: 0.15)) {
                            expandedQueryId = isExpanded ? nil : event.id
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                                .font(.system(size: 8))
                            Text(isExpanded ? "Hide details" : "Show full trace")
                                .font(.system(size: 10))
                        }
                        .foregroundColor(Theme.olive)
                    }
                    .buttonStyle(.plain)

                    copyButton("query_\(event.id.uuidString)", label: "Copy Trace") { formatQueryForCopy(event) }
                }

                if isExpanded {
                    expandedQueryDetails(event)
                }
            }
        }
    }

    @ViewBuilder
    private func expandedQueryDetails(_ event: QueryEvent) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider()

            // Results table
            Text("Search Results (\(event.results.count))")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Theme.textPrimary)

            ForEach(event.results) { result in
                HStack(alignment: .top, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 4) {
                            Text(result.sourceType)
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(Theme.textTertiary)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Theme.background)
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                            if result.wasSelectedAsEvidence {
                                Text("EVIDENCE")
                                    .font(.system(size: 8, weight: .bold))
                                    .foregroundColor(Theme.olive)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(Theme.oliveFaint)
                                    .clipShape(RoundedRectangle(cornerRadius: 3))
                            }
                        }
                        Text(result.title ?? "Untitled")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(Theme.textPrimary)
                            .lineLimit(1)
                        Text(result.chunkPreview)
                            .font(.system(size: 9))
                            .foregroundColor(Theme.textTertiary)
                            .lineLimit(2)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        HStack(spacing: 4) {
                            Text("S:")
                                .font(.system(size: 8))
                                .foregroundColor(Theme.textQuaternary)
                            Text(String(format: "%.2f", result.semanticScore))
                                .font(.system(size: 9, weight: .medium, design: .monospaced))
                                .foregroundColor(scoreColour(result.semanticScore))
                        }
                        HStack(spacing: 4) {
                            Text("L:")
                                .font(.system(size: 8))
                                .foregroundColor(Theme.textQuaternary)
                            Text(String(format: "%.3f", result.lexicalScore))
                                .font(.system(size: 9, weight: .medium, design: .monospaced))
                                .foregroundColor(Theme.textSecondary)
                        }
                        HStack(spacing: 4) {
                            Text("F:")
                                .font(.system(size: 8))
                                .foregroundColor(Theme.textQuaternary)
                            Text(String(format: "%.4f", result.fusedScore))
                                .font(.system(size: 9, weight: .bold, design: .monospaced))
                                .foregroundColor(Theme.textPrimary)
                        }
                    }
                }
                .padding(.vertical, 4)
                Divider().opacity(0.5)
            }

            // Evidence blocks
            if !event.evidenceBlocks.isEmpty {
                Text("Evidence Sent to LLM (\(event.evidenceBlocks.count) blocks)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Theme.textPrimary)
                    .padding(.top, 4)

                ForEach(event.evidenceBlocks) { block in
                    HStack(alignment: .top, spacing: 6) {
                        Text("[\(block.index)]")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundColor(Theme.olive)
                            .frame(width: 28, alignment: .trailing)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(block.title)
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(Theme.textPrimary)
                                Spacer()
                                Text("\(block.characterCount) chars")
                                    .font(.system(size: 8, design: .monospaced))
                                    .foregroundColor(Theme.textQuaternary)
                            }
                            Text(block.text)
                                .font(.system(size: 9))
                                .foregroundColor(Theme.textTertiary)
                                .lineLimit(4)
                        }
                    }
                    .padding(.vertical, 3)
                }
            }

            // Metadata
            HStack(spacing: 16) {
                label("Model", value: event.llmModel.isEmpty ? "—" : event.llmModel)
                label("Input ~tokens", value: "\(event.llmInputTokenEstimate)")
                label("Rounds", value: "\(event.retrievalRounds)")
                if event.fallbackUsed {
                    Text("FALLBACK")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(.orange)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(Color.orange.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 3))
                }
            }
        }
        .padding(.top, 4)
    }

    // MARK: - Section: Error Log

    private var errorLogSection: some View {
        VStack(spacing: 12) {
            if telemetry.pipelineErrors.isEmpty {
                emptyStateCard("No pipeline errors — everything is running smoothly", icon: "checkmark.circle")
            } else {
                // Copy All button
                HStack {
                    Spacer()
                    copyButton("all_errors", label: "Copy All Errors") {
                        telemetry.pipelineErrors.reversed().map { formatErrorForCopy($0) }.joined(separator: "\n\n---\n\n")
                    }
                }

                ForEach(telemetry.pipelineErrors.reversed()) { error in
                    dashboardCard(error.component.capitalized) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 10))
                                    .foregroundColor(Theme.recording)
                                Text(error.message)
                                    .font(.system(size: 11))
                                    .foregroundColor(Theme.textPrimary)
                                    .textSelection(.enabled)
                                Spacer()
                                copyButton(error.id.uuidString) { formatErrorForCopy(error) }
                                Text(shortTime(error.timestamp))
                                    .font(.system(size: 9, design: .monospaced))
                                    .foregroundColor(Theme.textQuaternary)
                            }
                            if !error.context.isEmpty {
                                Text(error.context.map { "\($0.key): \($0.value)" }.joined(separator: " | "))
                                    .font(.system(size: 9, design: .monospaced))
                                    .foregroundColor(Theme.textTertiary)
                                    .textSelection(.enabled)
                            }
                        }
                    }
                }
            }
        }
    }

    private func formatQueryForCopy(_ event: QueryEvent) -> String {
        var lines: [String] = [
            "=== Query Trace ===",
            "Time: \(shortTime(event.timestamp))",
            "Raw query: \(event.rawQuery)",
        ]
        if let enriched = event.enrichedQuery {
            lines.append("Enriched: \(enriched)")
        }
        if !event.queryPlanSources.isEmpty {
            lines.append("Planner sources: \(event.queryPlanSources.joined(separator: ", "))")
            if let intent = event.queryPlanIntent {
                lines.append("Planner intent: \(intent)")
            }
        }
        if event.subQueries.count > 1 {
            lines.append("Sub-queries: \(event.subQueries.joined(separator: " | "))")
        }
        lines.append("Results: \(event.resultCount) | Evidence: \(event.evidenceBlockCount)")
        lines.append("Search latency: \(event.searchLatencyMs)ms | LLM latency: \(event.llmLatencyMs)ms")
        lines.append("Model: \(event.llmModel) | ~tokens: \(event.llmInputTokenEstimate)")
        lines.append("Rounds: \(event.retrievalRounds) | Fallback: \(event.fallbackUsed) | Refused: \(event.didRefuse)")

        if !event.results.isEmpty {
            lines.append("\n--- Search Results ---")
            for r in event.results {
                let evidence = r.wasSelectedAsEvidence ? " [EVIDENCE]" : ""
                lines.append("  [\(r.sourceType)] \(r.title ?? "Untitled")\(evidence)  S:\(String(format: "%.2f", r.semanticScore))  L:\(String(format: "%.3f", r.lexicalScore))  F:\(String(format: "%.4f", r.fusedScore))")
                lines.append("    \(r.chunkPreview)")
            }
        }

        if !event.evidenceBlocks.isEmpty {
            lines.append("\n--- Evidence Blocks ---")
            for b in event.evidenceBlocks {
                lines.append("  [\(b.index)] \(b.title) (\(b.characterCount) chars)")
                lines.append("    \(b.text.prefix(300))")
            }
        }

        return lines.joined(separator: "\n")
    }

    private func formatErrorForCopy(_ error: PipelineError) -> String {
        var lines = [
            "[\(shortTime(error.timestamp))] \(error.component.capitalized)",
            "Message: \(error.message)"
        ]
        if !error.context.isEmpty {
            lines.append("Context: \(error.context.map { "\($0.key): \($0.value)" }.joined(separator: " | "))")
        }
        return lines.joined(separator: "\n")
    }

    // MARK: - Section: Configuration

    private var configSection: some View {
        VStack(spacing: 12) {
            // Email Backfill Scope
            emailBackfillScopeCard

            dashboardCard("Chunking") {
                configRow("Strategy", current: "Sentence-aware + overlap")
                configRow("Chunk size", current: "\(Constants.Search.maxChunkCharacters) chars")
                configRow("Overlap", current: "\(Constants.Search.chunkOverlapCharacters) chars")
                configRow("Max chunks/source", current: "\(Constants.Search.maxChunksPerSource)")
                configRow("Chunking version", current: Constants.Search.chunkingVersion)
            }

            dashboardCard("Embedding") {
                configRow("Model", current: Constants.AI.embeddingModel)
                configRow("Dimensions", current: "3072")
                configRow("Batching", current: "Enabled (64/batch)")
            }

            dashboardCard("Search") {
                configRow("Index type", current: "HNSW (m=16, ef=200)")
                configRow("Score fusion", current: "Reciprocal Rank Fusion (k=\(Constants.Search.rrfK))")
                configRow("Time decay", current: "0.3% per day")
                configRow("Max results", current: "\(Constants.Search.maxSearchResults)")
                configRow("Min semantic score", current: "0.40")
                configRow("Lexical search", current: "Stored tsvector + GIN")
            }

            dashboardCard("Generation") {
                configRow("LLM model", current: Constants.AI.semanticChatModel)
                configRow("Max tokens", current: "\(Constants.AI.maxSemanticAnswerTokens)")
                configRow("Evidence blocks", current: "\(Constants.Search.maxEvidenceBlocks)")
                configRow("Evidence block size", current: "\(Constants.Search.maxEvidenceBlockCharacters) chars")
                configRow("Query enrichment", current: "Conversation history")
                configRow("Multi-query", current: "Keyword extraction")
                configRow("MMR diversity", current: "Enabled")
            }
        }
    }

    // MARK: - Email Backfill Scope

    private var emailBackfillScopeCard: some View {
        dashboardCard("Email Backfill Scope") {
            VStack(alignment: .leading, spacing: 10) {
                Text("Select which email accounts to include in semantic indexing. Notes and meetings are always indexed.")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.textTertiary)

                let accounts = appState.gmailService.accounts
                if accounts.isEmpty {
                    Text("No email accounts connected")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textQuaternary)
                        .padding(.vertical, 4)
                } else {
                    VStack(spacing: 6) {
                        ForEach(accounts, id: \.id) { account in
                            let isSelected = selectedBackfillAccountIds.contains(account.id)
                            Button {
                                toggleBackfillAccount(account.id)
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                                        .font(.system(size: 14))
                                        .foregroundColor(isSelected ? Theme.olive : Theme.textQuaternary)

                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(account.email)
                                            .font(.system(size: 11, weight: .medium))
                                            .foregroundColor(Theme.textPrimary)
                                        Text(account.id == "supabase" ? "Primary account" : "Additional account")
                                            .font(.system(size: 9))
                                            .foregroundColor(Theme.textQuaternary)
                                    }

                                    Spacer()

                                    if isSelected {
                                        Text("Indexing")
                                            .font(.system(size: 9, weight: .medium))
                                            .foregroundColor(Theme.olive)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(Theme.oliveFaint)
                                            .clipShape(RoundedRectangle(cornerRadius: 4))
                                    } else {
                                        Text("Skipped")
                                            .font(.system(size: 9, weight: .medium))
                                            .foregroundColor(Theme.textQuaternary)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(Theme.background)
                                            .clipShape(RoundedRectangle(cornerRadius: 4))
                                    }
                                }
                                .padding(.vertical, 6)
                                .padding(.horizontal, 10)
                                .background(isSelected ? Theme.oliveFaint.opacity(0.3) : Color.clear)
                                .cornerRadius(8)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                Divider().opacity(0.5)

                // Email age limit
                HStack {
                    Text("Email history")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.textSecondary)
                    Spacer()
                    HStack(spacing: 4) {
                        Text("Last")
                            .font(.system(size: 10))
                            .foregroundColor(Theme.textTertiary)
                        TextField("", value: $backfillEmailDays, format: .number)
                            .textFieldStyle(.plain)
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundColor(Theme.textPrimary)
                            .frame(width: 36)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Theme.background)
                            .cornerRadius(4)
                            .onChange(of: backfillEmailDays) { _, newValue in
                                let clamped = max(1, min(365, newValue))
                                UserDefaults.standard.set(clamped, forKey: Constants.Defaults.backfillEmailDays)
                            }
                        Text("days")
                            .font(.system(size: 10))
                            .foregroundColor(Theme.textTertiary)
                    }
                }

                // Info text
                HStack(spacing: 4) {
                    Image(systemName: "info.circle")
                        .font(.system(size: 9))
                        .foregroundColor(Theme.textQuaternary)
                    Text("Notes, transcripts, and calendar events are always fully indexed regardless of these settings.")
                        .font(.system(size: 9))
                        .foregroundColor(Theme.textQuaternary)
                }
                .padding(.top, 2)
            }
        }
    }

    private func toggleBackfillAccount(_ accountId: String) {
        if selectedBackfillAccountIds.contains(accountId) {
            selectedBackfillAccountIds.remove(accountId)
        } else {
            selectedBackfillAccountIds.insert(accountId)
        }
        UserDefaults.standard.set(Array(selectedBackfillAccountIds), forKey: Constants.Defaults.backfillEmailAccountIds)
    }

    // MARK: - Reusable Components

    private func statCard(_ title: String, value: String, icon: String, isError: Bool = false) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(isError ? Theme.recording.opacity(0.7) : Theme.olive.opacity(0.6))
            Text(value)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundColor(isError ? Theme.recording : Theme.textPrimary)
            Text(title)
                .font(.system(size: 10))
                .foregroundColor(Theme.textTertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Color.white)
        .cornerRadius(10)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.divider.opacity(0.4), lineWidth: 0.5))
    }

    private func dashboardCard<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
                .lineLimit(1)
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .cornerRadius(10)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.divider.opacity(0.3), lineWidth: 0.5))
    }

    private func emptyStateCard(_ text: String, icon: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 24))
                .foregroundColor(Theme.textQuaternary)
            Text(text)
                .font(.system(size: 12))
                .foregroundColor(Theme.textTertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .background(Color.white)
        .cornerRadius(10)
    }

    private func label(_ key: String, value: String) -> some View {
        HStack(spacing: 3) {
            Text(key)
                .font(.system(size: 9))
                .foregroundColor(Theme.textQuaternary)
            Text(value)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(Theme.textSecondary)
        }
    }

    private func configRow(_ key: String, current: String) -> some View {
        HStack {
            Text(key)
                .font(.system(size: 11))
                .foregroundColor(Theme.textSecondary)
            Spacer()
            Text(current)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundColor(Theme.textPrimary)
        }
        .padding(.vertical, 2)
    }

    private func statusDot(_ isOk: Bool) -> some View {
        Circle()
            .fill(isOk ? Color.green.opacity(0.6) : Theme.recording.opacity(0.6))
            .frame(width: 6, height: 6)
    }

    // MARK: - Copy Helpers

    private func copyButton(_ id: String, label: String = "Copy", textProvider: @escaping () -> String) -> some View {
        Button {
            let text = textProvider()
            copyToClipboard(text)
            withAnimation(.easeOut(duration: 0.15)) { copiedId = id }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                withAnimation(.easeOut(duration: 0.15)) {
                    if copiedId == id { copiedId = nil }
                }
            }
        } label: {
            HStack(spacing: 3) {
                Image(systemName: copiedId == id ? "checkmark" : "doc.on.doc")
                    .font(.system(size: 9))
                Text(copiedId == id ? "Copied" : label)
                    .font(.system(size: 9, weight: .medium))
            }
            .foregroundColor(copiedId == id ? .green.opacity(0.8) : Theme.textTertiary)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(copiedId == id ? Color.green.opacity(0.06) : Theme.background.opacity(0.6))
            .cornerRadius(4)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(copiedId == id ? Color.green.opacity(0.2) : Theme.divider.opacity(0.4), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }

    private func copyToClipboard(_ text: String) {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #endif
    }

    // MARK: - Helpers

    private func shortTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: date)
    }

    private func scoreColour(_ score: Double) -> Color {
        if score >= 0.7 { return .green.opacity(0.8) }
        if score >= 0.5 { return .orange.opacity(0.8) }
        return Theme.recording.opacity(0.8)
    }

    private func iconForSourceType(_ type: String) -> String {
        switch type {
        case "note_summary", "note_chunk": return "doc.text"
        case "utterance_chunk": return "waveform"
        case "email_summary", "email_chunk": return "envelope"
        case "calendar_summary": return "calendar"
        default: return "doc"
        }
    }
}
