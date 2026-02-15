import Foundation

@Observable
final class SearchTelemetryService {
    private(set) var events: [SearchTelemetryEvent] = []

    func track(event: String, fields: [String: String] = [:]) {
        let value = SearchTelemetryEvent(name: event, fields: fields, timestamp: Date.now)
        events.append(value)
        if events.count > 500 {
            events.removeFirst(events.count - 500)
        }
        print("[SearchTelemetry] \(event): \(fields)")
    }
}

struct SearchTelemetryEvent: Identifiable {
    let id = UUID()
    let name: String
    let fields: [String: String]
    let timestamp: Date
}
