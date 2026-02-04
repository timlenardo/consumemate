import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  Alert,
  Modal,
  Share,
  Linking,
  Pressable,
  Dimensions,
  Animated,
} from 'react-native'
import Slider from '@react-native-community/slider'
import { useLocalSearchParams, router } from 'expo-router'
import { Audio, AVPlaybackStatus } from 'expo-av'
import { Ionicons } from '@expo/vector-icons'
import ViewShot from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import Markdown from 'react-native-markdown-display'
import { colors, spacing, borderRadius } from '@/constants/theme'
import { api, Article, Voice, WordTiming } from '@/lib/api'
import { useAuth } from '@/lib/AuthContext'
import { ttsService, TTSProviderType, AVSpeechProvider } from '@/lib/tts'

const PLAYBACK_SPEEDS = [1.0, 1.2, 1.5, 1.7, 2.0]
const SKIP_SECONDS = 15
const { height: SCREEN_HEIGHT } = Dimensions.get('window')

// Helper to show error alert
function showErrorAlert(title: string, message: string) {
  Alert.alert(title, message)
}

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const colorScheme = useColorScheme()
  const theme = colors[colorScheme ?? 'light']
  const { account, updateAccount } = useAuth()

  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [audioLoading, setAudioLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioPosition, setAudioPosition] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const [showPlayerControls, setShowPlayerControls] = useState(false)
  const [wordTimings, setWordTimings] = useState<WordTiming[]>([])
  const [audioText, setAudioText] = useState('')
  const [selectedText, setSelectedText] = useState('')
  const [showShareModal, setShowShareModal] = useState(false)
  const [voices, setVoices] = useState<Voice[]>([])

  // Chunked audio state
  const [audioChunks, setAudioChunks] = useState<{ data: string; contentType: string }[]>([])
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [chunkLoadingProgress, setChunkLoadingProgress] = useState('')
  const [chunkDurations, setChunkDurations] = useState<number[]>([]) // Debug: track each chunk's duration

  // New modal states
  const [showVoiceSelectionModal, setShowVoiceSelectionModal] = useState(false)
  const [showAudioControlModal, setShowAudioControlModal] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null)
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null)
  const [playFromParagraphIndex, setPlayFromParagraphIndex] = useState<number | null>(null)

  // TTS Provider state - 'elevenlabs' | 'edge' | 'avspeech'
  type AppTTSProvider = 'elevenlabs' | 'edge' | 'avspeech'
  const [ttsProvider, setTtsProvider] = useState<AppTTSProvider>('elevenlabs')
  const [avSpeechVoices, setAvSpeechVoices] = useState<Voice[]>([])
  const [selectedAvVoice, setSelectedAvVoice] = useState<Voice | null>(null)
  const [edgeVoices, setEdgeVoices] = useState<Voice[]>([])
  const [selectedEdgeVoice, setSelectedEdgeVoice] = useState<Voice | null>(null)

  // Auto-scroll states
  const [userHasScrolled, setUserHasScrolled] = useState(false)
  const [showReturnButton, setShowReturnButton] = useState(false)
  const [currentWordY, setCurrentWordY] = useState(0)

  const soundRef = useRef<Audio.Sound | null>(null)
  const previewSoundRef = useRef<Audio.Sound | null>(null)
  const viewShotRef = useRef<ViewShot>(null)
  const scrollViewRef = useRef<ScrollView>(null)
  const wordPositionsRef = useRef<Map<number, number>>(new Map())
  const isAutoScrollingRef = useRef(false)
  const lastScrollYRef = useRef(0)
  const highlightedTextOffsetRef = useRef(0) // Y offset of the highlighted text container

  // Chunked audio refs
  const audioChunksRef = useRef<{ data: string; contentType: string }[]>([])
  const isLoadingChunksRef = useRef(false)
  const shouldStopLoadingRef = useRef(false)
  const playbackSpeedRef = useRef(1.0) // Track current speed for chunk transitions
  const isTogglingPlaybackRef = useRef(false) // Prevent race conditions on play/pause

  // Animation values for half-modal
  const overlayOpacity = useRef(new Animated.Value(0)).current
  const modalSlideY = useRef(new Animated.Value(300)).current

  useEffect(() => {
    loadArticle()
    loadVoices()
    loadAvSpeechVoices()
    loadEdgeVoices()

    return () => {
      // Stop loading chunks
      shouldStopLoadingRef.current = true
      isLoadingChunksRef.current = false

      if (soundRef.current) {
        soundRef.current.unloadAsync()
      }
      if (previewSoundRef.current) {
        previewSoundRef.current.unloadAsync()
      }
    }
  }, [id])

  // Set selected voice when voices load or account changes
  useEffect(() => {
    if (voices.length > 0) {
      const preferredVoice = voices.find(v => v.id === account?.preferredVoiceId)
      setSelectedVoice(preferredVoice || voices[0])
    }
  }, [voices, account?.preferredVoiceId])

  // Animate half-modal open/close
  useEffect(() => {
    if (showAudioControlModal) {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(modalSlideY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(modalSlideY, {
          toValue: 300,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [showAudioControlModal])

  const loadArticle = async () => {
    try {
      const data = await api.getArticle(parseInt(id, 10))
      setArticle(data)
    } catch (error) {
      Alert.alert('Error', 'Failed to load article')
      router.back()
    } finally {
      setLoading(false)
    }
  }

  const loadVoices = async () => {
    try {
      const { voices: voiceList } = await api.getVoices()
      setVoices(voiceList)
    } catch (error) {
      console.error('Failed to load voices:', error)
    }
  }

  const loadAvSpeechVoices = async () => {
    try {
      const avProvider = ttsService.getAVSpeechProvider()
      const avVoices = await avProvider.getVoices()
      setAvSpeechVoices(avVoices)
      if (avVoices.length > 0 && !selectedAvVoice) {
        setSelectedAvVoice(avVoices[0])
      }
    } catch (error) {
      console.error('Failed to load AVSpeech voices:', error)
    }
  }

  const loadEdgeVoices = async () => {
    try {
      const { voices } = await api.getVoices('edge')
      setEdgeVoices(voices)
      if (voices.length > 0 && !selectedEdgeVoice) {
        setSelectedEdgeVoice(voices[0])
      }
    } catch (error) {
      console.error('Failed to load Edge TTS voices:', error)
    }
  }

  // Generate audio using Edge TTS (backend, free)
  const generateAudioWithEdge = async () => {
    if (!article || !selectedEdgeVoice) return

    setShowAudioControlModal(false)
    setAudioLoading(true)
    shouldStopLoadingRef.current = false

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync()
        soundRef.current = null
      }

      // Reset chunk state
      setAudioChunks([])
      audioChunksRef.current = []
      setCurrentChunkIndex(0)
      setTotalChunks(0)
      setAudioDuration(0)
      setChunkDurations([])

      // Get total chunk count
      setChunkLoadingProgress('Preparing audio...')
      const { totalChunks: total } = await api.getAudioChunkCount(article.id, selectedEdgeVoice.id)
      setTotalChunks(total)
      console.log(`[EdgeTTS] Total chunks: ${total}`)

      // Generate and play chunks sequentially
      isLoadingChunksRef.current = true
      let allWordTimings: WordTiming[] = []
      let cumulativeDuration = 0

      for (let i = 0; i < total && !shouldStopLoadingRef.current; i++) {
        setChunkLoadingProgress(`Loading audio ${i + 1}/${total}...`)
        console.log(`[EdgeTTS] Generating chunk ${i + 1}/${total}`)

        const chunkResult = await api.generateAudioChunk(article.id, selectedEdgeVoice.id, i, 'edge')

        // Store the chunk
        const chunkData = { data: chunkResult.audioData, contentType: chunkResult.contentType }
        audioChunksRef.current = [...audioChunksRef.current, chunkData]
        setAudioChunks(audioChunksRef.current)

        // Accumulate word timings with offset
        if (chunkResult.wordTimings && chunkResult.wordTimings.length > 0) {
          const offsetTimings = chunkResult.wordTimings.map(t => ({
            ...t,
            start: t.start + cumulativeDuration,
            end: t.end + cumulativeDuration,
          }))
          allWordTimings = [...allWordTimings, ...offsetTimings]
          setWordTimings(allWordTimings)
        }

        // Estimate chunk duration from file size
        const chunkBytes = chunkResult.audioData.length * 0.75
        const chunkDurationMs = chunkBytes / 16
        cumulativeDuration += chunkDurationMs
        setAudioDuration(cumulativeDuration)
        setChunkDurations(prev => [...prev, chunkDurationMs])

        // Start playing immediately when first chunk is ready
        if (i === 0) {
          setAudioLoading(false)
          setShowPlayerControls(true)
          setIsPlaying(true)
          playChunk(0, audioChunksRef.current)
        }
      }

      isLoadingChunksRef.current = false
      setChunkLoadingProgress('')
      setArticle({ ...article, audioUrl: 'cached', audioVoiceId: selectedEdgeVoice.id })

    } catch (error: any) {
      console.error('[EdgeTTS] Error:', error)
      showErrorAlert('Audio Error', error.message || 'Failed to generate audio')
      isLoadingChunksRef.current = false
      setChunkLoadingProgress('')
    } finally {
      if (isLoadingChunksRef.current === false) {
        setAudioLoading(false)
      }
    }
  }

  // Generate audio using AVSpeechSynthesizer (on-device)
  const generateAudioWithAVSpeech = async () => {
    if (!article || !selectedAvVoice) return

    setShowAudioControlModal(false)
    setAudioLoading(true)
    shouldStopLoadingRef.current = false

    try {
      const avProvider = ttsService.getAVSpeechProvider()
      const text = article.contentMarkdown

      // Get word timings (estimated) for display
      const chunks: string[] = []
      const totalChunks = avProvider.getChunkCount(text)
      setTotalChunks(totalChunks)

      let allWordTimings: WordTiming[] = []
      let cumulativeDuration = 0

      // Pre-calculate word timings for all chunks
      for (let i = 0; i < totalChunks; i++) {
        const chunkResult = await avProvider.generateChunk(text, selectedAvVoice.id, i)
        // Offset word timings
        const offsetTimings = chunkResult.wordTimings.map(t => ({
          ...t,
          start: t.start + cumulativeDuration,
          end: t.end + cumulativeDuration,
        }))
        allWordTimings = [...allWordTimings, ...offsetTimings]
        // Estimate chunk duration based on word count
        const chunkDurationMs = chunkResult.wordTimings.length * 300
        cumulativeDuration += chunkDurationMs
      }

      setWordTimings(allWordTimings)
      setAudioDuration(cumulativeDuration)
      setAudioLoading(false)
      setShowPlayerControls(true)

      // Start playing with AVSpeech
      playWithAVSpeech(0)

    } catch (error: any) {
      console.error('[AVSpeech] Error:', error)
      showErrorAlert('Audio Error', error.message || 'Failed to generate audio')
      setAudioLoading(false)
    }
  }

  // Play using AVSpeechSynthesizer
  const playWithAVSpeech = async (startChunk: number = 0) => {
    if (!article || !selectedAvVoice) return

    const avProvider = ttsService.getAVSpeechProvider()
    const text = article.contentMarkdown
    const totalChunks = avProvider.getChunkCount(text)

    setIsPlaying(true)
    setCurrentChunkIndex(startChunk)

    // Play chunks sequentially
    const playNextChunk = async (chunkIndex: number) => {
      if (shouldStopLoadingRef.current || chunkIndex >= totalChunks) {
        setIsPlaying(false)
        return
      }

      setCurrentChunkIndex(chunkIndex)

      // Update position based on estimated timing
      const estimatedPosition = chunkIndex * 500 * 300 // rough estimate
      setAudioPosition(estimatedPosition)

      try {
        await avProvider.speakChunk(text, selectedAvVoice.id, chunkIndex, {
          rate: playbackSpeedRef.current,
          onDone: () => {
            if (!shouldStopLoadingRef.current) {
              playNextChunk(chunkIndex + 1)
            }
          },
          onStopped: () => {
            setIsPlaying(false)
          },
        })
      } catch (error) {
        console.error('[AVSpeech] Playback error:', error)
        setIsPlaying(false)
      }
    }

    playNextChunk(startChunk)
  }

  // Stop AVSpeech playback
  const stopAVSpeech = () => {
    const avProvider = ttsService.getAVSpeechProvider()
    avProvider.stop()
    shouldStopLoadingRef.current = true
    setIsPlaying(false)
  }

  const handleMarkAsRead = async () => {
    if (!article) return
    try {
      if (article.isRead) {
        await api.markAsUnread(article.id)
        setArticle({ ...article, isRead: false })
      } else {
        await api.markAsRead(article.id)
        setArticle({ ...article, isRead: true })
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update article status')
    }
  }

  const handleDelete = () => {
    if (!article) return
    Alert.alert(
      'Delete Article',
      'Are you sure you want to delete this article?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteArticle(article.id)
              router.back()
            } catch (error) {
              Alert.alert('Error', 'Failed to delete article')
            }
          },
        },
      ]
    )
  }

  // Play existing cached audio
  const playCachedAudio = async (audioData: string, contentType: string) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync()
        soundRef.current = null
      }

      const { sound, status: initialStatus } = await Audio.Sound.createAsync(
        { uri: `data:${contentType};base64,${audioData}` },
        { shouldPlay: true, rate: playbackSpeed, shouldCorrectPitch: true },
        (status: AVPlaybackStatus) => {
          if (status.isLoaded) {
            setIsPlaying(status.isPlaying)
            setAudioPosition(status.positionMillis)
            // Only update duration if we get a valid value (handles concatenated MP3s)
            if (status.durationMillis && status.durationMillis > 0) {
              setAudioDuration(prev => Math.max(prev, status.durationMillis || 0))
            }
            if (status.didJustFinish) {
              setIsPlaying(false)
            }
          }
        }
      )

      soundRef.current = sound

      // Get accurate duration by checking status after load
      if (initialStatus.isLoaded && initialStatus.durationMillis) {
        setAudioDuration(initialStatus.durationMillis)
      }

      setIsPlaying(true)
      setShowPlayerControls(true)
    } catch (error: any) {
      showErrorAlert('Audio Error', error.message || 'Failed to play audio')
    }
  }

  // Play a specific chunk
  const playChunk = async (chunkIndex: number, chunks: { data: string; contentType: string }[]) => {
    const chunk = chunks[chunkIndex]

    // If chunk not ready yet but still loading, wait for it
    if (!chunk && isLoadingChunksRef.current && chunkIndex < totalChunks) {
      console.log(`[Audio] Waiting for chunk ${chunkIndex} to load...`)
      // Poll until chunk is ready
      const waitForChunk = () => {
        setTimeout(() => {
          const loadedChunk = audioChunksRef.current[chunkIndex]
          if (loadedChunk) {
            playChunk(chunkIndex, audioChunksRef.current)
          } else if (isLoadingChunksRef.current) {
            waitForChunk() // Keep waiting
          } else {
            // Loading stopped and chunk not available - we're done
            setIsPlaying(false)
          }
        }, 200)
      }
      waitForChunk()
      return
    }

    // No more chunks - we're done
    if (!chunk) {
      setIsPlaying(false)
      return
    }

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync()
        soundRef.current = null
      }

      // Use ref for playback speed to ensure correct speed on chunk transitions
      const currentSpeed = playbackSpeedRef.current
      console.log(`[Audio] Playing chunk ${chunkIndex} at speed ${currentSpeed}x`)

      const { sound, status: initialStatus } = await Audio.Sound.createAsync(
        { uri: `data:${chunk.contentType};base64,${chunk.data}` },
        { shouldPlay: false }, // Don't play yet - set rate first
        (status: AVPlaybackStatus) => {
          if (status.isLoaded) {
            setIsPlaying(status.isPlaying)
            // Calculate position across all chunks
            let prevChunksDuration = 0
            for (let i = 0; i < chunkIndex; i++) {
              // Estimate ~16 bytes per ms for MP3
              const chunkData = audioChunksRef.current[i]?.data || ''
              const chunkBytes = chunkData.length * 0.75 // base64 to bytes
              prevChunksDuration += chunkBytes / 16
            }
            setAudioPosition(prevChunksDuration + status.positionMillis)

            if (status.didJustFinish) {
              // Play next chunk
              setCurrentChunkIndex(chunkIndex + 1)
              playChunk(chunkIndex + 1, audioChunksRef.current)
            }
          }
        }
      )

      soundRef.current = sound

      // Explicitly set rate with pitch correction BEFORE playing
      // This ensures the rate is properly applied on chunk transitions
      await sound.setRateAsync(currentSpeed, true)
      await sound.playAsync()

      setCurrentChunkIndex(chunkIndex)
    } catch (error: any) {
      console.error('Error playing chunk:', error)
    }
  }

  // Generate new audio using chunked API (sequential loading)
  const generateAudio = async () => {
    if (!article || !selectedVoice) return

    setShowAudioControlModal(false)
    setAudioLoading(true)
    shouldStopLoadingRef.current = false

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync()
        soundRef.current = null
      }

      // Reset chunk state
      setAudioChunks([])
      audioChunksRef.current = []
      setCurrentChunkIndex(0)
      setTotalChunks(0)
      setAudioDuration(0)
      setChunkDurations([])

      // Get total chunk count
      setChunkLoadingProgress('Preparing audio...')
      const { totalChunks: total } = await api.getAudioChunkCount(article.id, selectedVoice.id)
      setTotalChunks(total)
      console.log(`[Audio] Total chunks: ${total}`)

      // Generate and play chunks sequentially
      isLoadingChunksRef.current = true
      let allWordTimings: WordTiming[] = []
      let cumulativeDuration = 0

      for (let i = 0; i < total && !shouldStopLoadingRef.current; i++) {
        setChunkLoadingProgress(`Loading audio ${i + 1}/${total}...`)
        console.log(`[Audio] Generating chunk ${i + 1}/${total}`)

        const chunkResult = await api.generateAudioChunk(article.id, selectedVoice.id, i)

        // Store the chunk
        const chunkData = { data: chunkResult.audioData, contentType: chunkResult.contentType }
        audioChunksRef.current = [...audioChunksRef.current, chunkData]
        setAudioChunks(audioChunksRef.current)

        // Accumulate word timings with offset
        if (chunkResult.wordTimings && chunkResult.wordTimings.length > 0) {
          const offsetTimings = chunkResult.wordTimings.map(t => ({
            ...t,
            start: t.start + cumulativeDuration,
            end: t.end + cumulativeDuration,
          }))
          allWordTimings = [...allWordTimings, ...offsetTimings]
          setWordTimings(allWordTimings)
        }

        // Estimate chunk duration from file size (~16 bytes per ms for MP3)
        const chunkBytes = chunkResult.audioData.length * 0.75 // base64 to bytes
        const chunkDurationMs = chunkBytes / 16
        cumulativeDuration += chunkDurationMs
        setAudioDuration(cumulativeDuration)
        setChunkDurations(prev => [...prev, chunkDurationMs])
        console.log(`[Audio] Chunk ${i + 1} duration: ${Math.round(chunkDurationMs / 1000)}s, total: ${Math.round(cumulativeDuration / 1000)}s`)

        // Start playing immediately when first chunk is ready (don't await - let loading continue)
        if (i === 0) {
          setAudioLoading(false)
          setShowPlayerControls(true)
          setIsPlaying(true)
          playChunk(0, audioChunksRef.current) // Don't await - continue loading more chunks
        }

        console.log(`[Audio] Chunk ${i + 1} ready, cumulative duration: ${Math.round(cumulativeDuration / 1000)}s`)
      }

      isLoadingChunksRef.current = false
      setChunkLoadingProgress('')

      // Update article with audio info
      setArticle({ ...article, audioUrl: 'cached', audioVoiceId: selectedVoice.id })
      console.log(`[Audio] All ${total} chunks loaded`)

    } catch (error: any) {
      console.error('[Audio] Error:', error)
      showErrorAlert('Audio Error', error.message || 'Failed to generate audio')
      isLoadingChunksRef.current = false
      setChunkLoadingProgress('')
    } finally {
      if (isLoadingChunksRef.current === false) {
        setAudioLoading(false)
      }
    }
  }

  // Clear cached audio
  const handleClearAudio = async () => {
    if (!article) return

    Alert.alert(
      'Clear Audio',
      'This will delete the cached audio for this article. You can re-transcribe it afterwards.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              // Stop loading chunks
              shouldStopLoadingRef.current = true
              isLoadingChunksRef.current = false

              await api.clearAudio(article.id)
              setArticle({ ...article, audioUrl: null, audioVoiceId: null })

              // Stop any playing audio
              if (soundRef.current) {
                await soundRef.current.stopAsync()
                await soundRef.current.unloadAsync()
                soundRef.current = null
              }

              // Clear chunk state
              setAudioChunks([])
              audioChunksRef.current = []
              setCurrentChunkIndex(0)
              setTotalChunks(0)
              setChunkLoadingProgress('')
              setWordTimings([])

              setShowPlayerControls(false)
              setIsPlaying(false)
              Alert.alert('Success', 'Audio cleared. You can now re-transcribe the article.')
            } catch (error: any) {
              showErrorAlert('Error', error.message || 'Failed to clear audio')
            }
          },
        },
      ]
    )
  }

  // Handle audio button press
  const handleAudioButtonPress = async () => {
    if (!article) return

    // Prevent race conditions
    if (isTogglingPlaybackRef.current) {
      console.log('[Audio] Audio button press already in progress, ignoring')
      return
    }

    isTogglingPlaybackRef.current = true
    try {
      // If audio is currently loaded and playing/paused, toggle playback
      if (soundRef.current) {
        if (isPlaying) {
          await soundRef.current.pauseAsync()
        } else {
          await soundRef.current.playAsync()
        }
        return
      }

      // If we have chunks loaded, resume playing
      if (audioChunksRef.current.length > 0) {
        await playChunk(currentChunkIndex, audioChunksRef.current)
        return
      }

      // If article already has audio (cached on server), use chunked loading
      if (article.audioUrl || article.audioVoiceId) {
        // Use the cached voice or selected voice
        const voiceToUse = article.audioVoiceId || selectedVoice?.id || voices[0]?.id
        if (voiceToUse) {
          setSelectedVoice(voices.find(v => v.id === voiceToUse) || selectedVoice)
        }
        await generateAudio()
        return
      }

      // No audio exists - show the audio control modal
      setShowAudioControlModal(true)
    } finally {
      isTogglingPlaybackRef.current = false
    }
  }

  const handleTogglePlayback = async () => {
    // Prevent race conditions - ignore if already processing
    if (isTogglingPlaybackRef.current) {
      console.log('[Audio] Toggle already in progress, ignoring')
      return
    }

    isTogglingPlaybackRef.current = true
    try {
      // Handle AVSpeech mode
      if (ttsProvider === 'avspeech') {
        const avProvider = ttsService.getAVSpeechProvider()
        if (isPlaying) {
          avProvider.pause()
          setIsPlaying(false)
        } else {
          avProvider.resume()
          setIsPlaying(true)
        }
        return
      }

      // Handle ElevenLabs mode
      if (!soundRef.current) {
        await handleAudioButtonPress()
        return
      }

      // Update UI immediately (optimistic update)
      setIsPlaying(!isPlaying)

      if (isPlaying) {
        await soundRef.current.pauseAsync()
      } else {
        await soundRef.current.playAsync()
      }
    } finally {
      isTogglingPlaybackRef.current = false
    }
  }

  const handleSeek = async (positionMillis: number) => {
    if (soundRef.current) {
      await soundRef.current.setPositionAsync(positionMillis)
    }
  }

  const handleSkipForward = async () => {
    if (soundRef.current) {
      const newPosition = Math.min(audioPosition + SKIP_SECONDS * 1000, audioDuration)
      await soundRef.current.setPositionAsync(newPosition)
    }
  }

  const handleSkipBack = async () => {
    if (soundRef.current) {
      const newPosition = Math.max(audioPosition - SKIP_SECONDS * 1000, 0)
      await soundRef.current.setPositionAsync(newPosition)
    }
  }

  const handleChangeSpeed = async () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed)
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length
    const newSpeed = PLAYBACK_SPEEDS[nextIndex]
    setPlaybackSpeed(newSpeed)
    playbackSpeedRef.current = newSpeed // Keep ref in sync

    if (soundRef.current) {
      await soundRef.current.setRateAsync(newSpeed, true)
    }
  }

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Voice preview
  const handlePreviewVoice = async (voice: Voice) => {
    try {
      // Stop any existing preview
      if (previewSoundRef.current) {
        await previewSoundRef.current.unloadAsync()
        previewSoundRef.current = null
      }

      if (previewingVoiceId === voice.id) {
        setPreviewingVoiceId(null)
        return
      }

      if (!voice.previewUrl) {
        Alert.alert('No Preview', 'No preview available for this voice')
        return
      }

      setPreviewingVoiceId(voice.id)

      const { sound } = await Audio.Sound.createAsync(
        { uri: voice.previewUrl },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPreviewingVoiceId(null)
          }
        }
      )

      previewSoundRef.current = sound
    } catch (error) {
      console.error('Preview error:', error)
      setPreviewingVoiceId(null)
    }
  }

  // Select voice and save preference
  const handleSelectVoice = async (voice: Voice) => {
    setSelectedVoice(voice)
    setShowVoiceSelectionModal(false)

    // Stop preview
    if (previewSoundRef.current) {
      await previewSoundRef.current.unloadAsync()
      previewSoundRef.current = null
    }
    setPreviewingVoiceId(null)

    // Save as preferred voice
    try {
      await updateAccount({ preferredVoiceId: voice.id })
    } catch (error) {
      console.error('Failed to save voice preference:', error)
    }
  }

  const handleShare = async () => {
    if (!article) return

    try {
      await Share.share({
        message: `${article.title}\n\n${article.publicUrl}`,
        url: article.publicUrl,
      })
    } catch (error) {
      console.error('Share error:', error)
    }
  }

  const handleShareQuote = async () => {
    if (!selectedText || !article) return

    try {
      if (viewShotRef.current) {
        const uri = await viewShotRef.current.capture()
        const tweetText = `"${selectedText.substring(0, 200)}${selectedText.length > 200 ? '...' : ''}"\n\nvia @consumemate\n${article.publicUrl}`

        const canShare = await Sharing.isAvailableAsync()
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: 'Share Quote',
          })
        } else {
          const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`
          await Linking.openURL(twitterUrl)
        }
      }
    } catch (error) {
      console.error('Share quote error:', error)
      Alert.alert('Error', 'Failed to share quote')
    }

    setShowShareModal(false)
    setSelectedText('')
  }

  const handleTextSelection = (text: string) => {
    if (text.length > 10) {
      setSelectedText(text)
      setShowShareModal(true)
    }
  }

  // Handle paragraph tap for "play from here"
  const handleParagraphTap = (index: number) => {
    if (showPlayerControls) {
      setPlayFromParagraphIndex(index)
    }
  }

  // Play from specific paragraph
  const handlePlayFromParagraph = async (paragraphIndex: number) => {
    setPlayFromParagraphIndex(null)
    // TODO: Calculate timestamp for paragraph and seek to it
    // For now, just show a message
    Alert.alert('Coming Soon', 'Play from paragraph feature will be available soon')
  }

  // Calculate current word index based on audio position
  const currentWordIndex = useMemo(() => {
    if (!wordTimings.length || audioPosition === 0) return -1

    for (let i = 0; i < wordTimings.length; i++) {
      const timing = wordTimings[i]
      if (audioPosition >= timing.start && audioPosition <= timing.end) {
        return i
      }
      if (i < wordTimings.length - 1 && audioPosition > timing.end && audioPosition < wordTimings[i + 1].start) {
        return i
      }
    }

    if (wordTimings.length > 0 && audioPosition > wordTimings[wordTimings.length - 1].end) {
      return wordTimings.length - 1
    }

    return -1
  }, [wordTimings, audioPosition])

  // Auto-scroll to current word when playing (unless user has manually scrolled)
  useEffect(() => {
    if (currentWordIndex >= 0 && isPlaying && !userHasScrolled && scrollViewRef.current) {
      const wordY = wordPositionsRef.current.get(currentWordIndex)
      if (wordY !== undefined) {
        isAutoScrollingRef.current = true
        // Word position is relative to highlightedTextContainer, add container offset
        const absoluteWordY = wordY + highlightedTextOffsetRef.current
        // Scroll to center the current word on screen
        const targetY = Math.max(0, absoluteWordY - SCREEN_HEIGHT / 2)
        scrollViewRef.current.scrollTo({ y: targetY, animated: true })
        setCurrentWordY(absoluteWordY)
        // Reset auto-scroll flag after animation
        setTimeout(() => {
          isAutoScrollingRef.current = false
        }, 300)
      }
    }
  }, [currentWordIndex, isPlaying, userHasScrolled])

  // Handle scroll events to detect manual scrolling
  const handleScroll = useCallback((event: any) => {
    const scrollY = event.nativeEvent.contentOffset.y
    lastScrollYRef.current = scrollY

    // If we're auto-scrolling, ignore this event
    if (isAutoScrollingRef.current) return

    // If playing and user scrolls significantly, mark as manual scroll
    if (isPlaying && wordTimings.length > 0) {
      const wordY = wordPositionsRef.current.get(currentWordIndex) || 0
      const absoluteWordY = wordY + highlightedTextOffsetRef.current
      const expectedY = Math.max(0, absoluteWordY - SCREEN_HEIGHT / 2)
      const scrollDiff = Math.abs(scrollY - expectedY)

      if (scrollDiff > 100) {
        setUserHasScrolled(true)
        setShowReturnButton(true)
      }
    }
  }, [isPlaying, currentWordIndex, wordTimings.length])

  // Return to current playing position
  const handleReturnToPosition = useCallback(() => {
    if (scrollViewRef.current && currentWordIndex >= 0) {
      const wordY = wordPositionsRef.current.get(currentWordIndex)
      if (wordY !== undefined) {
        isAutoScrollingRef.current = true
        const absoluteWordY = wordY + highlightedTextOffsetRef.current
        const targetY = Math.max(0, absoluteWordY - SCREEN_HEIGHT / 2)
        scrollViewRef.current.scrollTo({ y: targetY, animated: true })
        setTimeout(() => {
          isAutoScrollingRef.current = false
        }, 300)
      }
    }
    setUserHasScrolled(false)
    setShowReturnButton(false)
  }, [currentWordIndex])

  // Reset scroll state when playback stops
  useEffect(() => {
    if (!isPlaying) {
      setUserHasScrolled(false)
      setShowReturnButton(false)
    }
  }, [isPlaying])

  // Render text with word highlighting and position tracking
  const renderHighlightedText = () => {
    if (!wordTimings.length) return null

    return (
      <View
        style={styles.highlightedTextContainer}
        onLayout={(event) => {
          // Store the Y offset of this container relative to scroll content
          highlightedTextOffsetRef.current = event.nativeEvent.layout.y
        }}
      >
        {wordTimings.map((timing, index) => {
          const isCurrentWord = index === currentWordIndex
          const isReadWord = index < currentWordIndex

          return (
            <Text
              key={index}
              onLayout={(event) => {
                // Store the Y position of each word for auto-scroll
                const { y } = event.nativeEvent.layout
                wordPositionsRef.current.set(index, y)
              }}
              style={[
                styles.highlightedWord,
                { color: theme.text },
                isCurrentWord && styles.currentWord,
                isReadWord && styles.readWord,
              ]}
            >
              {timing.word}{' '}
            </Text>
          )
        })}
      </View>
    )
  }

  // Markdown styles - must be before early returns to maintain hook order
  const markdownStyles = useMemo(() => ({
    body: {
      color: theme.text,
      fontSize: 18,
      fontFamily: 'Georgia',
      lineHeight: 28,
    },
    paragraph: {
      marginBottom: spacing.md,
    },
    link: {
      color: theme.primary,
      textDecorationLine: 'underline' as const,
    },
    heading1: {
      fontSize: 24,
      fontWeight: '700' as const,
      color: theme.text,
      marginTop: spacing.lg,
      marginBottom: spacing.md,
      fontFamily: 'Georgia',
    },
    heading2: {
      fontSize: 22,
      fontWeight: '600' as const,
      color: theme.text,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      fontFamily: 'Georgia',
    },
    heading3: {
      fontSize: 20,
      fontWeight: '600' as const,
      color: theme.text,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      fontFamily: 'Georgia',
    },
    blockquote: {
      backgroundColor: theme.surface,
      borderLeftColor: theme.primary,
      borderLeftWidth: 4,
      paddingLeft: spacing.md,
      paddingVertical: spacing.sm,
      marginVertical: spacing.md,
      fontStyle: 'italic' as const,
    },
    code_inline: {
      backgroundColor: theme.surface,
      color: theme.textSecondary,
      fontFamily: 'Courier',
      fontSize: 16,
      paddingHorizontal: 4,
      borderRadius: 4,
    },
    code_block: {
      backgroundColor: theme.surface,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      fontFamily: 'Courier',
      fontSize: 14,
    },
    list_item: {
      marginBottom: spacing.sm,
    },
    bullet_list: {
      marginBottom: spacing.md,
    },
    ordered_list: {
      marginBottom: spacing.md,
    },
    strong: {
      fontWeight: '700' as const,
    },
    em: {
      fontStyle: 'italic' as const,
    },
  }), [theme])

  // Handle link presses
  const handleLinkPress = useCallback((url: string) => {
    Linking.openURL(url).catch(err => {
      console.error('Failed to open URL:', err)
      Alert.alert('Error', 'Could not open link')
    })
    return false // Prevent default handling
  }, [])

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  if (!article) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.error }]}>Article not found</Text>
      </View>
    )
  }

  const hasExistingAudio = !!(article.audioUrl || article.audioVoiceId)

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header actions */}
      <View style={[styles.actions, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.actionButton, audioLoading && styles.actionButtonDisabled]}
          onPress={handleAudioButtonPress}
          onLongPress={hasExistingAudio ? handleClearAudio : undefined}
          disabled={audioLoading}
        >
          {audioLoading ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : hasExistingAudio ? 'play' : 'headset'}
              size={24}
              color={theme.primary}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleMarkAsRead}>
          <Ionicons
            name={article.isRead ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={24}
            color={article.isRead ? theme.primary : theme.textMuted}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={24} color={theme.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={24} color={theme.error} />
        </TouchableOpacity>
      </View>

      {/* Article content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, showPlayerControls && styles.contentWithPlayer]}
        onScroll={handleScroll}
        scrollEventThrottle={100}
      >
        <Text style={[styles.siteName, { color: theme.textMuted }]}>
          {article.siteName || new URL(article.url).hostname}
        </Text>

        <Text style={[styles.title, { color: theme.text }]}>{article.title}</Text>

        {article.author && (
          <Text style={[styles.author, { color: theme.textSecondary }]}>
            By {article.author}
          </Text>
        )}

        <Text style={[styles.meta, { color: theme.textMuted }]}>
          {article.wordCount} words · {article.estimatedReadingTime} min read
        </Text>

        <View style={styles.articleBody}>
          {showPlayerControls && wordTimings.length > 0 ? (
            renderHighlightedText()
          ) : (
            <Markdown
              style={markdownStyles}
              onLinkPress={handleLinkPress}
            >
              {article.contentMarkdown}
            </Markdown>
          )}
        </View>
      </ScrollView>

      {/* Return to current position button */}
      {showReturnButton && isPlaying && (
        <TouchableOpacity
          style={[styles.returnButton, { backgroundColor: theme.primary }]}
          onPress={handleReturnToPosition}
        >
          <Ionicons name="locate" size={18} color="#fff" />
          <Text style={styles.returnButtonText}>Return to current position</Text>
        </TouchableOpacity>
      )}

      {/* Audio Control Modal (Half-page) */}
      <Modal visible={showAudioControlModal} transparent animationType="none">
        <View style={styles.modalContainer}>
          <Animated.View
            style={[styles.modalOverlayAnimated, { opacity: overlayOpacity }]}
          >
            <Pressable style={styles.modalOverlayPressable} onPress={() => setShowAudioControlModal(false)} />
          </Animated.View>
          <Animated.View
            style={[
              styles.halfModalContent,
              { backgroundColor: theme.surface, transform: [{ translateY: modalSlideY }] }
            ]}
          >
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Listen to Article
            </Text>

            {/* TTS Provider Selection */}
            <View style={styles.providerSelector}>
              <TouchableOpacity
                style={[
                  styles.providerOption,
                  { borderColor: theme.border },
                  ttsProvider === 'elevenlabs' && { borderColor: theme.primary, backgroundColor: theme.primary + '15' }
                ]}
                onPress={() => setTtsProvider('elevenlabs')}
              >
                <Ionicons
                  name="star"
                  size={18}
                  color={ttsProvider === 'elevenlabs' ? theme.primary : theme.textMuted}
                />
                <Text style={[
                  styles.providerOptionText,
                  { color: ttsProvider === 'elevenlabs' ? theme.primary : theme.text }
                ]}>
                  ElevenLabs
                </Text>
                <Text style={[styles.providerOptionSubtext, { color: theme.textMuted }]}>
                  Best quality
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.providerOption,
                  { borderColor: theme.border },
                  ttsProvider === 'edge' && { borderColor: theme.primary, backgroundColor: theme.primary + '15' }
                ]}
                onPress={() => setTtsProvider('edge')}
              >
                <Ionicons
                  name="cloud"
                  size={18}
                  color={ttsProvider === 'edge' ? theme.primary : theme.textMuted}
                />
                <Text style={[
                  styles.providerOptionText,
                  { color: ttsProvider === 'edge' ? theme.primary : theme.text }
                ]}>
                  Edge
                </Text>
                <Text style={[styles.providerOptionSubtext, { color: theme.textMuted }]}>
                  Free & good
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.providerOption,
                  { borderColor: theme.border },
                  ttsProvider === 'avspeech' && { borderColor: theme.primary, backgroundColor: theme.primary + '15' }
                ]}
                onPress={() => setTtsProvider('avspeech')}
              >
                <Ionicons
                  name="phone-portrait"
                  size={18}
                  color={ttsProvider === 'avspeech' ? theme.primary : theme.textMuted}
                />
                <Text style={[
                  styles.providerOptionText,
                  { color: ttsProvider === 'avspeech' ? theme.primary : theme.text }
                ]}>
                  On-Device
                </Text>
                <Text style={[styles.providerOptionSubtext, { color: theme.textMuted }]}>
                  Offline
                </Text>
              </TouchableOpacity>
            </View>

            {/* Voice Selection - different for each provider */}
            {ttsProvider === 'elevenlabs' && (
              <TouchableOpacity
                style={[styles.voiceSelector, { backgroundColor: theme.background, borderColor: theme.border }]}
                onPress={() => {
                  setShowAudioControlModal(false)
                  setShowVoiceSelectionModal(true)
                }}
              >
                <View>
                  <Text style={[styles.voiceSelectorLabel, { color: theme.textMuted }]}>Voice</Text>
                  <Text style={[styles.voiceSelectorValue, { color: theme.text }]}>
                    {selectedVoice?.name || 'Select a voice'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            )}

            {ttsProvider === 'edge' && (
              <View style={[styles.voiceSelector, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.voiceSelectorLabel, { color: theme.textMuted }]}>Voice</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    {edgeVoices.map(voice => (
                      <TouchableOpacity
                        key={voice.id}
                        style={[
                          styles.avVoiceChip,
                          { borderColor: theme.border },
                          selectedEdgeVoice?.id === voice.id && { borderColor: theme.primary, backgroundColor: theme.primary + '15' }
                        ]}
                        onPress={() => setSelectedEdgeVoice(voice)}
                      >
                        <Text style={[
                          styles.avVoiceChipText,
                          { color: selectedEdgeVoice?.id === voice.id ? theme.primary : theme.text }
                        ]}>
                          {voice.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            )}

            {ttsProvider === 'avspeech' && (
              <View style={[styles.voiceSelector, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.voiceSelectorLabel, { color: theme.textMuted }]}>Voice</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    {avSpeechVoices.slice(0, 5).map(voice => (
                      <TouchableOpacity
                        key={voice.id}
                        style={[
                          styles.avVoiceChip,
                          { borderColor: theme.border },
                          selectedAvVoice?.id === voice.id && { borderColor: theme.primary, backgroundColor: theme.primary + '15' }
                        ]}
                        onPress={() => setSelectedAvVoice(voice)}
                      >
                        <Text style={[
                          styles.avVoiceChipText,
                          { color: selectedAvVoice?.id === voice.id ? theme.primary : theme.text }
                        ]}>
                          {voice.name.split(' ')[0]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            )}

            {/* Transcribe Button */}
            <TouchableOpacity
              style={[styles.transcribeButton, { backgroundColor: theme.primary }]}
              onPress={() => {
                if (ttsProvider === 'elevenlabs') generateAudio()
                else if (ttsProvider === 'edge') generateAudioWithEdge()
                else generateAudioWithAVSpeech()
              }}
              disabled={audioLoading}
            >
              {audioLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={ttsProvider === 'elevenlabs' ? 'star' : ttsProvider === 'edge' ? 'cloud' : 'volume-high'}
                    size={24}
                    color="#fff"
                  />
                  <Text style={styles.transcribeButtonText}>
                    {ttsProvider === 'elevenlabs' ? 'Generate with ElevenLabs' :
                     ttsProvider === 'edge' ? 'Generate with Edge TTS' :
                     'Play with On-Device Voice'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={[styles.transcribeNote, { color: theme.textMuted }]}>
              {ttsProvider === 'elevenlabs'
                ? 'Best quality AI voices (uses API quota)'
                : ttsProvider === 'edge'
                ? 'Good quality Microsoft voices - free & unlimited'
                : 'Basic iOS voices - free and works offline'}
            </Text>
          </Animated.View>
        </View>
      </Modal>

      {/* Voice Selection Modal (Full-page) */}
      <Modal visible={showVoiceSelectionModal} animationType="slide">
        <View style={[styles.fullModalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.fullModalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowVoiceSelectionModal(false)}>
              <Text style={[styles.fullModalCancel, { color: theme.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.fullModalTitle, { color: theme.text }]}>Choose Voice</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView style={styles.voiceListFull}>
            {voices.map((voice) => (
              <View
                key={voice.id}
                style={[styles.voiceOptionFull, { borderBottomColor: theme.border }]}
              >
                <TouchableOpacity
                  style={styles.voiceOptionContent}
                  onPress={() => handleSelectVoice(voice)}
                >
                  <View style={styles.voiceInfo}>
                    <Text style={[styles.voiceNameFull, { color: theme.text }]}>
                      {voice.name}
                    </Text>
                    {voice.category && (
                      <Text style={[styles.voiceCategory, { color: theme.textMuted }]}>
                        {voice.category}
                      </Text>
                    )}
                  </View>
                  {selectedVoice?.id === voice.id && (
                    <Ionicons name="checkmark" size={24} color={theme.primary} />
                  )}
                </TouchableOpacity>

                {voice.previewUrl && (
                  <TouchableOpacity
                    style={[styles.previewButton, { backgroundColor: theme.surface }]}
                    onPress={() => handlePreviewVoice(voice)}
                  >
                    <Ionicons
                      name={previewingVoiceId === voice.id ? 'stop' : 'play'}
                      size={20}
                      color={theme.primary}
                    />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Quote Share Modal */}
      <Modal visible={showShareModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.quoteModalContent, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Share Quote
            </Text>

            <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
              <View style={[styles.quoteCard, { backgroundColor: theme.primary }]}>
                <Text style={styles.quoteText}>"{selectedText}"</Text>
                <View style={styles.quoteFooter}>
                  <Text style={styles.quoteSource}>{article.title}</Text>
                  <Text style={styles.quoteBrand}>via Consumemate</Text>
                </View>
              </View>
            </ViewShot>

            <View style={styles.shareButtons}>
              <TouchableOpacity
                style={[styles.shareButton, { backgroundColor: '#1DA1F2' }]}
                onPress={handleShareQuote}
              >
                <Ionicons name="logo-twitter" size={20} color="#fff" />
                <Text style={styles.shareButtonText}>Share to Twitter</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.cancelButton, { borderTopColor: theme.border }]}
              onPress={() => {
                setShowShareModal(false)
                setSelectedText('')
              }}
            >
              <Text style={[styles.cancelText, { color: theme.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bottom Audio Player Controls */}
      {showPlayerControls && (
        <View style={[styles.bottomPlayer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          {/* Debug: Chunk info */}
          <View style={styles.debugContainer}>
            <Text style={[styles.debugText, { color: theme.textMuted }]}>
              Chunks: {audioChunks.length}/{totalChunks} | Playing: #{currentChunkIndex + 1}
            </Text>
            <Text style={[styles.debugText, { color: theme.textMuted }]}>
              Durations: [{chunkDurations.map(d => Math.round(d / 1000) + 's').join(', ')}]
            </Text>
            <Text style={[styles.debugText, { color: theme.textMuted }]}>
              Total: {Math.round(chunkDurations.reduce((a, b) => a + b, 0) / 1000)}s | audioDuration: {Math.round(audioDuration / 1000)}s
            </Text>
          </View>
          {/* Chunk loading progress */}
          {chunkLoadingProgress ? (
            <View style={styles.chunkProgressContainer}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.chunkProgressText, { color: theme.textMuted }]}>
                {chunkLoadingProgress}
              </Text>
            </View>
          ) : null}
          <View style={styles.progressContainer}>
            <Text style={[styles.timeText, { color: theme.textMuted }]}>
              {formatTime(audioPosition)}
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={audioDuration}
              value={audioPosition}
              onSlidingComplete={handleSeek}
              minimumTrackTintColor={theme.primary}
              maximumTrackTintColor={theme.border}
              thumbTintColor={theme.primary}
            />
            <Text style={[styles.timeText, { color: theme.textMuted }]}>
              {formatTime(audioDuration)}
            </Text>
          </View>

          <View style={styles.playbackControls}>
            <TouchableOpacity
              style={[styles.speedButton, { backgroundColor: theme.background }]}
              onPress={handleChangeSpeed}
            >
              <Text style={[styles.speedText, { color: theme.text }]}>
                {playbackSpeed}x
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton} onPress={handleSkipBack}>
              <Ionicons name="play-back" size={28} color={theme.text} />
              <Text style={[styles.skipLabel, { color: theme.textMuted }]}>15</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.playButton, { backgroundColor: theme.primary }]}
              onPress={handleTogglePlayback}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={32}
                color="#fff"
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton} onPress={handleSkipForward}>
              <Ionicons name="play-forward" size={28} color={theme.text} />
              <Text style={[styles.skipLabel, { color: theme.textMuted }]}>15</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closePlayerButton}
              onPress={async () => {
                // Stop loading more chunks
                shouldStopLoadingRef.current = true
                isLoadingChunksRef.current = false

                // Stop AVSpeech if active
                if (ttsProvider === 'avspeech') {
                  stopAVSpeech()
                }

                if (soundRef.current) {
                  await soundRef.current.stopAsync()
                  await soundRef.current.unloadAsync()
                  soundRef.current = null
                }

                // Reset chunk state
                setAudioChunks([])
                audioChunksRef.current = []
                setCurrentChunkIndex(0)
                setTotalChunks(0)
                setChunkLoadingProgress('')

                setShowPlayerControls(false)
                setIsPlaying(false)
                setAudioPosition(0)
                setAudioDuration(0)
                setWordTimings([])
              }}
            >
              <Ionicons name="close" size={24} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Georgia',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  actionButton: {
    padding: spacing.sm,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  bottomPlayer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
  },
  debugContainer: {
    backgroundColor: 'rgba(0,0,0,0.1)',
    padding: spacing.xs,
    marginBottom: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  debugText: {
    fontSize: 10,
    fontFamily: 'Courier',
  },
  chunkProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  chunkProgressText: {
    fontSize: 12,
    fontFamily: 'Georgia',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  timeText: {
    fontSize: 12,
    fontFamily: 'Georgia',
    minWidth: 45,
    textAlign: 'center',
  },
  playbackControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  controlButton: {
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  skipLabel: {
    fontSize: 10,
    fontFamily: 'Georgia',
    position: 'absolute',
    bottom: 0,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 50,
    alignItems: 'center',
  },
  speedText: {
    fontSize: 14,
    fontFamily: 'Georgia',
    fontWeight: '600',
  },
  closePlayerButton: {
    padding: spacing.sm,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  contentWithPlayer: {
    paddingBottom: 160,
  },
  siteName: {
    fontSize: 12,
    fontFamily: 'Georgia',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Georgia',
    fontWeight: '700',
    marginTop: spacing.sm,
    lineHeight: 36,
  },
  author: {
    fontSize: 16,
    fontFamily: 'Georgia',
    marginTop: spacing.md,
  },
  meta: {
    fontSize: 14,
    fontFamily: 'Georgia',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  articleBody: {
    gap: spacing.md,
  },
  paragraph: {
    fontSize: 18,
    fontFamily: 'Georgia',
    lineHeight: 28,
  },
  highlightedTextContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  highlightedWord: {
    fontSize: 18,
    fontFamily: 'Georgia',
    lineHeight: 28,
  },
  currentWord: {
    backgroundColor: 'rgba(76, 175, 80, 0.4)',
    borderRadius: 2,
  },
  readWord: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
  },
  returnButton: {
    position: 'absolute',
    bottom: 180,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  returnButtonText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Georgia',
    fontWeight: '600',
  },
  playFromHereOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  playFromHereText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Georgia',
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalOverlayAnimated: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalOverlayPressable: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  halfModalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#ccc',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Georgia',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  providerSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  providerOption: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  providerOptionText: {
    fontSize: 14,
    fontFamily: 'Georgia',
    fontWeight: '600',
  },
  providerOptionSubtext: {
    fontSize: 11,
    fontFamily: 'Georgia',
  },
  avVoiceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  avVoiceChipText: {
    fontSize: 13,
    fontFamily: 'Georgia',
    fontWeight: '500',
  },
  voiceSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  voiceSelectorLabel: {
    fontSize: 12,
    fontFamily: 'Georgia',
    marginBottom: 2,
  },
  voiceSelectorValue: {
    fontSize: 16,
    fontFamily: 'Georgia',
    fontWeight: '500',
  },
  transcribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  transcribeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Georgia',
    fontWeight: '600',
  },
  transcribeNote: {
    fontSize: 12,
    fontFamily: 'Georgia',
    textAlign: 'center',
    marginTop: spacing.md,
  },
  fullModalContainer: {
    flex: 1,
  },
  fullModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  fullModalCancel: {
    fontSize: 16,
    fontFamily: 'Georgia',
  },
  fullModalTitle: {
    fontSize: 18,
    fontFamily: 'Georgia',
    fontWeight: '600',
  },
  voiceListFull: {
    flex: 1,
  },
  voiceOptionFull: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  voiceOptionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceInfo: {
    flex: 1,
  },
  voiceNameFull: {
    fontSize: 17,
    fontFamily: 'Georgia',
    fontWeight: '500',
  },
  voiceCategory: {
    fontSize: 13,
    fontFamily: 'Georgia',
    marginTop: 2,
  },
  previewButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '60%',
  },
  quoteModalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.md,
  },
  voiceList: {
    maxHeight: 300,
  },
  voiceOption: {
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  voiceName: {
    fontSize: 16,
    fontFamily: 'Georgia',
  },
  cancelButton: {
    padding: spacing.md,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontFamily: 'Georgia',
  },
  quoteCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    margin: spacing.md,
  },
  quoteText: {
    fontSize: 20,
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    color: '#fff',
    lineHeight: 28,
  },
  quoteFooter: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
  },
  quoteSource: {
    fontSize: 14,
    fontFamily: 'Georgia',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  quoteBrand: {
    fontSize: 12,
    fontFamily: 'Georgia',
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: spacing.xs,
  },
  shareButtons: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Georgia',
    fontWeight: '500',
  },
})
