import Foundation
import Combine

@MainActor
class ArticleDetailViewModel: ObservableObject {
    @Published var article: Article?
    @Published var voices: [Voice] = []
    @Published var selectedVoice: Voice?
    @Published var isLoading: Bool = false
    @Published var isGeneratingAudio: Bool = false
    @Published var error: String?
    @Published var wordTimings: [WordTiming] = []
    @Published var processedText: String = ""

    let audioPlayer = AudioPlayerService()
    private let api = APIClient.shared
    private var cancellables = Set<AnyCancellable>()

    init() {
        // Forward objectWillChange from audioPlayer to this ViewModel
        // This ensures SwiftUI updates when audioPlayer's @Published properties change
        audioPlayer.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.objectWillChange.send()
            }
            .store(in: &cancellables)
    }

    func loadArticle(id: Int) async {
        isLoading = true
        error = nil

        print("[ArticleDetailViewModel] Loading article id: \(id)")

        do {
            article = try await api.getArticle(id: id)
            print("[ArticleDetailViewModel] Loaded article: \(article?.title ?? "nil"), hasAudio: \(article?.hasAudioAvailable ?? false)")

            // If article already has audio, load it automatically
            if let article = article, article.hasAudioAvailable, let voiceId = article.audioVoiceId {
                print("[ArticleDetailViewModel] Article has existing audio, loading...")
                await loadExistingAudio(articleId: article.id, voiceId: voiceId)
            }
        } catch {
            print("[ArticleDetailViewModel] Error: \(error)")
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    private func loadExistingAudio(articleId: Int, voiceId: String) async {
        do {
            let response = try await api.generateAudio(id: articleId, voiceId: voiceId)
            wordTimings = response.wordTimings
            processedText = response.processedText
            audioPlayer.loadAudio(base64Data: response.audioData, timings: response.wordTimings)
            print("[ArticleDetailViewModel] Existing audio loaded successfully")
        } catch {
            print("[ArticleDetailViewModel] Failed to load existing audio: \(error)")
            // Don't show error - user can still generate audio manually
        }
    }

    func loadVoices() async {
        do {
            voices = try await api.getVoices()
            if selectedVoice == nil, let first = voices.first {
                selectedVoice = first
            }
        } catch {
            print("Failed to load voices: \(error)")
        }
    }

    func generateAudio() async {
        guard let article = article, let voice = selectedVoice else {
            error = "Please select a voice"
            return
        }

        isGeneratingAudio = true
        error = nil

        do {
            // Get chunk count and info about which chunks are already generated
            let chunkInfo = try await api.getAudioChunkCount(id: article.id, voiceId: voice.id)
            let totalChunks = chunkInfo.totalChunks
            let generatedChunks = chunkInfo.generatedChunks ?? []

            print("[ArticleDetailViewModel] Starting chunked audio generation: \(totalChunks) chunks, \(generatedChunks.count) already generated")

            // Prepare the audio player for chunked loading
            audioPlayer.prepareForChunkedAudio(totalChunks: totalChunks)

            // Load chunks sequentially
            for chunkIndex in 0..<totalChunks {
                print("[ArticleDetailViewModel] Requesting chunk \(chunkIndex + 1)/\(totalChunks)")

                let chunkResponse = try await api.generateAudioChunk(
                    id: article.id,
                    voiceId: voice.id,
                    chunkIndex: chunkIndex
                )

                // Add chunk to player
                audioPlayer.addChunk(
                    index: chunkResponse.chunkIndex,
                    base64Data: chunkResponse.audioData,
                    timings: chunkResponse.wordTimings
                )

                // After first chunk loads, we can start playing
                if chunkIndex == 0 {
                    isGeneratingAudio = false  // Hide main loading indicator
                    print("[ArticleDetailViewModel] First chunk ready, playback available")
                }
            }

            print("[ArticleDetailViewModel] All chunks loaded")

        } catch {
            print("[ArticleDetailViewModel] Audio generation failed: \(error)")
            self.error = error.localizedDescription
            isGeneratingAudio = false
        }
    }

    func markAsRead() async {
        guard let article = article else { return }
        do {
            try await api.markAsRead(id: article.id)
            self.article = Article(
                id: article.id,
                url: article.url,
                title: article.title,
                author: article.author,
                siteName: article.siteName,
                excerpt: article.excerpt,
                featuredImage: article.featuredImage,
                wordCount: article.wordCount,
                estimatedReadingTime: article.estimatedReadingTime,
                isRead: true,
                readAt: article.readAt,
                publicSlug: article.publicSlug,
                publicUrl: article.publicUrl,
                hasAudio: article.hasAudio,
                createdAt: article.createdAt,
                contentMarkdown: article.contentMarkdown,
                contentHtml: article.contentHtml,
                audioUrl: article.audioUrl,
                audioVoiceId: article.audioVoiceId
            )
        } catch {
            print("Failed to mark as read: \(error)")
        }
    }

    func cleanup() {
        audioPlayer.cleanup()
    }
}
