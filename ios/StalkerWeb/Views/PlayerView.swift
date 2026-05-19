import SwiftUI
import AVKit

// ── AVPlayerViewController wrapper ────────────────────────────────────────

private struct AVPlayerView: UIViewControllerRepresentable {
    let player: AVPlayer

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let vc = AVPlayerViewController()
        vc.player = player
        vc.showsPlaybackControls = false
        vc.allowsPictureInPicturePlayback = true
        vc.videoGravity = .resizeAspect
        return vc
    }

    func updateUIViewController(_ vc: AVPlayerViewController, context: Context) {
        vc.player = player
    }
}

// ── Player screen ─────────────────────────────────────────────────────────

struct PlayerView: View {
    @ObservedObject var viewModel: PlayerViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var showControls = true
    @State private var controlsTask: Task<Void, Never>?

    var body: some View {
        GeometryReader { geo in
            let isLandscape = geo.size.width > geo.size.height
            ZStack {
                Color.black.ignoresSafeArea()

                if isLandscape {
                    landscapeLayout
                } else {
                    portraitLayout
                }
            }
        }
        .ignoresSafeArea()
        .statusBarHidden(true)
        .onTapGesture { toggleControls() }
    }

    // ── Layouts ────────────────────────────────────────────────────────────

    private var landscapeLayout: some View {
        ZStack(alignment: .trailing) {
            AVPlayerView(player: viewModel.player)
                .ignoresSafeArea()

            overlayContent

            if viewModel.showChannelList {
                channelListPanel
                    .transition(.move(edge: .trailing))
            }
        }
    }

    private var portraitLayout: some View {
        VStack(spacing: 0) {
            // 16:9 video box
            ZStack {
                AVPlayerView(player: viewModel.player)
                overlayContent
            }
            .aspectRatio(16 / 9, contentMode: .fit)
            .background(Color.black)

            // Channel list below video
            channelListBelow
        }
    }

    // ── Overlay (controls + buffering + error) ─────────────────────────────

    private var overlayContent: some View {
        ZStack {
            // Buffering spinner
            if viewModel.isBuffering && viewModel.playerError == nil {
                ProgressView()
                    .tint(.white)
                    .scaleEffect(1.4)
            }

            // Error
            if let error = viewModel.playerError {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.largeTitle)
                        .foregroundStyle(.red)
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                    Button("Retry") { viewModel.loadStream(channelId: viewModel.activeId) }
                        .buttonStyle(.bordered)
                        .tint(.white)
                }
                .padding()
            }

            // Controls
            if showControls {
                controlsOverlay
            }
        }
    }

    private var controlsOverlay: some View {
        VStack {
            // Top bar
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.down")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(10)
                        .background(.ultraThinMaterial, in: Circle())
                }

                Spacer()

                if let name = viewModel.channels.first(where: { $0.uniqueId == viewModel.activeId })?.name {
                    Text(name)
                        .font(.headline)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }

                Spacer()

                Button { withAnimation { viewModel.showChannelList.toggle() } } label: {
                    Image(systemName: "list.bullet")
                        .font(.title3)
                        .foregroundStyle(.white)
                        .padding(10)
                        .background(.ultraThinMaterial, in: Circle())
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)

            Spacer()

            // Centre play/pause + prev/next
            HStack(spacing: 48) {
                Button { viewModel.previousChannel() } label: {
                    Image(systemName: "backward.fill")
                        .font(.title)
                        .foregroundStyle(.white)
                }
                Button { viewModel.togglePlayPause() } label: {
                    Image(systemName: viewModel.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(.white)
                }
                Button { viewModel.nextChannel() } label: {
                    Image(systemName: "forward.fill")
                        .font(.title)
                        .foregroundStyle(.white)
                }
            }

            Spacer()

            // Live badge
            HStack {
                Spacer()
                Text("LIVE")
                    .font(.caption.bold())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(.red, in: RoundedRectangle(cornerRadius: 4))
                    .padding(.trailing, 16)
                    .padding(.bottom, 16)
            }
        }
        .background(
            LinearGradient(
                colors: [.black.opacity(0.55), .clear, .clear, .black.opacity(0.35)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }

    // ── Channel list panel (landscape side panel) ─────────────────────────

    private var channelListPanel: some View {
        VStack(spacing: 0) {
            // Genre picker
            if !viewModel.genres.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        genreButton(label: "All", genre: nil)
                        ForEach(viewModel.genres, id: \.self) { g in
                            genreButton(label: g, genre: g)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .background(.ultraThinMaterial)
                Divider()
            }

            List(viewModel.displayedChannels) { ch in
                let isActive = ch.uniqueId == viewModel.activeId
                Button {
                    withAnimation { viewModel.selectChannel(ch.uniqueId) }
                } label: {
                    HStack(spacing: 10) {
                        AsyncImage(url: viewModel.logoMap[ch.uniqueId].flatMap(URL.init)) { img in
                            img.resizable().scaledToFit()
                        } placeholder: {
                            Image(systemName: "tv").foregroundStyle(.secondary)
                        }
                        .frame(width: 28, height: 28)

                        Text(ch.name)
                            .font(.subheadline)
                            .foregroundStyle(isActive ? .indigo : .white.opacity(0.85))
                            .lineLimit(1)

                        Spacer()

                        Button { viewModel.toggleFavorite(ch) } label: {
                            Image(systemName: viewModel.favoriteIds.contains(ch.uniqueId) ? "heart.fill" : "heart")
                                .foregroundStyle(viewModel.favoriteIds.contains(ch.uniqueId) ? .red : .secondary)
                                .font(.caption)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .buttonStyle(.plain)
                .listRowBackground(isActive ? Color.indigo.opacity(0.18) : Color.clear)
            }
            .listStyle(.plain)
            .background(.ultraThinMaterial)
        }
        .frame(width: 240)
        .background(.ultraThinMaterial)
    }

    // ── Channel list below video (portrait) ───────────────────────────────

    private var channelListBelow: some View {
        List(viewModel.displayedChannels) { ch in
            let isActive = ch.uniqueId == viewModel.activeId
            Button { viewModel.selectChannel(ch.uniqueId) } label: {
                HStack(spacing: 10) {
                    AsyncImage(url: viewModel.logoMap[ch.uniqueId].flatMap(URL.init)) { img in
                        img.resizable().scaledToFit()
                    } placeholder: {
                        Image(systemName: "tv").foregroundStyle(.secondary)
                    }
                    .frame(width: 34, height: 34)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 5))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(ch.name)
                            .font(.subheadline)
                            .foregroundStyle(isActive ? .indigo : .primary)
                            .lineLimit(1)
                        if let nn = viewModel.nowNext[ch.uniqueId] {
                            Text(nn.now.title)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }

                    Spacer()

                    Button { viewModel.toggleFavorite(ch) } label: {
                        Image(systemName: viewModel.favoriteIds.contains(ch.uniqueId) ? "heart.fill" : "heart")
                            .foregroundStyle(viewModel.favoriteIds.contains(ch.uniqueId) ? .red : .secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .buttonStyle(.plain)
            .listRowBackground(isActive ? Color.indigo.opacity(0.1) : Color.clear)
        }
        .listStyle(.plain)
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private func genreButton(label: String, genre: String?) -> some View {
        Button { viewModel.setGenre(genre) } label: {
            Text(label)
                .font(.caption.weight(.medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    viewModel.selectedGenre == genre ? Color.indigo : Color(.secondarySystemBackground),
                    in: Capsule()
                )
                .foregroundStyle(viewModel.selectedGenre == genre ? .white : .primary)
        }
        .buttonStyle(.plain)
    }

    private func toggleControls() {
        withAnimation(.easeInOut(duration: 0.2)) { showControls.toggle() }
        if showControls { scheduleHide() }
    }

    private func scheduleHide() {
        controlsTask?.cancel()
        controlsTask = Task {
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                withAnimation(.easeInOut(duration: 0.2)) { showControls = false }
            }
        }
    }
}
