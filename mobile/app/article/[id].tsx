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
import * as Clipboard from 'expo-clipboard'
import { useLocalSearchParams, router } from 'expo-router'
import { Audio, AVPlaybackStatus } from 'expo-av'
import { Ionicons } from '@expo/vector-icons'
import ViewShot from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import Markdown from 'react-native-markdown-display'
import { colors, spacing, borderRadius } from '@/constants/theme'
import { api, Article, Voice, WordTiming } from '@/lib/api'
import { useAuth } from '@/lib/AuthContext'

const PLAYBACK_SPEEDS = [1.0, 1.2, 1.5, 1.7, 2.0]
const SKIP_SECONDS = 15
const { height: SCREEN_HEIGHT } = Dimensions.get('window')

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

  // New modal states
  const [showVoiceSelectionModal, setShowVoiceSelectionModal] = useState(false)
  const [showAudioControlModal, setShowAudioControlModal] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null)
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null)
  const [playFromParagraphIndex, setPlayFromParagraphIndex] = useState<number | null>(null)

  const soundRef = useRef<Audio.Sound | null>(null)
  const previewSoundRef = useRef<Audio.Sound | null>(null)
  const viewShotRef = useRef<ViewShot>(null)
  const scrollViewRef = useRef<ScrollView>(null)

  // Animation values for half-modal
  const overlayOpacity = useRef(new Animated.Value(0)).current
  const modalSlideY = useRef(new Animated.Value(300)).current

  useEffect(() => {
    loadArticle()
    loadVoices()

    return () => {
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
      showErrorAlert('Audio Error', error.message || 'Failed to play audio')
    }
  }

  // Generate new audio
  const generateAudio = async () => {
    if (!article || !selectedVoice) return

    setShowAudioControlModal(false)
    setAudioLoading(true)

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync()
        soundRef.current = null
      }

      const { audioData, contentType, wordTimings: timings, processedText } = await api.generateAudio(article.id, selectedVoice.id)

      // Update article with new audio data
      setArticle({ ...article, audioUrl: 'cached', audioVoiceId: selectedVoice.id })

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

  // Handle audio button press
  const handleAudioButtonPress = async () => {
    if (!article) return

    // If audio is currently loaded and playing/paused, toggle playback
    if (soundRef.current) {
      if (isPlaying) {
        await soundRef.current.pauseAsync()
      } else {
        await soundRef.current.playAsync()
      }
      return
    }

    // If article already has audio, fetch and play it
    if (article.audioUrl || article.audioVoiceId) {
      setAudioLoading(true)
      try {
        const { audioData, contentType, wordTimings: timings, processedText } = await api.generateAudio(
          article.id,
          article.audioVoiceId || selectedVoice?.id || voices[0]?.id
        )
        setWordTimings(timings || [])
        setAudioText(processedText || '')
        await playCachedAudio(audioData, contentType)
      } catch (error: any) {
        showErrorAlert('Audio Error', error.message || 'Failed to load audio')
      } finally {
        setAudioLoading(false)
      }
      return
    }

    // No audio exists - show the audio control modal
    setShowAudioControlModal(true)
  }

  const handleTogglePlayback = async () => {
    if (!soundRef.current) {
      handleAudioButtonPress()
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

            {/* Current Voice Selection */}
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

            {/* Transcribe Button */}
            <TouchableOpacity
              style={[styles.transcribeButton, { backgroundColor: theme.primary }]}
              onPress={generateAudio}
              disabled={audioLoading}
            >
              {audioLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="mic" size={24} color="#fff" />
                  <Text style={styles.transcribeButtonText}>Transcribe Now</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={[styles.transcribeNote, { color: theme.textMuted }]}>
              This will convert the article to audio using AI voice synthesis
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
    backgroundColor: 'rgba(76, 175, 80, 0.4)',
    borderRadius: 2,
  },
  readWord: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
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
