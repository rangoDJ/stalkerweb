import SwiftUI

struct SetupView: View {
    @StateObject private var viewModel: SetupViewModel

    @EnvironmentObject private var prefs: AppPrefs

    init(repository: ChannelRepository) {
        _viewModel = StateObject(wrappedValue: SetupViewModel(repository: repository))
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 32) {
                // Logo
                VStack(spacing: 12) {
                    Image(systemName: "tv.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(.indigo)
                    Text("StalkerWeb")
                        .font(.largeTitle.bold())
                    Text("Enter your server URL to connect")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                // URL field
                VStack(alignment: .leading, spacing: 8) {
                    Text("Server URL")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("http://192.168.1.100:3000", text: $viewModel.serverUrl)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onSubmit { viewModel.connect() }
                }

                // Error
                if let error = viewModel.error {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundStyle(.red)
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                    .padding(12)
                    .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                }

                // Connect button
                Button(action: viewModel.connect) {
                    HStack {
                        if viewModel.isConnecting {
                            ProgressView().tint(.white)
                        }
                        Text(viewModel.isConnecting ? "Connecting…" : "Connect")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isConnecting || viewModel.serverUrl.isEmpty)
                .controlSize(.large)
            }
            .padding(32)

            Spacer()
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
    }
}
