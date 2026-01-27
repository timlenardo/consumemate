import SwiftUI

struct ContentView: View {
    @EnvironmentObject var api: APIClient
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        Group {
            if api.isAuthenticated {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .animation(.easeInOut, value: api.isAuthenticated)
    }
}

#Preview {
    ContentView()
        .environmentObject(AuthViewModel())
        .environmentObject(APIClient.shared)
}
