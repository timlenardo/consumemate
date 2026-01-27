import SwiftUI

@main
struct ConsumemateApp: App {
    @StateObject private var authViewModel = AuthViewModel()
    @StateObject private var api = APIClient.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authViewModel)
                .environmentObject(api)
                .task {
                    await authViewModel.loadAccount()
                }
        }
    }
}
