import Foundation
import CryptoKit

struct EncryptedPayload {
    let ciphertext: String
    let iv: String
    let tag: String
}

final class EmailEncryptionService {
    private let keychainKey = Constants.Keychain.emailEncryptionKey

    func encrypt(_ plaintext: String) throws -> EncryptedPayload {
        let key = try currentKey()
        let nonce = AES.GCM.Nonce()
        let plaintextData = Data(plaintext.utf8)
        let sealed = try AES.GCM.seal(plaintextData, using: key, nonce: nonce)

        return EncryptedPayload(
            ciphertext: sealed.ciphertext.base64EncodedString(),
            iv: Data(nonce).base64EncodedString(),
            tag: sealed.tag.base64EncodedString()
        )
    }

    func decrypt(ciphertext: String, iv: String, tag: String) throws -> String {
        let key = try currentKey()

        guard let cipherData = Data(base64Encoded: ciphertext),
              let nonceData = Data(base64Encoded: iv),
              let tagData = Data(base64Encoded: tag),
              let nonce = try? AES.GCM.Nonce(data: nonceData) else {
            throw EncryptionError.invalidPayload
        }

        let box = try AES.GCM.SealedBox(nonce: nonce, ciphertext: cipherData, tag: tagData)
        let data = try AES.GCM.open(box, using: key)

        guard let value = String(data: data, encoding: .utf8) else {
            throw EncryptionError.invalidPayload
        }
        return value
    }

    private func currentKey() throws -> SymmetricKey {
        if let existing = KeychainHelper.get(key: keychainKey),
           let data = Data(base64Encoded: existing),
           data.count == 32 {
            return SymmetricKey(data: data)
        }

        let newKey = SymmetricKey(size: .bits256)
        let raw = newKey.withUnsafeBytes { Data($0) }
        let saved = KeychainHelper.set(key: keychainKey, value: raw.base64EncodedString())
        guard saved else {
            throw EncryptionError.keyStorageFailed
        }
        return newKey
    }

    enum EncryptionError: LocalizedError {
        case invalidPayload
        case keyStorageFailed

        var errorDescription: String? {
            switch self {
            case .invalidPayload: return "Invalid encrypted payload."
            case .keyStorageFailed: return "Could not save email encryption key."
            }
        }
    }
}
