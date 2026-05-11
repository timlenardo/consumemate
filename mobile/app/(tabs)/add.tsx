import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ScrollView,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing, borderRadius } from '@/constants/theme'
import { api, ResolvedPodcast } from '@/lib/api'

export default function AddScreen() {
  const colorScheme = useColorScheme()
  const theme = colors[colorScheme ?? 'light']

  const [url, setUrl] = useState('')
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState<ResolvedPodcast | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleResolve = async () => {
    const trimmed = url.trim()
    if (!trimmed) return

    setResolving(true)
    setError(null)
    setResolved(null)
    try {
      const result = await api.resolvePodcast(trimmed)
      setResolved(result)
    } catch (e: any) {
      setError(e.message || 'Could not resolve that URL')
    } finally {
      setResolving(false)
    }
  }

  const handleSave = () => {
    // Backend podcast-persistence endpoints aren't built yet — that's the next step.
    Alert.alert(
      'Coming soon',
      'Podcast library + transcription pipeline is the next step. For now, this resolves the URL so we can verify the share-extension and resolver work end-to-end.'
    )
  }

  const handleClear = () => {
    setUrl('')
    setResolved(null)
    setError(null)
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.heading, { color: theme.text }]}>Add a podcast</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Paste a Spotify, Apple Podcasts, or RSS-feed URL.
        </Text>

        <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Ionicons name="link-outline" size={20} color={theme.textMuted} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            value={url}
            onChangeText={setUrl}
            placeholder="https://..."
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleResolve}
            editable={!resolving}
          />
          {url.length > 0 && (
            <TouchableOpacity onPress={handleClear} hitSlop={10}>
              <Ionicons name="close-circle" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: theme.primary, opacity: resolving || !url.trim() ? 0.5 : 1 },
          ]}
          onPress={handleResolve}
          disabled={resolving || !url.trim()}
        >
          {resolving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Resolve</Text>
          )}
        </TouchableOpacity>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: theme.errorBackground, borderColor: theme.error }]}>
            <Ionicons name="alert-circle-outline" size={18} color={theme.error} />
            <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
          </View>
        )}

        {resolved && (
          <View style={[styles.preview, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.previewHeader}>
              {resolved.show.artworkUrl && (
                <Image source={{ uri: resolved.show.artworkUrl }} style={styles.artwork} />
              )}
              <View style={styles.previewMeta}>
                <Text style={[styles.previewLabel, { color: theme.textMuted }]}>
                  {labelForSource(resolved.source)}
                </Text>
                <Text style={[styles.previewShow, { color: theme.text }]} numberOfLines={2}>
                  {resolved.show.title}
                </Text>
                {resolved.show.author && (
                  <Text style={[styles.previewAuthor, { color: theme.textSecondary }]} numberOfLines={1}>
                    {resolved.show.author}
                  </Text>
                )}
              </View>
            </View>

            {resolved.episode && (
              <View style={[styles.episodeBlock, { borderTopColor: theme.border }]}>
                <Text style={[styles.episodeLabel, { color: theme.textMuted }]}>EPISODE</Text>
                <Text style={[styles.episodeTitle, { color: theme.text }]}>
                  {resolved.episode.title}
                </Text>
                <Text style={[styles.episodeMeta, { color: theme.textSecondary }]}>
                  {formatDuration(resolved.episode.durationSeconds)}
                  {resolved.episode.pubDate && ` · ${formatDate(resolved.episode.pubDate)}`}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: theme.primary }]}
              onPress={handleSave}
            >
              <Ionicons name="bookmark-outline" size={18} color="#fff" />
              <Text style={styles.saveButtonText}>Add to library</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function labelForSource(source: ResolvedPodcast['source']): string {
  switch (source) {
    case 'spotify': return 'FROM SPOTIFY'
    case 'apple': return 'FROM APPLE PODCASTS'
    case 'rss': return 'FROM RSS FEED'
  }
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return 'Unknown duration'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDate(raw: string): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  heading: {
    fontSize: 28,
    fontFamily: 'Georgia',
    fontWeight: '700',
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Georgia',
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Georgia',
  },
  primaryButton: {
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Georgia',
    fontWeight: '600',
  },
  errorBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Georgia',
  },
  preview: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  previewHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  artwork: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.sm,
  },
  previewMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  previewLabel: {
    fontSize: 11,
    fontFamily: 'Georgia',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  previewShow: {
    fontSize: 18,
    fontFamily: 'Georgia',
    fontWeight: '600',
    lineHeight: 22,
  },
  previewAuthor: {
    fontSize: 14,
    fontFamily: 'Georgia',
    marginTop: 2,
  },
  episodeBlock: {
    padding: spacing.md,
    borderTopWidth: 1,
  },
  episodeLabel: {
    fontSize: 11,
    fontFamily: 'Georgia',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  episodeTitle: {
    fontSize: 16,
    fontFamily: 'Georgia',
    fontWeight: '600',
    lineHeight: 22,
  },
  episodeMeta: {
    fontSize: 13,
    fontFamily: 'Georgia',
    marginTop: spacing.xs,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    margin: spacing.md,
    borderRadius: borderRadius.md,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Georgia',
    fontWeight: '600',
  },
})
