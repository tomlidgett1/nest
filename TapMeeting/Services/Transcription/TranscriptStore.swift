import Foundation

/// In-memory store for live transcript during an active meeting.
///
/// Uses `LiveUtterance` (a plain struct) instead of SwiftData's `@Model Utterance`
/// to avoid threading crashes. Converted to persisted `Utterance` objects when
/// the meeting ends via `NoteRepository.saveTranscript`.
///
/// # Echo Cancellation Strategy
///
/// When speakers are on, the microphone picks up the remote participant's
/// voice playing through the speakers. Both the system audio stream and
/// the mic stream will produce transcripts for the same speech.
///
/// We solve this with **asymmetric buffered deduplication**:
///
/// 1. **System audio is authoritative.** Results from system audio are
///    committed immediately — they're a clean digital capture.
///
/// 2. **Mic results are held in a buffer** for `micBufferDelay` seconds.
///    During that window, if a matching system audio result arrives, the
///    buffered mic result is discarded (it was echo).
///
/// 3. **After the delay**, if no system match arrived, the mic result is
///    committed — it was genuinely the local user speaking.
///
/// 4. **Retroactive cleanup.** When a system result arrives, we also scan
///    already-committed utterances and remove any recent mic duplicates.
@Observable
final class TranscriptStore {
    
    /// All committed utterances (plain structs, thread-safe).
    private(set) var allUtterances: [LiveUtterance] = []
    
    /// The current interim (non-final) result, if any. Updated rapidly.
    var interimResult: TranscriptionResult?
    
    /// Most recent utterances for display, limited for performance.
    var recentUtterances: [LiveUtterance] {
        Array(allUtterances.suffix(100))
    }
    
    /// Total utterance count.
    var utteranceCount: Int { allUtterances.count }
    
    // MARK: - Echo Dedup Configuration
    
    private let micBufferDelay: TimeInterval = 2.0
    private let dedupeWindowSeconds: TimeInterval = 5.0
    
    /// Buffered mic results waiting to be committed or discarded.
    private var pendingMicResults: [PendingResult] = []
    
    /// Debug counter for deduped echoes.
    var debugEchoesDeduped = 0
    
    // MARK: - Adding Results
    
    func addFinalResult(_ result: TranscriptionResult) {
        switch result.source {
        case .system:
            addSystemResult(result)
        case .mic:
            bufferMicResult(result)
        }
    }
    
    func updateInterim(_ result: TranscriptionResult) {
        interimResult = result
    }
    
    func clear() {
        allUtterances.removeAll()
        pendingMicResults.removeAll()
        interimResult = nil
        debugEchoesDeduped = 0
    }
    
    // MARK: - System Audio (Authoritative)
    
    private func addSystemResult(_ result: TranscriptionResult) {
        let utterance = LiveUtterance(from: result)
        allUtterances.append(utterance)
        interimResult = nil
        
        // Purge pending mic echoes.
        let beforeCount = pendingMicResults.count
        pendingMicResults.removeAll { pending in
            isEchoDuplicate(pending.result, of: result)
        }
        let pendingPurged = beforeCount - pendingMicResults.count
        
        // Retroactively remove committed mic echoes.
        let committedBefore = allUtterances.count
        allUtterances.removeAll { existing in
            existing.source == .mic &&
            isEchoDuplicate(existing, of: result)
        }
        let committedPurged = committedBefore - allUtterances.count
        
        let totalPurged = pendingPurged + committedPurged
        if totalPurged > 0 {
            debugEchoesDeduped += totalPurged
            print("[TranscriptStore] 🔇 Deduped \(totalPurged) mic echo(es) matching system: \"\(result.text.prefix(50))\"")
        }
    }
    
    // MARK: - Mic Audio (Buffered)
    
    private func bufferMicResult(_ result: TranscriptionResult) {
        if matchesRecentSystemUtterance(result) {
            debugEchoesDeduped += 1
            print("[TranscriptStore] 🔇 Mic echo (immediate match): \"\(result.text.prefix(50))\"")
            return
        }
        
        let pending = PendingResult(result: result, bufferedAt: Date.now)
        pendingMicResults.append(pending)
        
        let id = pending.id
        DispatchQueue.main.asyncAfter(deadline: .now() + micBufferDelay) { [weak self] in
            self?.commitPendingMicResult(id: id)
        }
    }
    
    private func commitPendingMicResult(id: UUID) {
        guard let index = pendingMicResults.firstIndex(where: { $0.id == id }) else {
            return
        }
        
        let pending = pendingMicResults.remove(at: index)
        
        if matchesRecentSystemUtterance(pending.result) {
            debugEchoesDeduped += 1
            print("[TranscriptStore] 🔇 Mic echo (post-buffer match): \"\(pending.result.text.prefix(50))\"")
            return
        }
        
        let utterance = LiveUtterance(from: pending.result)
        allUtterances.append(utterance)
        interimResult = nil
    }
    
    // MARK: - Similarity Matching
    
    private func matchesRecentSystemUtterance(_ result: TranscriptionResult) -> Bool {
        let recent = allUtterances.suffix(15)
        for existing in recent {
            guard existing.source == .system else { continue }
            if isEchoDuplicate(result, of: existing) {
                return true
            }
        }
        return false
    }
    
    private func isEchoDuplicate(_ candidate: TranscriptionResult, of reference: TranscriptionResult) -> Bool {
        guard isTimeAligned(
            candidateStart: candidate.startTime,
            candidateEnd: candidate.endTime,
            referenceStart: reference.startTime,
            referenceEnd: reference.endTime
        ) else { return false }
        return textLikelyEcho(candidate.text, reference.text)
    }
    
    private func isEchoDuplicate(_ candidate: LiveUtterance, of reference: TranscriptionResult) -> Bool {
        guard isTimeAligned(
            candidateStart: candidate.startTime,
            candidateEnd: candidate.endTime,
            referenceStart: reference.startTime,
            referenceEnd: reference.endTime
        ) else { return false }
        return textLikelyEcho(candidate.text, reference.text)
    }
    
    private func isEchoDuplicate(_ candidate: TranscriptionResult, of reference: LiveUtterance) -> Bool {
        guard isTimeAligned(
            candidateStart: candidate.startTime,
            candidateEnd: candidate.endTime,
            referenceStart: reference.startTime,
            referenceEnd: reference.endTime
        ) else { return false }
        return textLikelyEcho(candidate.text, reference.text)
    }
    
    private func isTimeAligned(
        candidateStart: Date,
        candidateEnd: Date,
        referenceStart: Date,
        referenceEnd: Date
    ) -> Bool {
        let startDelta = abs(candidateStart.timeIntervalSince(referenceStart))
        let endDelta = abs(candidateEnd.timeIntervalSince(referenceEnd))
        if startDelta < dedupeWindowSeconds || endDelta < dedupeWindowSeconds {
            return true
        }
        
        let overlaps = candidateStart <= referenceEnd && referenceStart <= candidateEnd
        return overlaps
    }
    
    private func textLikelyEcho(_ a: String, _ b: String) -> Bool {
        let normalA = normalisedText(a)
        let normalB = normalisedText(b)
        guard !normalA.isEmpty, !normalB.isEmpty else { return false }
        
        // Strong signal: one phrase contains the other.
        if normalA.count >= 12 && normalB.count >= 12 &&
            (normalA.contains(normalB) || normalB.contains(normalA)) {
            return true
        }
        
        let wordsA = Set(normalA.split(separator: " "))
        let wordsB = Set(normalB.split(separator: " "))
        guard !wordsA.isEmpty, !wordsB.isEmpty else { return false }
        
        let overlap = wordsA.intersection(wordsB).count
        let smaller = min(wordsA.count, wordsB.count)
        guard smaller > 0 else { return false }
        
        let ratio = Double(overlap) / Double(smaller)
        return ratio >= overlapThreshold(forWordCount: smaller)
    }
    
    private func overlapThreshold(forWordCount count: Int) -> Double {
        switch count {
        case ..<3: return 1.0
        case 3...4: return 0.8
        case 5...7: return 0.7
        case 8...12: return 0.6
        default: return 0.5
        }
    }
    
    private func normalisedText(_ text: String) -> String {
        let lower = text.lowercased()
        let cleaned = lower.replacingOccurrences(
            of: "[^a-z0-9\\s]",
            with: " ",
            options: .regularExpression
        )
        return cleaned
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
    
    // MARK: - Queries
    
    var fullTranscriptText: String {
        allUtterances.map { utterance in
            let label = utterance.source.displayLabel
            return "[\(label)] \(utterance.text)"
        }.joined(separator: "\n")
    }
    
    /// Transcript text filtered to the last N seconds.
    func transcriptText(lastSeconds seconds: TimeInterval) -> String {
        let cutoff = Date.now.addingTimeInterval(-seconds)
        return allUtterances
            .filter { $0.endTime >= cutoff }
            .map { "[\($0.source.displayLabel)] \($0.text)" }
            .joined(separator: "\n")
    }
    
    var silenceDuration: TimeInterval {
        guard let lastEnd = allUtterances.last?.endTime else { return 0 }
        return Date.now.timeIntervalSince(lastEnd)
    }
}

// MARK: - Supporting Types

private struct PendingResult: Identifiable {
    let id = UUID()
    let result: TranscriptionResult
    let bufferedAt: Date
}
