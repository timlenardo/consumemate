import Foundation
import AVFoundation
import Combine

// Represents a loaded audio chunk
struct AudioChunk {
    let index: Int
    let data: Data
    let wordTimings: [WordTiming]
    let duration: TimeInterval
}

@MainActor
class AudioPlayerService: ObservableObject {
    @Published var isPlaying: Bool = false
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var currentWordIndex: Int = -1
    @Published var playbackRate: Float = 1.0
    @Published var isLoading: Bool = false
    @Published var error: String?

    // Chunk tracking
    @Published var chunksLoaded: Int = 0
    @Published var totalChunks: Int = 0
    @Published var isLoadingChunks: Bool = false
    @Published var isWaitingForNextChunk: Bool = false  // True when we've finished current chunk but next isn't ready

    private var player: AVAudioPlayer?
    private var chunks: [AudioChunk] = []
    private var allWordTimings: [WordTiming] = []
    private var currentChunkIndex: Int = 0
    private var chunkStartTimes: [TimeInterval] = []  // Cumulative start time for each chunk

    private var updateTimer: Timer?

    static let playbackSpeeds: [Float] = [1.0, 1.2, 1.5, 1.7, 2.0]
    static let skipSeconds: TimeInterval = 15

    init() {
        setupAudioSession()
    }

    private func setupAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("Failed to setup audio session: \(error)")
        }
    }

    // MARK: - Single audio loading (for backwards compatibility)

    func loadAudio(base64Data: String, timings: [WordTiming]) {
        guard let data = Data(base64Encoded: base64Data) else {
            self.error = "Failed to decode audio data"
            return
        }

        chunks = []
        allWordTimings = timings
        chunkStartTimes = [0]
        chunksLoaded = 1
        totalChunks = 1

        do {
            player = try AVAudioPlayer(data: data)
            player?.enableRate = true
            player?.prepareToPlay()
            player?.delegate = nil
            duration = player?.duration ?? 0
            currentTime = 0
            currentWordIndex = -1
            currentChunkIndex = 0

            chunks.append(AudioChunk(index: 0, data: data, wordTimings: timings, duration: duration))
        } catch {
            self.error = "Failed to load audio: \(error.localizedDescription)"
        }
    }

    // MARK: - Chunked audio loading

    func prepareForChunkedAudio(totalChunks: Int) {
        cleanup()
        self.totalChunks = totalChunks
        self.chunksLoaded = 0
        self.isLoadingChunks = true
        self.chunks = []
        self.allWordTimings = []
        self.chunkStartTimes = []
        self.duration = 0
        print("[AudioPlayer] Prepared for \(totalChunks) chunks")
    }

    func addChunk(index: Int, base64Data: String, timings: [WordTiming]) {
        guard let data = Data(base64Encoded: base64Data) else {
            print("[AudioPlayer] Failed to decode chunk \(index)")
            return
        }

        do {
            // Create a temporary player to get duration
            let tempPlayer = try AVAudioPlayer(data: data)
            let chunkDuration = tempPlayer.duration

            let chunk = AudioChunk(index: index, data: data, wordTimings: timings, duration: chunkDuration)
            chunks.append(chunk)
            chunks.sort { $0.index < $1.index }

            // Recalculate total duration and chunk start times
            recalculateTimings()

            chunksLoaded = chunks.count

            print("[AudioPlayer] Added chunk \(index + 1)/\(totalChunks), duration: \(String(format: "%.1f", chunkDuration))s, total: \(String(format: "%.1f", duration))s")

            // If this is the first chunk, load it into the player
            if index == 0 && player == nil {
                player = try AVAudioPlayer(data: data)
                player?.enableRate = true
                player?.rate = playbackRate
                player?.prepareToPlay()
                currentChunkIndex = 0
                print("[AudioPlayer] First chunk loaded into player")
            }

            // If we were waiting for this chunk and it's the next one we need, resume playback
            if isWaitingForNextChunk && index == currentChunkIndex + 1 {
                print("[AudioPlayer] Next chunk arrived, resuming playback")
                isWaitingForNextChunk = false
                advanceToNextChunk()
            }

            // Check if all chunks are loaded
            if chunksLoaded == totalChunks {
                isLoadingChunks = false
                print("[AudioPlayer] All \(totalChunks) chunks loaded, total duration: \(String(format: "%.1f", duration))s")
            }
        } catch {
            print("[AudioPlayer] Failed to process chunk \(index): \(error)")
        }
    }

    private func recalculateTimings() {
        var cumulativeTime: TimeInterval = 0
        chunkStartTimes = []
        allWordTimings = []

        for chunk in chunks.sorted(by: { $0.index < $1.index }) {
            chunkStartTimes.append(cumulativeTime)

            // Adjust word timings to global time
            for timing in chunk.wordTimings {
                let adjustedTiming = WordTiming(
                    word: timing.word,
                    start: timing.start + Int(cumulativeTime * 1000),
                    end: timing.end + Int(cumulativeTime * 1000)
                )
                allWordTimings.append(adjustedTiming)
            }

            cumulativeTime += chunk.duration
        }

        duration = cumulativeTime
    }

    var canPlay: Bool {
        return chunksLoaded > 0 && player != nil
    }

    // MARK: - Playback controls

    func play() {
        guard let player = player else { return }

        // If we were waiting for the next chunk, don't play until it arrives
        if isWaitingForNextChunk {
            print("[AudioPlayer] Still waiting for next chunk, can't play yet")
            return
        }

        player.rate = playbackRate
        player.play()
        isPlaying = true
        startUpdateTimer()
        print("[AudioPlayer] Started playback at rate \(playbackRate)x")
    }

    func pause() {
        player?.pause()
        isPlaying = false
        isWaitingForNextChunk = false
        stopUpdateTimer()
        print("[AudioPlayer] Paused")
    }

    func togglePlayPause() {
        if isPlaying || isWaitingForNextChunk {
            pause()
        } else {
            play()
        }
    }

    func seek(to time: TimeInterval) {
        let targetTime = max(0, min(time, duration))

        // Find which chunk this time falls into
        var targetChunkIndex = 0
        for (index, startTime) in chunkStartTimes.enumerated() {
            if index < chunks.count {
                let endTime = startTime + chunks[index].duration
                if targetTime >= startTime && targetTime < endTime {
                    targetChunkIndex = index
                    break
                }
                // Handle case where targetTime is exactly at the end
                if targetTime >= endTime && index == chunks.count - 1 {
                    targetChunkIndex = index
                }
            }
        }

        // If we need to switch chunks
        if targetChunkIndex != currentChunkIndex && targetChunkIndex < chunks.count {
            loadChunkIntoPlayer(targetChunkIndex)
        }

        // Seek within the current chunk
        if let player = player, currentChunkIndex < chunkStartTimes.count {
            let chunkStartTime = chunkStartTimes[currentChunkIndex]
            let timeInChunk = targetTime - chunkStartTime
            player.currentTime = max(0, min(timeInChunk, player.duration))
        }

        currentTime = targetTime
        updateCurrentWord()
    }

    func skipForward() {
        seek(to: currentTime + Self.skipSeconds)
    }

    func skipBackward() {
        seek(to: currentTime - Self.skipSeconds)
    }

    func setPlaybackRate(_ rate: Float) {
        playbackRate = rate
        player?.rate = rate
        print("[AudioPlayer] Playback rate set to \(rate)x")
    }

    func cyclePlaybackRate() {
        // Find current rate index with tolerance for floating point comparison
        let currentIndex = Self.playbackSpeeds.firstIndex { abs($0 - playbackRate) < 0.05 } ?? -1
        let nextIndex = (currentIndex + 1) % Self.playbackSpeeds.count
        setPlaybackRate(Self.playbackSpeeds[nextIndex])
    }

    func stop() {
        player?.stop()
        isPlaying = false
        isWaitingForNextChunk = false
        currentTime = 0
        currentWordIndex = -1
        currentChunkIndex = 0
        stopUpdateTimer()
    }

    func cleanup() {
        stop()
        player = nil
        chunks = []
        allWordTimings = []
        chunkStartTimes = []
        chunksLoaded = 0
        totalChunks = 0
        duration = 0
        isLoadingChunks = false
        isWaitingForNextChunk = false
    }

    // MARK: - Chunk management

    private func loadChunkIntoPlayer(_ chunkIndex: Int) {
        guard chunkIndex < chunks.count else { return }

        let wasPlaying = isPlaying
        player?.stop()

        do {
            let chunk = chunks[chunkIndex]
            player = try AVAudioPlayer(data: chunk.data)
            player?.enableRate = true
            player?.rate = playbackRate
            player?.prepareToPlay()
            currentChunkIndex = chunkIndex

            if wasPlaying {
                player?.play()
            }

            print("[AudioPlayer] Loaded chunk \(chunkIndex + 1) into player")
        } catch {
            print("[AudioPlayer] Failed to load chunk \(chunkIndex): \(error)")
        }
    }

    private func advanceToNextChunk() {
        let nextIndex = currentChunkIndex + 1

        if nextIndex < chunks.count {
            // Next chunk is available
            loadChunkIntoPlayer(nextIndex)
            player?.play()
            print("[AudioPlayer] Advanced to chunk \(nextIndex + 1)")
        } else if nextIndex < totalChunks {
            // Next chunk isn't loaded yet but more chunks are expected
            isWaitingForNextChunk = true
            print("[AudioPlayer] Waiting for chunk \(nextIndex + 1) to load...")
        } else {
            // Playback complete
            isPlaying = false
            isWaitingForNextChunk = false
            stopUpdateTimer()
            print("[AudioPlayer] Playback complete")
        }
    }

    // MARK: - Timer for time updates (replaces CADisplayLink for @MainActor compatibility)

    private func startUpdateTimer() {
        stopUpdateTimer()
        // Use a timer at 60fps equivalent for smooth updates
        updateTimer = Timer.scheduledTimer(withTimeInterval: 1.0/30.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateTime()
            }
        }
    }

    private func stopUpdateTimer() {
        updateTimer?.invalidate()
        updateTimer = nil
    }

    private func updateTime() {
        guard let player = player else { return }

        // Calculate global time
        let chunkStartTime = currentChunkIndex < chunkStartTimes.count ? chunkStartTimes[currentChunkIndex] : 0
        currentTime = chunkStartTime + player.currentTime

        // Check if current chunk finished
        if !player.isPlaying && isPlaying && player.currentTime >= player.duration - 0.05 {
            advanceToNextChunk()
        }

        updateCurrentWord()
    }

    private func updateCurrentWord() {
        let currentMs = Int(currentTime * 1000)

        for (index, timing) in allWordTimings.enumerated() {
            if currentMs >= timing.start && currentMs < timing.end {
                if currentWordIndex != index {
                    currentWordIndex = index
                }
                return
            }
        }
    }

    // MARK: - Formatting helpers

    static func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}
