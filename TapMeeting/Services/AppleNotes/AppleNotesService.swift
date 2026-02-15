import Foundation
import AppKit

/// Fetches notes from the macOS Apple Notes app using JavaScript for Automation (JXA).
///
/// The service runs `osascript -l JavaScript` to query the Notes scripting bridge,
/// parses the JSON output, and caches results in memory. Full note bodies are
/// fetched on demand to keep the initial load fast.
///
/// On first use macOS will prompt the user to grant Automation permission.
@Observable
final class AppleNotesService {
    
    // MARK: - Published State
    
    /// All fetched Apple Notes, sorted by modification date (newest first).
    var notes: [AppleNote] = []
    
    /// Whether a fetch is currently in progress.
    var isLoading = false
    
    /// Human-readable error from the last fetch attempt.
    var errorMessage: String?
    
    /// Timestamp of the last successful fetch.
    var lastFetchedAt: Date?
    
    // MARK: - Private
    
    /// Cached full-body content keyed by Apple Notes ID.
    private var bodyCache: [String: String] = [:]
    
    /// All unique folder names from the fetched notes.
    var folders: [String] {
        let names = Set(notes.map(\.folder))
        return names.sorted()
    }
    
    // MARK: - Fetch All Notes
    
    /// Fetch all notes from Apple Notes (metadata + snippet).
    /// Shows a system permission dialog on first call.
    @MainActor
    func fetchNotes() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        
        do {
            let fetched = try await runFetchNotesScript()
            notes = fetched.sorted { $0.modifiedAt > $1.modifiedAt }
            lastFetchedAt = Date.now
            bodyCache.removeAll()
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    // MARK: - Fetch Single Note Body
    
    /// Fetch the full plain-text body for a specific note, using cache when available.
    func fetchNoteBody(id: String) async -> String {
        if let cached = bodyCache[id] { return cached }
        
        do {
            let body = try await runFetchBodyScript(noteId: id)
            bodyCache[id] = body
            return body
        } catch {
            return "Could not load note content."
        }
    }
    
    // MARK: - Open in Apple Notes
    
    /// Open a specific note in the Apple Notes app.
    func openInAppleNotes(id: String) {
        let escapedId = id
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        
        let script = """
        tell application "Notes"
            show note id "\(escapedId)"
            activate
        end tell
        """
        
        var error: NSDictionary?
        if let appleScript = NSAppleScript(source: script) {
            appleScript.executeAndReturnError(&error)
        }
    }
    
    // MARK: - Save Note Body
    
    /// Save the plain-text body of an existing note back to Apple Notes.
    /// Converts plain text to basic HTML `<div>` elements.
    func saveNoteBody(id: String, plainText: String) async throws {
        let html = plainTextToHTML(plainText)
        let escapedId = escapeForJS(id)
        let escapedHTML = escapeForJS(html)
        
        let script = """
        (() => {
            const Notes = Application('Notes');
            const allNotes = Notes.notes();
            for (let i = 0; i < allNotes.length; i++) {
                if (allNotes[i].id() === '\(escapedId)') {
                    allNotes[i].body = '\(escapedHTML)';
                    return JSON.stringify({ success: true });
                }
            }
            return JSON.stringify({ success: false });
        })()
        """
        
        _ = try await runOsascript(script: script)
        bodyCache[id] = plainText
    }
    
    // MARK: - Rename Note
    
    /// Rename an existing note in Apple Notes.
    func renameNote(id: String, title: String) async throws {
        let escapedId = escapeForJS(id)
        let escapedTitle = escapeForJS(title)
        
        let script = """
        (() => {
            const Notes = Application('Notes');
            const allNotes = Notes.notes();
            for (let i = 0; i < allNotes.length; i++) {
                if (allNotes[i].id() === '\(escapedId)') {
                    allNotes[i].name = '\(escapedTitle)';
                    return JSON.stringify({ success: true });
                }
            }
            return JSON.stringify({ success: false });
        })()
        """
        
        _ = try await runOsascript(script: script)
        
        // Update cached note
        if let idx = notes.firstIndex(where: { $0.id == id }) {
            let old = notes[idx]
            notes[idx] = AppleNote(
                id: old.id, title: title, folder: old.folder,
                snippet: old.snippet, createdAt: old.createdAt, modifiedAt: Date.now
            )
        }
    }
    
    // MARK: - Create Note
    
    /// Create a new note in Apple Notes and return it.
    /// Defaults to the "Notes" folder if no folder name is provided.
    @MainActor
    func createNote(title: String = "Untitled Note", body: String = "", folderName: String? = nil) async -> AppleNote? {
        let folder = folderName ?? "Notes"
        let html = body.isEmpty ? "<div><br></div>" : plainTextToHTML(body)
        let escapedTitle = escapeForJS(title)
        let escapedHTML = escapeForJS(html)
        let escapedFolder = escapeForJS(folder)
        
        let script = """
        (() => {
            const Notes = Application('Notes');
            let folder;
            try {
                folder = Notes.folders.byName('\(escapedFolder)');
                folder.name();
            } catch(e) {
                folder = Notes.defaultAccount.folders.byName('Notes');
            }
            const note = Notes.Note({ name: '\(escapedTitle)', body: '\(escapedHTML)' });
            folder.notes.push(note);
            return JSON.stringify({
                id: note.id(),
                name: note.name(),
                folder: folder.name(),
                created: note.creationDate().toISOString(),
                modified: note.modificationDate().toISOString()
            });
        })()
        """
        
        do {
            let output = try await runOsascript(script: script)
            guard let data = output.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let id = json["id"] as? String,
                  let name = json["name"] as? String,
                  let folderStr = json["folder"] as? String else { return nil }
            
            let newNote = AppleNote(
                id: id,
                title: name,
                folder: folderStr,
                snippet: "",
                createdAt: Date.now,
                modifiedAt: Date.now
            )
            
            // Insert at top of list
            notes.insert(newNote, at: 0)
            return newNote
        } catch {
            print("[AppleNotesService] Create note failed: \(error.localizedDescription)")
            return nil
        }
    }
    
    // MARK: - Delete Note
    
    /// Delete a note from Apple Notes.
    func deleteNote(id: String) async throws {
        let escapedId = escapeForJS(id)
        
        let script = """
        (() => {
            const Notes = Application('Notes');
            const allNotes = Notes.notes();
            for (let i = 0; i < allNotes.length; i++) {
                if (allNotes[i].id() === '\(escapedId)') {
                    Notes.delete(allNotes[i]);
                    return JSON.stringify({ success: true });
                }
            }
            return JSON.stringify({ success: false });
        })()
        """
        
        _ = try await runOsascript(script: script)
        notes.removeAll { $0.id == id }
        bodyCache.removeValue(forKey: id)
    }
    
    // MARK: - Search
    
    /// Filter cached notes by a search query (title, snippet, or folder).
    func searchNotes(query: String) -> [AppleNote] {
        guard !query.isEmpty else { return notes }
        let q = query.lowercased()
        return notes.filter {
            $0.title.lowercased().contains(q) ||
            $0.snippet.lowercased().contains(q) ||
            $0.folder.lowercased().contains(q)
        }
    }
    
    // MARK: - Helpers
    
    /// Convert plain text to basic HTML for Apple Notes.
    private func plainTextToHTML(_ text: String) -> String {
        let escaped = text
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        return escaped
            .components(separatedBy: "\n")
            .map { line in "<div>\(line.isEmpty ? "<br>" : line)</div>" }
            .joined()
    }
    
    /// Escape a string for safe embedding inside a JS single-quoted string literal.
    private func escapeForJS(_ str: String) -> String {
        str.replacingOccurrences(of: "\\", with: "\\\\")
           .replacingOccurrences(of: "'", with: "\\'")
           .replacingOccurrences(of: "\n", with: "\\n")
           .replacingOccurrences(of: "\r", with: "\\r")
           .replacingOccurrences(of: "\t", with: "\\t")
    }
    
    // MARK: - JXA Scripts
    
    /// Run JXA script to fetch all notes across every account and folder.
    /// Iterates accounts → folders → notes explicitly so nothing is missed
    /// (locked notes are silently skipped).
    private func runFetchNotesScript() async throws -> [AppleNote] {
        let script = """
        (() => {
            const Notes = Application('Notes');
            const result = [];
            const seen = {};
            const accounts = Notes.accounts();
            for (let a = 0; a < accounts.length; a++) {
                const accName = accounts[a].name();
                const folders = accounts[a].folders();
                for (let f = 0; f < folders.length; f++) {
                    const folderName = folders[f].name();
                    if (folderName === 'Recently Deleted') continue;
                    const notes = folders[f].notes();
                    for (let n = 0; n < notes.length; n++) {
                        try {
                            const note = notes[n];
                            const nid = note.id();
                            if (seen[nid]) continue;
                            seen[nid] = true;
                            const pt = note.plaintext();
                            result.push({
                                id: nid,
                                name: note.name(),
                                folder: folderName,
                                account: accName,
                                created: note.creationDate().toISOString(),
                                modified: note.modificationDate().toISOString(),
                                snippet: pt.substring(0, 300)
                            });
                        } catch(e) {}
                    }
                }
            }
            return JSON.stringify(result);
        })()
        """
        
        let output = try await runOsascript(script: script)
        return try parseNotesList(json: output)
    }
    
    /// Run JXA script to fetch a single note's full body by ID.
    private func runFetchBodyScript(noteId: String) async throws -> String {
        let escapedId = noteId.replacingOccurrences(of: "'", with: "\\'")
        
        let script = """
        (() => {
            const Notes = Application('Notes');
            const allNotes = Notes.notes();
            for (let i = 0; i < allNotes.length; i++) {
                if (allNotes[i].id() === '\(escapedId)') {
                    return JSON.stringify({ body: allNotes[i].plaintext() });
                }
            }
            return JSON.stringify({ body: '' });
        })()
        """
        
        let output = try await runOsascript(script: script)
        
        guard let data = output.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let body = json["body"] as? String else {
            return ""
        }
        
        return body
    }
    
    /// Execute a JXA script via `/usr/bin/osascript` and return stdout.
    private func runOsascript(script: String) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
                process.arguments = ["-l", "JavaScript", "-e", script]
                
                let stdout = Pipe()
                let stderr = Pipe()
                process.standardOutput = stdout
                process.standardError = stderr
                
                do {
                    try process.run()
                    process.waitUntilExit()
                    
                    let outputData = stdout.fileHandleForReading.readDataToEndOfFile()
                    let errorData = stderr.fileHandleForReading.readDataToEndOfFile()
                    
                    if process.terminationStatus != 0 {
                        let errorString = String(data: errorData, encoding: .utf8) ?? "Unknown error"
                        if errorString.contains("not allowed") ||
                            errorString.contains("permission") ||
                            errorString.contains("-1743") {
                            continuation.resume(throwing: AppleNotesError.permissionDenied)
                        } else {
                            continuation.resume(throwing: AppleNotesError.scriptFailed(errorString))
                        }
                        return
                    }
                    
                    let output = String(data: outputData, encoding: .utf8)?
                        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    continuation.resume(returning: output)
                } catch {
                    continuation.resume(throwing: AppleNotesError.scriptFailed(error.localizedDescription))
                }
            }
        }
    }
    
    /// Parse the JSON array returned by the JXA fetch-all script.
    private func parseNotesList(json: String) throws -> [AppleNote] {
        guard let data = json.data(using: .utf8) else {
            throw AppleNotesError.parseFailed
        }
        
        guard let array = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw AppleNotesError.parseFailed
        }
        
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        let isoFormatterNoFraction = ISO8601DateFormatter()
        isoFormatterNoFraction.formatOptions = [.withInternetDateTime]
        
        // Check if there are multiple accounts — if so, prefix folder names
        let accounts = Set(array.compactMap { $0["account"] as? String })
        let multipleAccounts = accounts.count > 1
        
        return array.compactMap { dict in
            guard let id = dict["id"] as? String,
                  let name = dict["name"] as? String,
                  let folder = dict["folder"] as? String,
                  let createdStr = dict["created"] as? String,
                  let modifiedStr = dict["modified"] as? String else { return nil }
            
            let created = isoFormatter.date(from: createdStr)
                ?? isoFormatterNoFraction.date(from: createdStr)
                ?? Date.now
            let modified = isoFormatter.date(from: modifiedStr)
                ?? isoFormatterNoFraction.date(from: modifiedStr)
                ?? Date.now
            let snippet = (dict["snippet"] as? String) ?? ""
            
            // Show "Account > Folder" when the user has multiple accounts
            let account = dict["account"] as? String ?? ""
            let displayFolder = multipleAccounts && !account.isEmpty
                ? "\(account) › \(folder)"
                : folder
            
            return AppleNote(
                id: id,
                title: name,
                folder: displayFolder,
                snippet: snippet,
                createdAt: created,
                modifiedAt: modified
            )
        }
    }
}

// MARK: - Errors

enum AppleNotesError: LocalizedError {
    case permissionDenied
    case scriptFailed(String)
    case parseFailed
    
    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Nest needs permission to access Apple Notes. Please allow it in System Settings → Privacy & Security → Automation."
        case .scriptFailed(let message):
            return "Failed to read Apple Notes: \(message)"
        case .parseFailed:
            return "Could not parse the response from Apple Notes."
        }
    }
}
