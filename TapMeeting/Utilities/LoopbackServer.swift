import Foundation

/// A tiny HTTP server that listens on 127.0.0.1 for an OAuth redirect.
/// Extracts the authorisation code from the callback URL and hands it off.
///
/// Used by both GoogleCalendarService and GmailService.
final class LoopbackServer {
    
    private let port: UInt16
    private let onCode: (String) -> Void
    private let successTitle: String
    private var serverSocket: Int32 = -1
    private var isRunning = false
    
    /// - Parameters:
    ///   - port: The loopback port to listen on.
    ///   - successTitle: Title shown in the browser after a successful callback.
    ///   - onCode: Called with the authorisation code extracted from the redirect.
    init(port: UInt16, successTitle: String = "Connected to Google", onCode: @escaping (String) -> Void) {
        self.port = port
        self.successTitle = successTitle
        self.onCode = onCode
    }
    
    func start() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.listen()
        }
    }
    
    func stop() {
        isRunning = false
        if serverSocket >= 0 {
            close(serverSocket)
            serverSocket = -1
        }
    }
    
    private func listen() {
        serverSocket = socket(AF_INET, SOCK_STREAM, 0)
        guard serverSocket >= 0 else { return }
        
        var reuse: Int32 = 1
        setsockopt(serverSocket, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))
        
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        
        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                bind(serverSocket, sockPtr, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bindResult == 0 else {
            close(serverSocket)
            return
        }
        
        Darwin.listen(serverSocket, 1)
        isRunning = true
        
        // Accept one connection
        var clientAddr = sockaddr_in()
        var clientLen = socklen_t(MemoryLayout<sockaddr_in>.size)
        
        let clientSocket = withUnsafeMutablePointer(to: &clientAddr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                accept(serverSocket, sockPtr, &clientLen)
            }
        }
        
        guard clientSocket >= 0 else {
            close(serverSocket)
            return
        }
        
        // Read the HTTP request
        var buffer = [UInt8](repeating: 0, count: 4096)
        let bytesRead = read(clientSocket, &buffer, buffer.count)
        
        if bytesRead > 0 {
            let requestString = String(bytes: buffer[0..<bytesRead], encoding: .utf8) ?? ""
            
            // Extract code from "GET /callback?code=XXX..."
            if let code = extractCode(from: requestString) {
                // Send success response
                let html = """
                <html><body style="font-family:-apple-system;text-align:center;padding:60px">
                <h2>\(successTitle)</h2>
                <p>You can close this tab and return to Tap.</p>
                </body></html>
                """
                let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: \(html.utf8.count)\r\n\r\n\(html)"
                _ = response.withCString { write(clientSocket, $0, response.utf8.count) }
                
                close(clientSocket)
                close(serverSocket)
                onCode(code)
                return
            }
        }
        
        // Error response
        let errorHTML = "<html><body><h2>Authentication failed</h2></body></html>"
        let errorResponse = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\nContent-Length: \(errorHTML.utf8.count)\r\n\r\n\(errorHTML)"
        _ = errorResponse.withCString { write(clientSocket, $0, errorResponse.utf8.count) }
        
        close(clientSocket)
        close(serverSocket)
    }
    
    private func extractCode(from request: String) -> String? {
        // Parse "GET /callback?code=4/0Axx...&scope=... HTTP/1.1"
        guard let firstLine = request.components(separatedBy: "\r\n").first,
              let urlPart = firstLine.split(separator: " ").dropFirst().first,
              let components = URLComponents(string: String(urlPart)),
              let code = components.queryItems?.first(where: { $0.name == "code" })?.value else {
            return nil
        }
        return code
    }
}
