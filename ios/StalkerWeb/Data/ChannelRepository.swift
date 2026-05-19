import Foundation

class ChannelRepository {
    private(set) var prefs: AppPrefs
    private var api: StalkerAPI?

    init(prefs: AppPrefs) {
        self.prefs = prefs
        if let url = prefs.serverUrl { api = StalkerAPI(baseURL: url) }
    }

    func configure(serverUrl: String) {
        prefs.serverUrl = serverUrl
        api = StalkerAPI(baseURL: serverUrl)
    }

    func streamUrl(channelId: String) -> URL {
        let base = prefs.serverUrl?.trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? ""
        return URL(string: "\(base)/proxy/stream/\(channelId)")!
    }

    private func requireAPI() throws -> StalkerAPI {
        guard let api else { throw APIError.invalidURL }
        return api
    }

    func testConnection() async throws -> StatusResponse { try await requireAPI().getStatus() }
    func getChannels()    async throws -> [Channel]            { try await requireAPI().getChannels() }
    func getGroups()      async throws -> [Group]              { (try? await requireAPI().getGroups()) ?? [] }
    func getLogoMap()     async throws -> [String: String]     { (try? await requireAPI().getLogoMap()) ?? [:] }
    func getNowNext()     async throws -> [String: NowNextEntry] { (try? await requireAPI().getNowNext()) ?? [:] }

    func getFavoriteIds() async throws -> Set<String> {
        let channels = (try? await requireAPI().getFavorites()) ?? []
        return Set(channels.map { $0.uniqueId })
    }

    func addFavorite(_ id: String)    async throws { try await requireAPI().addFavorite(uniqueId: id) }
    func removeFavorite(_ id: String) async throws { try await requireAPI().removeFavorite(uniqueId: id) }
}
