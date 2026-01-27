import SwiftUI

struct ArticleDetailView: View {
    let articleId: Int

    @StateObject private var viewModel = ArticleDetailViewModel()
    @State private var showVoiceSelector = false

    var body: some View {
        ZStack(alignment: .bottom) {
            // Main content - takes full space
            if viewModel.isLoading {
                VStack {
                    Spacer()
                    ProgressView("Loading article...")
                    Spacer()
                }
            } else if let error = viewModel.error {
                errorView(error)
            } else if let article = viewModel.article {
                articleContent(article)
            } else {
                VStack {
                    Spacer()
                    ProgressView()
                    Text("Loading...")
                    Spacer()
                }
            }

            // Bottom audio controls - pinned at bottom
            VStack(spacing: 0) {
                Spacer()
                if viewModel.audioPlayer.canPlay || viewModel.audioPlayer.isLoadingChunks {
                    bottomAudioBar
                } else if viewModel.article != nil {
                    generateAudioBar
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .sheet(isPresented: $showVoiceSelector) {
            VoiceSelectorView(
                voices: viewModel.voices,
                selectedVoice: $viewModel.selectedVoice,
                onGenerate: {
                    showVoiceSelector = false
                    Task {
                        await viewModel.generateAudio()
                    }
                }
            )
        }
        .task {
            await viewModel.loadArticle(id: articleId)
            await viewModel.loadVoices()
        }
        .onDisappear {
            viewModel.cleanup()
        }
    }

    // MARK: - Bottom Audio Bar (when audio is loaded)
    private var bottomAudioBar: some View {
        VStack(spacing: 0) {
            Divider()

            VStack(spacing: 12) {
                // Chunk loading indicator
                if viewModel.audioPlayer.isLoadingChunks || viewModel.audioPlayer.isWaitingForNextChunk {
                    HStack(spacing: 8) {
                        ProgressView()
                            .scaleEffect(0.8)
                        if viewModel.audioPlayer.isWaitingForNextChunk {
                            Text("Buffering next chunk...")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        } else {
                            Text("Loading \(viewModel.audioPlayer.chunksLoaded)/\(viewModel.audioPlayer.totalChunks) chunks...")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                // Progress bar
                Slider(
                    value: Binding(
                        get: { viewModel.audioPlayer.currentTime },
                        set: { viewModel.audioPlayer.seek(to: $0) }
                    ),
                    in: 0...max(viewModel.audioPlayer.duration, 1)
                )
                .tint(.green)
                .disabled(!viewModel.audioPlayer.canPlay)

                HStack {
                    // Current time / Total duration
                    Text("\(AudioPlayerService.formatTime(viewModel.audioPlayer.currentTime)) / \(AudioPlayerService.formatTime(viewModel.audioPlayer.duration))")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .frame(width: 80, alignment: .leading)

                    Spacer()

                    // Controls
                    HStack(spacing: 24) {
                        Button(action: { viewModel.audioPlayer.skipBackward() }) {
                            Image(systemName: "gobackward.15")
                                .font(.title2)
                        }
                        .disabled(!viewModel.audioPlayer.canPlay)

                        Button(action: { viewModel.audioPlayer.togglePlayPause() }) {
                            ZStack {
                                // Show loading indicator when waiting for chunk
                                if viewModel.audioPlayer.isWaitingForNextChunk {
                                    ProgressView()
                                        .scaleEffect(1.5)
                                } else {
                                    Image(systemName: viewModel.audioPlayer.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                                        .font(.system(size: 44))
                                        .foregroundColor(viewModel.audioPlayer.canPlay ? .green : .gray)
                                }
                            }
                            .frame(width: 44, height: 44)
                        }
                        .disabled(!viewModel.audioPlayer.canPlay && !viewModel.audioPlayer.isWaitingForNextChunk)

                        Button(action: { viewModel.audioPlayer.skipForward() }) {
                            Image(systemName: "goforward.15")
                                .font(.title2)
                        }
                        .disabled(!viewModel.audioPlayer.canPlay)
                    }

                    Spacer()

                    // Speed
                    Button(action: { viewModel.audioPlayer.cyclePlaybackRate() }) {
                        Text("\(String(format: "%.1f", viewModel.audioPlayer.playbackRate))x")
                            .font(.caption)
                            .fontWeight(.medium)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color(.systemGray5))
                            .cornerRadius(4)
                    }
                }
            }
            .padding()
            .background(Color(.systemBackground))
        }
    }

    // MARK: - Generate Audio Bar (when no audio yet)
    private var generateAudioBar: some View {
        VStack(spacing: 0) {
            Divider()

            if viewModel.isGeneratingAudio {
                HStack {
                    ProgressView()
                        .padding(.trailing, 8)
                    Text("Generating audio...")
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(.systemBackground))
            } else {
                Button(action: { showVoiceSelector = true }) {
                    HStack {
                        Image(systemName: "headphones.circle.fill")
                            .font(.title2)
                        Text("Generate Audio")
                            .fontWeight(.medium)
                    }
                    .foregroundColor(.green)
                    .frame(maxWidth: .infinity)
                    .padding()
                }
                .background(Color(.systemBackground))
            }
        }
    }

    private func articleContent(_ article: Article) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(article.title)
                    .font(.title)
                    .fontWeight(.bold)

                if let author = article.author {
                    Text("By \(author)")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                HStack(spacing: 16) {
                    if let wordCount = article.wordCount {
                        Label("\(wordCount) words", systemImage: "text.word.spacing")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    if let readingTime = article.estimatedReadingTime {
                        Label("\(readingTime) min read", systemImage: "clock")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                Divider()

                if viewModel.audioPlayer.isPlaying && !viewModel.wordTimings.isEmpty {
                    highlightedTextView
                } else {
                    markdownContent(article.markdown)
                }
            }
            .padding()
        }
    }

    private var highlightedTextView: some View {
        // Build attributed string with highlighted current word
        let text = Text(buildHighlightedText())
            .font(.custom("Georgia", size: 18))
            .lineSpacing(8)
        return text
    }

    private func buildHighlightedText() -> AttributedString {
        var result = AttributedString()
        let currentIndex = viewModel.audioPlayer.currentWordIndex

        for (index, timing) in viewModel.wordTimings.enumerated() {
            var wordStr = AttributedString(timing.word + " ")

            if index == currentIndex {
                wordStr.backgroundColor = .green.opacity(0.3)
                wordStr.foregroundColor = .primary
            } else if index < currentIndex {
                wordStr.foregroundColor = .secondary
            }

            result.append(wordStr)
        }

        return result
    }

    private func markdownContent(_ content: String) -> some View {
        // Simple markdown rendering - converts basic formatting
        Text(content.replacingOccurrences(of: "**", with: "")
            .replacingOccurrences(of: "__", with: "")
            .replacingOccurrences(of: "*", with: "")
            .replacingOccurrences(of: "_", with: "")
            .replacingOccurrences(of: "#", with: ""))
            .font(.custom("Georgia", size: 18))
            .lineSpacing(8)
    }

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundColor(.orange)
            Text(error)
                .multilineTextAlignment(.center)
            Button("Retry") {
                Task {
                    await viewModel.loadArticle(id: articleId)
                }
            }
            .buttonStyle(.bordered)
        }
        .padding()
    }
}

// MARK: - Voice Selector

struct VoiceSelectorView: View {
    let voices: [Voice]
    @Binding var selectedVoice: Voice?
    let onGenerate: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(voices) { voice in
                Button(action: {
                    selectedVoice = voice
                }) {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(voice.name)
                                .foregroundColor(.primary)
                            if let category = voice.category {
                                Text(category)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        Spacer()
                        if selectedVoice?.id == voice.id {
                            Image(systemName: "checkmark")
                                .foregroundColor(.green)
                        }
                    }
                }
            }
            .navigationTitle("Select Voice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Generate Audio") {
                        onGenerate()
                    }
                    .disabled(selectedVoice == nil)
                    .fontWeight(.semibold)
                }
            }
        }
    }
}

// MARK: - Audio Controls

struct AudioControlsView: View {
    @ObservedObject var audioPlayer: AudioPlayerService
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 24) {
            // Drag indicator
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.secondary.opacity(0.5))
                .frame(width: 40, height: 4)
                .padding(.top, 8)

            Text("Now Playing")
                .font(.headline)

            // Progress
            VStack(spacing: 8) {
                Slider(
                    value: Binding(
                        get: { audioPlayer.currentTime },
                        set: { audioPlayer.seek(to: $0) }
                    ),
                    in: 0...max(audioPlayer.duration, 1)
                )
                .tint(.green)

                HStack {
                    Text(AudioPlayerService.formatTime(audioPlayer.currentTime))
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text(AudioPlayerService.formatTime(audioPlayer.duration))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal)

            // Controls
            HStack(spacing: 40) {
                Button(action: { audioPlayer.skipBackward() }) {
                    Image(systemName: "gobackward.15")
                        .font(.title)
                }

                Button(action: { audioPlayer.togglePlayPause() }) {
                    Image(systemName: audioPlayer.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 64))
                        .foregroundColor(.green)
                }

                Button(action: { audioPlayer.skipForward() }) {
                    Image(systemName: "goforward.15")
                        .font(.title)
                }
            }

            // Speed control
            Button(action: { audioPlayer.cyclePlaybackRate() }) {
                Text("\(String(format: "%.1f", audioPlayer.playbackRate))x")
                    .font(.headline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color(.systemGray5))
                    .cornerRadius(8)
            }

            Spacer()
        }
        .padding()
    }
}

#Preview {
    NavigationStack {
        ArticleDetailView(articleId: 1)
    }
}
