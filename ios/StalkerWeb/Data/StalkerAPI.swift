import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case httpError(Int)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:           return "Invalid server URL"
        case .httpError(let code):  return "Server error (\(code))"
        case .decodingError(let e): return "Data error: \(e.localizedDescription)"
        }
    }
}

class StalkerAPI {
    let baseURL: String
    private let session = URLSession.shared
    private let decoder = JSONDecoder()

    init(baseURL: String) {
        self.baseURL = baseURL.hasSuffix("/") ? String(baseURL.dropLast()) : baseURL
    }

    private func makeURL(_ path: String) throws -> URL {
        guard let url = URL(string: "\(baseURL)\(path)") else { throw APIError.invalidURL }
        return url
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let (data, response) = try await session.data(from: try makeURL(path))
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            throw APIError.httpError(http.statusCode)
        }
        do { return try decoder.decode(T.self, from: data) }
        catch { throw APIError.decodingError(error) }
    }

    private func post(_ path: String, body: some Encodable) async throws {
        var req = URLRequest(url: try makeURL(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)
        let (_, response) = try await session.data(for: req)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            throw APIError.httpError(http.statusCode)
        }
    }

    private func delete(_ path: String) async throws {
        var req = URLRequest(url: try makeURL(path))
        req.httpMethod = "DELETE"
        let (_, response) = try await session.data(for: req)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            throw APIError.httpError(http.statusCode)
        }
    }

    // ── Endpoints ──────────────────────────────────────────────────────────

    func getStatus() async throws -> StatusResponse {
        try await get("/api/auth/status")
    }

    func getChannels() async throws -> [Channel] {
        let r: ChannelsResponse = try await get("/api/channels")
        return r.channels
    }

    func getGroups() async throws -> [Group] {
        let r: GroupsResponse = try await get("/api/channels/groups/all")
        return r.groups.filter { $0.name.lowercased() != "all" }
    }

    func getLogoMap() async throws -> [String: String] {
        let raw: [String: String] = try await get("/api/logos/map")
        return raw.mapValues { v in
            v.hasPrefix("http") ? v : "\(baseURL)\(v)"
        }
    }

    func getFavorites() async throws -> [Channel] {
        let r: FavoritesResponse = try await get("/api/favorites")
        return r.channels
    }

    func addFavorite(uniqueId: String) async throws {
        struct Body: Encodable { let uniqueId: String }
        try await post("/api/favorites/channels", body: Body(uniqueId: uniqueId))
    }

    func removeFavorite(uniqueId: String) async throws {
        try await delete("/api/favorites/channels/\(uniqueId)")
    }

    func getNowNext() async throws -> [String: NowNextEntry] {
        try await get("/api/epg/now")
    }
}
