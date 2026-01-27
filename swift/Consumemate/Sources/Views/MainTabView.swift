import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            ArticlesListView()
                .tabItem {
                    Label("Articles", systemImage: "doc.text")
                }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
        }
        .tint(.green)
    }
}

#Preview {
    MainTabView()
        .environmentObject(AuthViewModel())
        .environmentObject(APIClient.shared)
}
