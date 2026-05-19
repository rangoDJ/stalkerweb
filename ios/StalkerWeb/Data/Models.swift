import Foundation

struct Channel: Codable, Identifiable, Hashable {
    var id: String { uniqueId }
    let uniqueId: String
    let number: Int
    let name: String
    let genre: String?
    let genreId: String?
    let iconPath: String?
}

struct ChannelsResponse: Codable {
    let channels: [Channel]
    let total: Int
}

struct Group: Codable, Identifiable, Hashable {
    let id: String
    let name: String
}

struct GroupsResponse: Codable {
    let groups: [Group]
}

struct FavoritesResponse: Codable {
    let channels: [Channel]
}

struct StatusResponse: Codable {
    let connected: Bool
    let portal: String?
    let mac: String?
}

struct NowInfo: Codable {
    let title: String
    let startTime: TimeInterval
    let endTime: TimeInterval
}

struct NextInfo: Codable {
    let title: String
    let startTime: TimeInterval
}

struct NowNextEntry: Codable {
    let now: NowInfo
    let next: NextInfo?
}
