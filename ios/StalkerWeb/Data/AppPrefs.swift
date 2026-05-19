import Foundation

class AppPrefs: ObservableObject {
    @Published var serverUrl: String? {
        didSet { UserDefaults.standard.set(serverUrl, forKey: "serverUrl") }
    }

    init() {
        serverUrl = UserDefaults.standard.string(forKey: "serverUrl")
    }
}
