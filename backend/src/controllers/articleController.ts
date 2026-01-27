import { z } from 'zod'
import { endpoint, endpointAuth } from '@middleware/endpoint'
import * as articleService from '@services/articleService'
import * as ttsService from '@services/ttsService'
import { env } from '@config/env'

export const saveArticle = endpointAuth(
  async (req) => {
    const { url, html } = req.body
    const article = await articleService.saveArticle(req.auth.accountId, url, html)
    return {
      id: article.id,
      url: article.url,
      title: article.title,
      author: article.author,
      siteName: article.siteName,
      excerpt: article.excerpt,
      featuredImage: article.featuredImage,
      wordCount: article.wordCount,
      estimatedReadingTime: article.estimatedReadingTime,
      isRead: article.isRead,
      publicSlug: article.publicSlug,
      publicUrl: `${env.publicUrl}/read/${article.publicSlug}`,
      createdAt: article.createdAt,
    }
  },
  z.object({
    body: z.object({
      url: z.string().url(),
      html: z.string(),
    }),
  })
)

export const getArticles = endpointAuth(
  async (req) => {
    const filter = (req.query.filter as 'all' | 'read' | 'unread') || 'all'
    const articles = await articleService.getArticles(req.auth.accountId, filter)

    return articles.map(article => ({
      id: article.id,
      url: article.url,
      title: article.title,
      author: article.author,
      siteName: article.siteName,
      excerpt: article.excerpt,
      featuredImage: article.featuredImage,
      wordCount: article.wordCount,
      estimatedReadingTime: article.estimatedReadingTime,
      isRead: article.isRead,
      readAt: article.readAt,
      publicSlug: article.publicSlug,
      publicUrl: `${env.publicUrl}/read/${article.publicSlug}`,
      hasAudio: !!article.audioUrl,
      createdAt: article.createdAt,
    }))
  },
  z.object({
    query: z.object({
      filter: z.enum(['all', 'read', 'unread']).optional(),
    }),
  })
)

export const getArticle = endpointAuth(
  async (req) => {
    const articleId = parseInt(req.params.id, 10)
    const article = await articleService.getArticle(req.auth.accountId, articleId)

    return {
      id: article.id,
      url: article.url,
      title: article.title,
      author: article.author,
      siteName: article.siteName,
      excerpt: article.excerpt,
      contentMarkdown: article.contentMarkdown,
      contentHtml: article.contentHtml,
      featuredImage: article.featuredImage,
      wordCount: article.wordCount,
      estimatedReadingTime: article.estimatedReadingTime,
      isRead: article.isRead,
      readAt: article.readAt,
      publicSlug: article.publicSlug,
      publicUrl: `${env.publicUrl}/read/${article.publicSlug}`,
      audioUrl: article.audioUrl,
      audioVoiceId: article.audioVoiceId,
      createdAt: article.createdAt,
    }
  },
  z.object({
    params: z.object({
      id: z.string(),
    }),
  })
)

export const markAsRead = endpointAuth(
  async (req) => {
    const articleId = parseInt(req.params.id, 10)
    const article = await articleService.markArticleAsRead(req.auth.accountId, articleId)
    return { success: true, isRead: article.isRead }
  },
  z.object({
    params: z.object({
      id: z.string(),
    }),
  })
)

export const markAsUnread = endpointAuth(
  async (req) => {
    const articleId = parseInt(req.params.id, 10)
    const article = await articleService.markArticleAsUnread(req.auth.accountId, articleId)
    return { success: true, isRead: article.isRead }
  },
  z.object({
    params: z.object({
      id: z.string(),
    }),
  })
)

export const deleteArticle = endpointAuth(
  async (req) => {
    const articleId = parseInt(req.params.id, 10)
    await articleService.deleteArticle(req.auth.accountId, articleId)
    return { success: true }
  },
  z.object({
    params: z.object({
      id: z.string(),
    }),
  })
)

export const generateAudio = endpointAuth(
  async (req) => {
    const articleId = parseInt(req.params.id, 10)
    const { voiceId } = req.body

    const article = await articleService.getArticle(req.auth.accountId, articleId)

    // Check if we already have cached audio for this voice
    if (article.audioData && article.audioVoiceId === voiceId) {
      return {
        audioData: article.audioData,
        contentType: 'audio/mpeg',
        wordTimings: article.audioWordTimings ? JSON.parse(article.audioWordTimings) : [],
        processedText: article.audioProcessedText || '',
        cached: true,
      }
    }

    // Generate audio from markdown content (stripped of formatting)
    const plainText = article.contentMarkdown
      .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
      .replace(/[#*`_~]/g, '') // Remove markdown formatting
      .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
      .trim()

    const speechResult = await ttsService.generateSpeech(plainText, voiceId)
    const audioBase64 = speechResult.audio.toString('base64')
    const wordTimingsJson = JSON.stringify(speechResult.wordTimings)

    // Save the generated audio to the database
    await articleService.updateArticleAudio(
      articleId,
      audioBase64,
      voiceId,
      wordTimingsJson,
      speechResult.processedText
    )

    return {
      audioData: audioBase64,
      contentType: 'audio/mpeg',
      wordTimings: speechResult.wordTimings,
      processedText: speechResult.processedText,
      cached: false,
    }
  },
  z.object({
    params: z.object({
      id: z.string(),
    }),
    body: z.object({
      voiceId: z.string(),
    }),
  })
)

// Chunked audio generation - generates one chunk at a time for faster playback start
export const generateAudioChunk = endpointAuth(
  async (req) => {
    const articleId = parseInt(req.params.id, 10)
    const { voiceId, chunkIndex } = req.body

    const article = await articleService.getArticle(req.auth.accountId, articleId)

    // Check for cached chunk first
    const cachedChunk = articleService.getCachedChunk(article, voiceId, chunkIndex)
    if (cachedChunk) {
      console.log(`[generateAudioChunk] Returning cached chunk ${chunkIndex} for article ${articleId}`)
      // Get total chunks to return in response
      const plainText = article.contentMarkdown
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[#*`_~]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      const totalChunks = ttsService.getChunkCount(plainText)

      return {
        audioData: cachedChunk.audioData,
        contentType: 'audio/mpeg',
        wordTimings: cachedChunk.wordTimings,
        chunkText: '', // Not stored in cache
        chunkIndex,
        totalChunks,
        cached: true,
      }
    }

    // Get plain text from markdown
    const plainText = article.contentMarkdown
      .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
      .replace(/[#*`_~]/g, '') // Remove markdown formatting
      .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
      .trim()

    const result = await ttsService.generateChunk(plainText, voiceId, chunkIndex)
    const audioBase64 = result.audio.toString('base64')

    // Save the chunk to cache
    await articleService.saveAudioChunk(
      articleId,
      voiceId,
      chunkIndex,
      result.totalChunks,
      audioBase64,
      result.wordTimings
    )

    return {
      audioData: audioBase64,
      contentType: 'audio/mpeg',
      wordTimings: result.wordTimings,
      chunkText: result.chunkText,
      chunkIndex: result.chunkIndex,
      totalChunks: result.totalChunks,
      cached: false,
    }
  },
  z.object({
    params: z.object({
      id: z.string(),
    }),
    body: z.object({
      voiceId: z.string(),
      chunkIndex: z.number().int().min(0),
    }),
  })
)

// Get chunk count for an article (so client knows how many chunks to request)
export const getAudioChunkCount = endpointAuth(
  async (req) => {
    const articleId = parseInt(req.params.id, 10)
    const voiceId = req.query.voiceId as string | undefined
    const article = await articleService.getArticle(req.auth.accountId, articleId)

    const plainText = article.contentMarkdown
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*`_~]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    const totalChunks = ttsService.getChunkCount(plainText)

    // If voiceId is provided, return info about which chunks are already generated
    const generatedChunks = voiceId
      ? articleService.getGeneratedChunkIndices(article, voiceId)
      : []

    return {
      totalChunks,
      articleId,
      voiceId: voiceId || null,
      generatedChunks,
    }
  },
  z.object({
    params: z.object({
      id: z.string(),
    }),
    query: z.object({
      voiceId: z.string().optional(),
    }),
  })
)

export const clearAudio = endpointAuth(
  async (req) => {
    const articleId = parseInt(req.params.id, 10)
    await articleService.clearArticleAudio(req.auth.accountId, articleId)
    return { success: true }
  },
  z.object({
    params: z.object({
      id: z.string(),
    }),
  })
)

// Public endpoint - no auth required
export const getPublicArticle = endpoint(
  async (req) => {
    const { slug } = req.params
    const article = await articleService.getArticleBySlug(slug)

    return {
      id: article.id,
      title: article.title,
      author: article.author,
      siteName: article.siteName,
      excerpt: article.excerpt,
      contentHtml: article.contentHtml,
      featuredImage: article.featuredImage,
      wordCount: article.wordCount,
      estimatedReadingTime: article.estimatedReadingTime,
      originalUrl: article.url,
      savedBy: article.account?.name || 'A Consumemate user',
      createdAt: article.createdAt,
    }
  },
  z.object({
    params: z.object({
      slug: z.string(),
    }),
  })
)
