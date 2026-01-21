import { useState, useEffect, useRef, useCallback } from 'react'
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
import { useLocalSearchParams, router } from 'expo-router'
import { Audio } from 'expo-av'
import { Ionicons } from '@expo/vector-icons'
import ViewShot from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import { colors, spacing, borderRadius } from '@/constants/theme'
import { api, Article, Voice } from '@/lib/api'
import { useAuth } from '@/lib/AuthContext'

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const colorScheme = useColorScheme()
  const theme = colors[colorScheme ?? 'light']
  const { account } = useAuth()

  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [audioLoading, setAudioLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const [showShareModal, setShowShareModal] = useState(false)
  const [voices, setVoices] = useState<Voice[]>([])
  const [showVoiceModal, setShowVoiceModal] = useState(false)

  const soundRef = useRef<Audio.Sound | null>(null)
  const viewShotRef = useRef<ViewShot>(null)

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

      const { audioData, contentType } = await api.generateAudio(article.id, selectedVoiceId)

      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:${contentType};base64,${audioData}` },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            setIsPlaying(status.isPlaying)
            if (status.didJustFinish) {
              setIsPlaying(false)
            }
          }
        }
      )

      soundRef.current = sound
      setIsPlaying(true)
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate audio')
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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
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
          {paragraphs.map((paragraph, index) => (
            <Text
              key={index}
              style={[styles.paragraph, { color: theme.text }]}
              selectable
              onLongPress={() => handleTextSelection(paragraph)}
            >
              {paragraph}
            </Text>
          ))}
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
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
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
