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
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing, borderRadius } from '@/constants/theme'
import { api, ArticleSummary } from '@/lib/api'

export default function ReadScreen() {
  const colorScheme = useColorScheme()
  const theme = colors[colorScheme ?? 'light']

  const [articles, setArticles] = useState<ArticleSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadArticles = useCallback(async () => {
    try {
      const data = await api.getArticles('read')
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
      loadArticles()
    }, [loadArticles])
  )

  const handleRefresh = () => {
    setRefreshing(true)
    loadArticles()
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
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            Read {item.readAt ? new Date(item.readAt).toLocaleDateString() : 'recently'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Loading...</Text>
      </View>
    )
  }

  if (articles.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Ionicons name="checkmark-done-outline" size={64} color={theme.textMuted} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>No read articles</Text>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          Articles you've finished will appear here
        </Text>
      </View>
    )
  }

  return (
    <FlatList
      style={[styles.list, { backgroundColor: theme.background }]}
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
  )
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
    gap: spacing.md,
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
    height: 120,
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
  meta: {
    marginTop: spacing.md,
  },
  metaText: {
    fontSize: 12,
    fontFamily: 'Georgia',
  },
})
