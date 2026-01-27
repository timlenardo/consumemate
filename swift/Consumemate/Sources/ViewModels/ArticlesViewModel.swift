import Foundation

@MainActor
class ArticlesViewModel: ObservableObject {
    @Published var articles: [ArticleSummary] = []
    @Published var isLoading: Bool = false
    @Published var error: String?
    @Published var filter: ArticleFilter = .all

    enum ArticleFilter: String, CaseIterable {
        case all = "all"
        case unread = "unread"
        case read = "read"

        var displayName: String {
            switch self {
            case .all: return "All"
            case .unread: return "Unread"
            case .read: return "Read"
            }
        }
    }

    private let api = APIClient.shared

    func loadArticles() async {
        isLoading = true
        error = nil

        do {
            print("[ArticlesViewModel] Loading articles with filter: \(filter.rawValue)")
            print("[ArticlesViewModel] API authenticated: \(api.isAuthenticated)")
            articles = try await api.getArticles(filter: filter.rawValue)
            print("[ArticlesViewModel] Loaded \(articles.count) articles")
        } catch {
            print("[ArticlesViewModel] Error: \(error)")
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func deleteArticle(_ article: ArticleSummary) async {
        do {
            try await api.deleteArticle(id: article.id)
            articles.removeAll { $0.id == article.id }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func toggleReadStatus(_ article: ArticleSummary) async {
        do {
            if article.isArticleRead {
                try await api.markAsUnread(id: article.id)
            } else {
                try await api.markAsRead(id: article.id)
            }
            // Reload to get updated state
            await loadArticles()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
