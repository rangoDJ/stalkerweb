import Foundation

@MainActor
class SetupViewModel: ObservableObject {
    @Published var serverUrl: String = ""
    @Published var isConnecting = false
    @Published var error: String? = nil

    private let repository: ChannelRepository
    var onConnected: (() -> Void)?

    init(repository: ChannelRepository) {
        self.repository = repository
        serverUrl = repository.prefs.serverUrl ?? ""
    }

    func connect() {
        var url = serverUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !url.isEmpty else { error = "Please enter the server URL"; return }
        if !url.lowercased().hasPrefix("http") { url = "http://\(url)" }
        url = url.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        isConnecting = true
        error = nil

        Task {
            do {
                repository.configure(serverUrl: url)
                let status = try await repository.testConnection()
                if status.connected {
                    onConnected?()
                } else {
                    error = "Backend is not connected to a portal. Open the web UI to configure it first."
                    repository.configure(serverUrl: "")
                }
            } catch {
                self.error = error.localizedDescription
                repository.configure(serverUrl: "")
            }
            isConnecting = false
        }
    }
}
