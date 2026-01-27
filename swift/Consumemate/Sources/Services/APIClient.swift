import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case serverError(String)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .unauthorized:
            return "Unauthorized - please log in again"
        case .serverError(let message):
            return message
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        }
    }
}

@MainActor
class APIClient: ObservableObject {
    static let shared = APIClient()

    private let baseURL = "https://consume-dev-56af3b34f0b8.herokuapp.com"
    private let tokenKey = "authToken"
    private let phoneNumberKey = "phoneNumber"

    @Published private(set) var token: String?
    @Published private(set) var isAuthenticated: Bool = false

    private init() {
        token = UserDefaults.standard.string(forKey: tokenKey)
        isAuthenticated = token != nil
        print("[APIClient] Initialized - token present: \(token != nil), isAuthenticated: \(isAuthenticated)")
    }

    // MARK: - Token Management

    func setToken(_ newToken: String, phoneNumber: String) {
        token = newToken
        isAuthenticated = true
        UserDefaults.standard.set(newToken, forKey: tokenKey)
        UserDefaults.standard.set(phoneNumber, forKey: phoneNumberKey)
    }

    func clearToken() {
        token = nil
        isAuthenticated = false
        UserDefaults.standard.removeObject(forKey: tokenKey)
        UserDefaults.standard.removeObject(forKey: phoneNumberKey)
    }

    // MARK: - Request Helper

    private func request<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: Data? = nil
    ) async throws -> T {
        guard let url = URL(string: baseURL + endpoint) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = body {
            request.httpBody = body
        }

        print("[APIClient] \(method) \(endpoint)")

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            print("[APIClient] Network error: \(error)")
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        print("[APIClient] Response status: \(httpResponse.statusCode)")

        if httpResponse.statusCode == 401 {
            clearToken()
            throw APIError.unauthorized
        }

        if httpResponse.statusCode >= 400 {
            if let responseString = String(data: data, encoding: .utf8) {
                print("[APIClient] Error response: \(responseString)")
            }
            if let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
                throw APIError.serverError(errorResponse.message ?? "Request failed")
            }
            throw APIError.serverError("Request failed with status \(httpResponse.statusCode)")
        }

        do {
            let decoder = JSONDecoder()
            return try decoder.decode(T.self, from: data)
        } catch {
            if let responseString = String(data: data, encoding: .utf8) {
                print("[APIClient] Failed to decode: \(responseString.prefix(500))")
            }
            print("[APIClient] Decoding error: \(error)")
            throw APIError.decodingError(error)
        }
    }

    private func requestVoid(
        endpoint: String,
        method: String = "GET",
        body: Data? = nil
    ) async throws {
        guard let url = URL(string: baseURL + endpoint) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = body {
            request.httpBody = body
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            clearToken()
            throw APIError.unauthorized
        }

        if httpResponse.statusCode >= 400 {
            if let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
                throw APIError.serverError(errorResponse.message ?? "Request failed")
            }
            throw APIError.serverError("Request failed with status \(httpResponse.statusCode)")
        }
    }

    // MARK: - Auth

    func sendCode(phoneNumber: String) async throws {
        let body = try JSONEncoder().encode(["phoneNumber": phoneNumber])
        try await requestVoid(endpoint: "/v1/auth/send-code", method: "POST", body: body)
    }

    func verifyCode(phoneNumber: String, code: String) async throws -> VerifyCodeResponse {
        let body = try JSONEncoder().encode(["phoneNumber": phoneNumber, "code": code])
        let response: VerifyCodeResponse = try await request(endpoint: "/v1/auth/verify-code", method: "POST", body: body)
        setToken(response.token, phoneNumber: response.account.phoneNumber)
        return response
    }

    func getAccount() async throws -> Account {
        return try await request(endpoint: "/v1/auth/account")
    }

    func updateAccount(name: String? = nil, preferredVoiceId: String? = nil) async throws -> Account {
        var updates: [String: String] = [:]
        if let name = name { updates["name"] = name }
        if let preferredVoiceId = preferredVoiceId { updates["preferredVoiceId"] = preferredVoiceId }
        let body = try JSONEncoder().encode(updates)
        return try await request(endpoint: "/v1/auth/account", method: "PATCH", body: body)
    }

    // MARK: - Articles

    func getArticles(filter: String = "all") async throws -> [ArticleSummary] {
        return try await request(endpoint: "/v1/articles?filter=\(filter)")
    }

    func getArticle(id: Int) async throws -> Article {
        return try await request(endpoint: "/v1/articles/\(id)")
    }

    func markAsRead(id: Int) async throws {
        try await requestVoid(endpoint: "/v1/articles/\(id)/read", method: "POST")
    }

    func markAsUnread(id: Int) async throws {
        try await requestVoid(endpoint: "/v1/articles/\(id)/unread", method: "POST")
    }

    func deleteArticle(id: Int) async throws {
        try await requestVoid(endpoint: "/v1/articles/\(id)", method: "DELETE")
    }

    func generateAudio(id: Int, voiceId: String) async throws -> AudioGenerationResponse {
        let body = try JSONEncoder().encode(["voiceId": voiceId])
        return try await request(endpoint: "/v1/articles/\(id)/audio", method: "POST", body: body)
    }

    // Chunked audio generation
    func getAudioChunkCount(id: Int, voiceId: String? = nil) async throws -> ChunkCountResponse {
        var endpoint = "/v1/articles/\(id)/audio/chunks"
        if let voiceId = voiceId {
            endpoint += "?voiceId=\(voiceId)"
        }
        return try await request(endpoint: endpoint)
    }

    func generateAudioChunk(id: Int, voiceId: String, chunkIndex: Int) async throws -> AudioChunkResponse {
        struct ChunkRequest: Encodable {
            let voiceId: String
            let chunkIndex: Int
        }
        let body = try JSONEncoder().encode(ChunkRequest(voiceId: voiceId, chunkIndex: chunkIndex))
        return try await request(endpoint: "/v1/articles/\(id)/audio/chunk", method: "POST", body: body)
    }

    // MARK: - Voices

    func getVoices() async throws -> [Voice] {
        let response: VoicesResponse = try await request(endpoint: "/voices")
        return response.voices
    }
}
