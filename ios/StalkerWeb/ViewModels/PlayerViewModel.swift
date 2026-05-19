import AVKit
import MediaPlayer

@MainActor
class PlayerViewModel: ObservableObject {
    @Published var channels:    [Channel]              = []
    @Published var logoMap:     [String: String]       = [:]
    @Published var favoriteIds: Set<String>            = []
    @Published var nowNext:     [String: NowNextEntry] = [:]
    @Published var activeId:    String                 = ""
    @Published var showChannelList = false
    @Published var selectedGenre: String?              = nil
    @Published var isPlaying   = false
    @Published var isBuffering = true
    @Published var playerError: String?                = nil

    let player = AVPlayer()
    private let repository: ChannelRepository
    private var itemObservations: [NSKeyValueObservation] = []
    private var rateObservation:   NSKeyValueObservation? = nil

    var displayedChannels: [Channel] {
        guard let genre = selectedGenre else { return channels }
        return channels.filter { $0.genre == genre }
    }

    var genres: [String] {
        Array(Set(channels.compactMap { $0.genre }.filter { !$0.isEmpty })).sorted()
    }

    init(repository: ChannelRepository) {
        self.repository = repository
        setupAudioSession()
        setupRemoteControls()
    }

    func initialize(channelId: String) {
        activeId = channelId
        loadStream(channelId: channelId)

        Task {
            async let ch = repository.getChannels()
            async let lo = repository.getLogoMap()
            async let fa = repository.getFavoriteIds()
            if let (channels, logos, favs) = try? await (ch, lo, fa) {
                self.channels    = channels
                self.logoMap     = logos
                self.favoriteIds = favs
                if selectedGenre == nil {
                    selectedGenre = channels.compactMap { $0.genre }
                        .filter { !$0.isEmpty }.sorted().first
                }
                updateNowPlaying()
            }
        }
        Task { nowNext = (try? await repository.getNowNext()) ?? [:] }
    }

    func loadStream(channelId: String) {
        isBuffering = true
        playerError = nil

        let item = AVPlayerItem(url: repository.streamUrl(channelId: channelId))

        itemObservations.forEach { $0.invalidate() }
        itemObservations = []

        itemObservations.append(
            item.observe(\.status, options: [.new]) { [weak self] item, _ in
                Task { @MainActor [weak self] in
                    switch item.status {
                    case .readyToPlay: self?.isBuffering = false
                    case .failed:
                        self?.isBuffering = false
                        self?.playerError = item.error?.localizedDescription ?? "Playback failed"
                    default: break
                    }
                }
            }
        )
        itemObservations.append(
            item.observe(\.isPlaybackBufferEmpty, options: [.new]) { [weak self] item, _ in
                Task { @MainActor [weak self] in
                    if item.isPlaybackBufferEmpty { self?.isBuffering = true }
                }
            }
        )
        itemObservations.append(
            item.observe(\.isPlaybackLikelyToKeepUp, options: [.new]) { [weak self] item, _ in
                Task { @MainActor [weak self] in
                    if item.isPlaybackLikelyToKeepUp { self?.isBuffering = false }
                }
            }
        )

        rateObservation?.invalidate()
        rateObservation = player.observe(\.rate, options: [.new]) { [weak self] p, _ in
            Task { @MainActor [weak self] in self?.isPlaying = p.rate > 0 }
        }

        player.replaceCurrentItem(with: item)
        player.play()
    }

    func selectChannel(_ channelId: String) {
        activeId = channelId
        showChannelList = false
        loadStream(channelId: channelId)
        updateNowPlaying()
    }

    func previousChannel() {
        let list = displayedChannels
        guard let idx = list.firstIndex(where: { $0.uniqueId == activeId }), idx > 0 else { return }
        selectChannel(list[idx - 1].uniqueId)
    }

    func nextChannel() {
        let list = displayedChannels
        guard let idx = list.firstIndex(where: { $0.uniqueId == activeId }),
              idx < list.count - 1 else { return }
        selectChannel(list[idx + 1].uniqueId)
    }

    func togglePlayPause() {
        if isPlaying { player.pause() } else { player.play() }
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

    func setGenre(_ genre: String?) { selectedGenre = genre }

    // ── Private ────────────────────────────────────────────────────────────

    private func setupAudioSession() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    private func setupRemoteControls() {
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.isEnabled          = true
        c.pauseCommand.isEnabled         = true
        c.nextTrackCommand.isEnabled     = true
        c.previousTrackCommand.isEnabled = true

        c.playCommand.addTarget          { [weak self] _ in self?.player.play();    return .success }
        c.pauseCommand.addTarget         { [weak self] _ in self?.player.pause();   return .success }
        c.nextTrackCommand.addTarget     { [weak self] _ in self?.nextChannel();    return .success }
        c.previousTrackCommand.addTarget { [weak self] _ in self?.previousChannel(); return .success }
    }

    private func updateNowPlaying() {
        let name = channels.first(where: { $0.uniqueId == activeId })?.name ?? "Live TV"
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: name,
            MPNowPlayingInfoPropertyIsLiveStream: true,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.video.rawValue,
        ]
    }

    deinit {
        itemObservations.forEach { $0.invalidate() }
        rateObservation?.invalidate()
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.removeTarget(nil)
        c.pauseCommand.removeTarget(nil)
        c.nextTrackCommand.removeTarget(nil)
        c.previousTrackCommand.removeTarget(nil)
    }
}
