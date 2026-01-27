import SwiftUI

struct ArticlesListView: View {
    @StateObject private var viewModel = ArticlesViewModel()
    @State private var showError = false

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.articles.isEmpty {
                    ProgressView("Loading articles...")
                } else if let error = viewModel.error {
                    errorView(error)
                } else if viewModel.articles.isEmpty {
                    emptyStateView
                } else {
                    articlesList
                }
            }
            .navigationTitle("Articles")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    filterMenu
                }
            }
            .refreshable {
                await viewModel.loadArticles()
            }
            .task {
                await viewModel.loadArticles()
            }
        }
    }

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 60))
                .foregroundColor(.orange)
            Text("Error loading articles")
                .font(.title2)
            Text(error)
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Button("Retry") {
                Task {
                    await viewModel.loadArticles()
                }
            }
            .buttonStyle(.bordered)
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "doc.text")
                .font(.system(size: 60))
                .foregroundColor(.secondary)
            Text("No articles yet")
                .font(.title2)
                .foregroundColor(.secondary)
            Text("Save articles from the web using the browser extension")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
    }

    private var articlesList: some View {
        List {
            ForEach(viewModel.articles) { article in
                NavigationLink(destination: ArticleDetailView(articleId: article.id)) {
                    ArticleRowView(article: article)
                }
            }
            .onDelete { indexSet in
                Task {
                    for index in indexSet {
                        await viewModel.deleteArticle(viewModel.articles[index])
                    }
                }
            }
        }
        .listStyle(.plain)
    }

    private var filterMenu: some View {
        Menu {
            ForEach(ArticlesViewModel.ArticleFilter.allCases, id: \.self) { filter in
                Button(action: {
                    viewModel.filter = filter
                    Task {
                        await viewModel.loadArticles()
                    }
                }) {
                    HStack {
                        Text(filter.displayName)
                        if viewModel.filter == filter {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
        }
    }
}

struct ArticleRowView: View {
    let article: ArticleSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(article.title)
                .font(.headline)
                .lineLimit(2)
                .foregroundColor(article.isArticleRead ? .secondary : .primary)

            HStack(spacing: 12) {
                if let siteName = article.siteName {
                    Text(siteName)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                if let wordCount = article.wordCount {
                    Text("\(wordCount) words")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                if let readingTime = article.estimatedReadingTime {
                    Text("\(readingTime) min")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                if article.hasAudioAvailable {
                    Image(systemName: "waveform")
                        .font(.caption)
                        .foregroundColor(.green)
                }

                if article.isArticleRead {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundColor(.green)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    ArticlesListView()
        .environmentObject(APIClient.shared)
}
