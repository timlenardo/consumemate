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
} from 'react-native'
import Slider from '@react-native-community/slider'
import * as Clipboard from 'expo-clipboard'
import { useLocalSearchParams, router } from 'expo-router'
import { Audio, AVPlaybackStatus } from 'expo-av'
import { Ionicons } from '@expo/vector-icons'
import ViewShot from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import { colors, spacing, borderRadius } from '@/constants/theme'
import { api, Article, Voice, WordTiming } from '@/lib/api'
import { useAuth } from '@/lib/AuthContext'

const PLAYBACK_SPEEDS = [1.0, 1.2, 1.5, 1.7, 2.0]
const SKIP_SECONDS = 15

// Helper to show error with copy button
function showErrorAlert(title: string, message: string) {
  Alert.alert(
    title,
    message,
    [
      { text: 'OK', style: 'default' },
      {
        text: 'Copy Error',
        onPress: async () => {
          await Clipboard.setStringAsync(`${title}: ${message}`)
          Alert.alert('Copied', 'Error message copied to clipboard')
        },
      },
    ]
  )
}

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const colorScheme = useColorScheme()
  const theme = colors[colorScheme ?? 'light']
  const { account } = useAuth()

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
  const [showVoiceModal, setShowVoiceModal] = useState(false)

  const soundRef = useRef<Audio.Sound | null>(null)
  const viewShotRef = useRef<ViewShot>(null)
  const scrollViewRef = useRef<ScrollView>(null)

  useEffect(() => {
    loadArticle()
    loadVoices()

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync()
      }
    }
  }, [id])

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

  const handlePlayAudio = async (voiceId?: string) => {
    if (!article) return

    const selectedVoiceId = voiceId || account?.preferredVoiceId || voices[0]?.id
    if (!selectedVoiceId) {
      Alert.alert('Error', 'Please select a voice first')
      return
    }

    setShowVoiceModal(false)
    setAudioLoading(true)

    try {
      // Stop any existing audio
      if (soundRef.current) {
        await soundRef.current.unloadAsync()
        soundRef.current = null
      }

      const { audioData, contentType, wordTimings: timings, processedText } = await api.generateAudio(article.id, selectedVoiceId)

      // Store word timings for text highlighting
      setWordTimings(timings || [])
      setAudioText(processedText || '')

      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:${contentType};base64,${audioData}` },
        { shouldPlay: true, rate: playbackSpeed, shouldCorrectPitch: true },
        (status: AVPlaybackStatus) => {
          if (status.isLoaded) {
            setIsPlaying(status.isPlaying)
            setAudioPosition(status.positionMillis)
            setAudioDuration(status.durationMillis || 0)
            if (status.didJustFinish) {
              setIsPlaying(false)
            }
          }
        }
      )

      soundRef.current = sound
      setIsPlaying(true)
      setShowPlayerControls(true)
    } catch (error: any) {
      showErrorAlert('Audio Error', error.message || 'Failed to generate audio')
    } finally {
      setAudioLoading(false)
    }
  }

  const handleTogglePlayback = async () => {
    if (!soundRef.current) {
      // No audio loaded, show voice selection
      if (!account?.preferredVoiceId && voices.length > 1) {
        setShowVoiceModal(true)
      } else {
        handlePlayAudio()
      }
      return
    }

    if (isPlaying) {
      await soundRef.current.pauseAsync()
    } else {
      await soundRef.current.playAsync()
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
      // Capture the quote card as an image
      if (viewShotRef.current) {
        const uri = await viewShotRef.current.capture()

        // Create tweet text
        const tweetText = `"${selectedText.substring(0, 200)}${selectedText.length > 200 ? '...' : ''}"\n\nvia @consumemate\n${article.publicUrl}`

        // Check if we can share
        const canShare = await Sharing.isAvailableAsync()
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: 'Share Quote',
          })
        } else {
          // Fallback to Twitter web intent
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

  // Calculate current word index based on audio position
  const currentWordIndex = useMemo(() => {
    if (!wordTimings.length || audioPosition === 0) return -1

    // Find the word that contains the current position
    for (let i = 0; i < wordTimings.length; i++) {
      const timing = wordTimings[i]
      if (audioPosition >= timing.start && audioPosition <= timing.end) {
        return i
      }
      // If we're between words, return the last word that ended
      if (i < wordTimings.length - 1 && audioPosition > timing.end && audioPosition < wordTimings[i + 1].start) {
        return i
      }
    }

    // If past all words, return the last word
    if (wordTimings.length > 0 && audioPosition > wordTimings[wordTimings.length - 1].end) {
      return wordTimings.length - 1
    }

    return -1
  }, [wordTimings, audioPosition])

  // Render text with word highlighting
  const renderHighlightedText = () => {
    if (!wordTimings.length) return null

    return (
      <Text style={[styles.paragraph, { color: theme.text }]} selectable>
        {wordTimings.map((timing, index) => {
          const isCurrentWord = index === currentWordIndex
          const isReadWord = index < currentWordIndex

          return (
            <Text
              key={index}
              style={[
                isCurrentWord && styles.currentWord,
                isReadWord && styles.readWord,
              ]}
            >
              {timing.word}
              {index < wordTimings.length - 1 ? ' ' : ''}
            </Text>
          )
        })}
      </Text>
    )
  }

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

  // Parse markdown to simple paragraphs for display
  const paragraphs = article.contentMarkdown
    .split(/\n\n+/)
    .filter(p => p.trim())
    .map(p => p.replace(/[#*`_~\[\]]/g, '').trim())

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header actions */}
      <View style={[styles.actions, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.actionButton, audioLoading && styles.actionButtonDisabled]}
          onPress={handleTogglePlayback}
          disabled={audioLoading}
        >
          {audioLoading ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'headset'}
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
            // Show audio text with word highlighting when playing
            renderHighlightedText()
          ) : (
            // Show original paragraphs when not playing
            paragraphs.map((paragraph, index) => (
              <Text
                key={index}
                style={[styles.paragraph, { color: theme.text }]}
                selectable
                onLongPress={() => handleTextSelection(paragraph)}
              >
                {paragraph}
              </Text>
            ))
          )}
        </View>
      </ScrollView>

      {/* Voice Selection Modal */}
      <Modal visible={showVoiceModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Select Voice
            </Text>
            <ScrollView style={styles.voiceList}>
              {voices.map((voice) => (
                <TouchableOpacity
                  key={voice.id}
                  style={[styles.voiceOption, { borderBottomColor: theme.border }]}
                  onPress={() => handlePlayAudio(voice.id)}
                >
                  <Text style={[styles.voiceName, { color: theme.text }]}>
                    {voice.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.cancelButton, { borderTopColor: theme.border }]}
              onPress={() => setShowVoiceModal(false)}
            >
              <Text style={[styles.cancelText, { color: theme.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Quote Share Modal */}
      <Modal visible={showShareModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.quoteModalContent, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Share Quote
            </Text>

            {/* Quote Card for Screenshot */}
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
          {/* Progress Bar */}
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

          {/* Playback Controls */}
          <View style={styles.playbackControls}>
            {/* Speed Button */}
            <TouchableOpacity
              style={[styles.speedButton, { backgroundColor: theme.background }]}
              onPress={handleChangeSpeed}
            >
              <Text style={[styles.speedText, { color: theme.text }]}>
                {playbackSpeed}x
              </Text>
            </TouchableOpacity>

            {/* Skip Back */}
            <TouchableOpacity style={styles.controlButton} onPress={handleSkipBack}>
              <Ionicons name="play-back" size={28} color={theme.text} />
              <Text style={[styles.skipLabel, { color: theme.textMuted }]}>15</Text>
            </TouchableOpacity>

            {/* Play/Pause */}
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

            {/* Skip Forward */}
            <TouchableOpacity style={styles.controlButton} onPress={handleSkipForward}>
              <Ionicons name="play-forward" size={28} color={theme.text} />
              <Text style={[styles.skipLabel, { color: theme.textMuted }]}>15</Text>
            </TouchableOpacity>

            {/* Close Button */}
            <TouchableOpacity
              style={styles.closePlayerButton}
              onPress={async () => {
                if (soundRef.current) {
                  await soundRef.current.stopAsync()
                  await soundRef.current.unloadAsync()
                  soundRef.current = null
                }
                setShowPlayerControls(false)
                setIsPlaying(false)
                setAudioPosition(0)
                setAudioDuration(0)
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
  currentWord: {
    backgroundColor: 'rgba(76, 175, 80, 0.4)',  // Light green for current word
    borderRadius: 2,
  },
  readWord: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',  // Lighter green for read words
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
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
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Georgia',
    fontWeight: '600',
    textAlign: 'center',
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
