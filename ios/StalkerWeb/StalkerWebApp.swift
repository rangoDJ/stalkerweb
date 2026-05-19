import SwiftUI

@main
struct StalkerWebApp: App {
    @StateObject private var prefs: AppPrefs
    private let repository: ChannelRepository

    init() {
        let prefs = AppPrefs()
        _prefs = StateObject(wrappedValue: prefs)
        repository = ChannelRepository(prefs: prefs)
    }

    var body: some Scene {
        WindowGroup {
            RootView(repository: repository)
                .environmentObject(prefs)
                .tint(.indigo)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var prefs: AppPrefs
    let repository: ChannelRepository

    var body: some View {
        if prefs.serverUrl != nil {
            ChannelsView(repository: repository)
        } else {
            SetupView(repository: repository)
        }
    }
}
