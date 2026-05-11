import { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  RefreshControl,
  Image,
  ScrollView,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing, borderRadius } from '@/constants/theme'
import { api, ArticleSummary } from '@/lib/api'

type Filter = 'unread' | 'read' | 'all'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'all', label: 'All' },
]

export default function LibraryScreen() {
  const colorScheme = useColorScheme()
  const theme = colors[colorScheme ?? 'light']

  const [filter, setFilter] = useState<Filter>('unread')
  const [articles, setArticles] = useState<ArticleSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadArticles = useCallback(async (f: Filter) => {
    try {
      const data = await api.getArticles(f)
      setArticles(data)
    } catch (error) {
      console.error('Failed to load articles:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      loadArticles(filter)
    }, [loadArticles, filter])
  )

  const handleRefresh = () => {
    setRefreshing(true)
    loadArticles(filter)
  }

  const renderItem = ({ item }: { item: ArticleSummary }) => (
    <TouchableOpacity
      style={[styles.articleCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => router.push(`/article/${item.id}`)}
    >
      {item.featuredImage && (
        <Image source={{ uri: item.featuredImage }} style={styles.thumbnail} />
      )}
      <View style={styles.cardContent}>
        <Text style={[styles.siteName, { color: theme.textMuted }]}>
          {item.siteName || new URL(item.url).hostname}
        </Text>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        {item.excerpt && (
          <Text style={[styles.excerpt, { color: theme.textSecondary }]} numberOfLines={2}>
            {item.excerpt}
          </Text>
        )}
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            {item.estimatedReadingTime} min read
          </Text>
          {item.hasAudio && (
            <Ionicons name="headset-outline" size={14} color={theme.primary} style={styles.audioIcon} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  )

  const renderFilterChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipsRow}
      contentContainerStyle={styles.chipsContent}
    >
      {FILTERS.map(({ value, label }) => {
        const active = filter === value
        return (
          <TouchableOpacity
            key={value}
            onPress={() => setFilter(value)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.primary : theme.surface,
                borderColor: active ? theme.primary : theme.border,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: active ? '#fff' : theme.textSecondary },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )

  const emptyMessage = filter === 'read'
    ? 'No read articles yet'
    : filter === 'unread'
    ? 'No unread articles'
    : 'Your library is empty'

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderFilterChips()}
      {loading ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Loading...</Text>
        </View>
      ) : articles.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="book-outline" size={64} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{emptyMessage}</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Tap Add to save a podcast or article
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={articles}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.primary}
            />
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  chipsRow: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chipsContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 14,
    fontFamily: 'Georgia',
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Georgia',
    fontWeight: '600',
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Georgia',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  articleCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: 150,
  },
  cardContent: {
    padding: spacing.md,
  },
  siteName: {
    fontSize: 12,
    fontFamily: 'Georgia',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Georgia',
    fontWeight: '600',
    marginTop: spacing.xs,
    lineHeight: 24,
  },
  excerpt: {
    fontSize: 14,
    fontFamily: 'Georgia',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  metaText: {
    fontSize: 12,
    fontFamily: 'Georgia',
  },
  audioIcon: {
    marginLeft: spacing.sm,
  },
})
