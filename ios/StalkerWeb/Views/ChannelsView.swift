import SwiftUI

struct ChannelsView: View {
    @StateObject private var channelVM: ChannelViewModel
    @StateObject private var playerVM:  PlayerViewModel
    @State private var showPlayer = false

    init(repository: ChannelRepository) {
        _channelVM = StateObject(wrappedValue: ChannelViewModel(repository: repository))
        _playerVM  = StateObject(wrappedValue: PlayerViewModel(repository: repository))
    }

    var body: some View {
        NavigationStack {
            Group {
                if channelVM.isLoading {
                    ProgressView("Loading channels…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = channelVM.error {
                    ContentUnavailableView {
                        Label("Connection Error", systemImage: "wifi.slash")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Retry") { channelVM.load() }
                            .buttonStyle(.borderedProminent)
                    }
                } else if channelVM.displayed.isEmpty {
                    ContentUnavailableView.search(text: channelVM.query)
                } else {
                    channelList
                }
            }
            .navigationTitle("StalkerWeb")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { channelVM.load() } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Picker("", selection: $channelVM.tab) {
                        Text("All").tag(ChannelTab.all)
                        Text("Favorites").tag(ChannelTab.favorites)
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 160)
                }
            }
            .searchable(text: $channelVM.query, prompt: "Search channels")
            .safeAreaInset(edge: .top) {
                if channelVM.tab == .all && !channelVM.groups.isEmpty {
                    genreChips
                }
            }
        }
        .fullScreenCover(isPresented: $showPlayer) {
            PlayerView(viewModel: playerVM)
        }
        .onAppear { channelVM.load() }
    }

    // ── Genre chips ────────────────────────────────────────────────────────

    private var genreChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                GenreChip(label: "All", selected: channelVM.selectedGroupId == nil) {
                    channelVM.selectedGroupId = nil
                }
                ForEach(channelVM.groups) { group in
                    GenreChip(
                        label: group.name,
                        selected: channelVM.selectedGroupId == group.id
                    ) {
                        channelVM.selectedGroupId = group.id
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .background(.ultraThinMaterial)
        .overlay(alignment: .bottom) { Divider() }
    }

    // ── Channel list ───────────────────────────────────────────────────────

    private var channelList: some View {
        List(channelVM.displayed) { channel in
            ChannelRow(
                channel:    channel,
                logoUrl:    channelVM.logoMap[channel.uniqueId],
                isFavorite: channelVM.favoriteIds.contains(channel.uniqueId),
                nowNext:    channelVM.nowNext[channel.uniqueId]
            ) {
                channelVM.toggleFavorite(channel)
            } onTap: {
                playerVM.initialize(channelId: channel.uniqueId)
                showPlayer = true
            }
            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
        }
        .listStyle(.plain)
    }
}

// ── Channel row ───────────────────────────────────────────────────────────

private struct ChannelRow: View {
    let channel: Channel
    let logoUrl: String?
    let isFavorite: Bool
    let nowNext: NowNextEntry?
    let onToggleFavorite: () -> Void
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Logo
                AsyncImage(url: logoUrl.flatMap(URL.init)) { image in
                    image.resizable().scaledToFit()
                } placeholder: {
                    Image(systemName: "tv").foregroundStyle(.secondary)
                }
                .frame(width: 42, height: 42)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 6))

                // Info
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text("Ch \(channel.number)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(channel.name)
                            .font(.body)
                            .lineLimit(1)
                    }

                    if let nn = nowNext {
                        let progress = epgProgress(nn.now)
                        Text(nn.now.title)
                            .font(.caption)
                            .foregroundStyle(.indigo)
                            .lineLimit(1)
                        ProgressBar(value: progress)
                        if let next = nn.next {
                            Text("Next: \(next.title)")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                                .lineLimit(1)
                        }
                    }
                }

                Spacer(minLength: 0)

                // Favorite
                Button(action: onToggleFavorite) {
                    Image(systemName: isFavorite ? "heart.fill" : "heart")
                        .foregroundStyle(isFavorite ? .red : .secondary)
                        .font(.system(size: 16))
                }
                .buttonStyle(.plain)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func epgProgress(_ now: NowInfo) -> Double {
        let dur = now.endTime - now.startTime
        guard dur > 0 else { return 0 }
        return min(1, max(0, (Date().timeIntervalSince1970 - now.startTime) / dur))
    }
}

// ── Small helpers ─────────────────────────────────────────────────────────

private struct GenreChip: View {
    let label: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(selected ? Color.indigo : Color(.secondarySystemBackground),
                            in: Capsule())
                .foregroundStyle(selected ? .white : .primary)
        }
        .buttonStyle(.plain)
    }
}

private struct ProgressBar: View {
    let value: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color(.systemFill))
                Capsule().fill(Color.indigo)
                    .frame(width: geo.size.width * value)
            }
        }
        .frame(height: 3)
    }
}
