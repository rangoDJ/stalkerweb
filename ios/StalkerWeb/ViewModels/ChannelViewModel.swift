import Foundation

enum ChannelTab { case all, favorites }

@MainActor
class ChannelViewModel: ObservableObject {
    @Published var channels:    [Channel]              = []
    @Published var groups:      [Group]                = []
    @Published var logoMap:     [String: String]       = [:]
    @Published var favoriteIds: Set<String>            = []
    @Published var nowNext:     [String: NowNextEntry] = [:]
    @Published var selectedGroupId: String?            = nil
    @Published var query:       String                 = ""
    @Published var tab:         ChannelTab             = .all
    @Published var isLoading                           = true
    @Published var error:       String?                = nil

    private let repository: ChannelRepository

    init(repository: ChannelRepository) {
        self.repository = repository
    }

    var displayed: [Channel] {
        var base = tab == .favorites
            ? channels.filter { favoriteIds.contains($0.uniqueId) }
            : channels

        if let gid = selectedGroupId, tab == .all {
            base = base.filter { $0.genreId == gid }
        }

        if !query.isEmpty {
            base = base.filter { $0.name.localizedCaseInsensitiveContains(query) }
        }
        return base
    }

    func load() {
        Task {
            isLoading = true
            error = nil
            do {
                async let ch = repository.getChannels()
                async let gr = repository.getGroups()
                async let lo = repository.getLogoMap()
                async let fa = repository.getFavoriteIds()
                let (channels, groups, logos, favs) = try await (ch, gr, lo, fa)
                self.channels    = channels
                self.groups      = groups
                self.logoMap     = logos
                self.favoriteIds = favs
                isLoading = false
            } catch {
                self.error = error.localizedDescription
                isLoading = false
            }
        }
        Task {
            nowNext = (try? await repository.getNowNext()) ?? [:]
        }
    }

    func toggleFavorite(_ channel: Channel) {
        let id = channel.uniqueId
        let wasFav = favoriteIds.contains(id)
        if wasFav { favoriteIds.remove(id) } else { favoriteIds.insert(id) }
        Task {
            do {
                if wasFav { try await repository.removeFavorite(id) }
                else       { try await repository.addFavorite(id) }
            } catch {
                if wasFav { favoriteIds.insert(id) } else { favoriteIds.remove(id) }
            }
        }
    }
}
