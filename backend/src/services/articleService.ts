import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { AppDataSource } from '@config/database'
import { Article } from '@entities/Article'
import { generatePublicSlug } from '@utils/slugGenerator'
import { NotFoundError } from '@utils/ResponseError'

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
})

// Keep images in markdown
turndownService.addRule('images', {
  filter: 'img',
  replacement: (content, node) => {
    const img = node as HTMLImageElement
    const alt = img.alt || ''
    const src = img.src || ''
    const title = img.title ? ` "${img.title}"` : ''
    return src ? `![${alt}](${src}${title})` : ''
  },
})

interface ParsedArticle {
  title: string
  author: string | null
  siteName: string | null
  excerpt: string | null
  contentHtml: string
  contentMarkdown: string
  featuredImage: string | null
  wordCount: number
  estimatedReadingTime: number
}

export function parseArticleFromHtml(html: string, url: string): ParsedArticle {
  const dom = new JSDOM(html, { url })
  const document = dom.window.document

  // Try to get featured image from meta tags
  let featuredImage =
    document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
    document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
    null

  // Try to get site name
  const siteName =
    document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
    new URL(url).hostname.replace('www.', '')

  // Use Readability to extract main content
  const reader = new Readability(document)
  const article = reader.parse()

  if (!article) {
    throw new Error('Could not parse article content')
  }

  // Convert HTML to Markdown
  const contentMarkdown = turndownService.turndown(article.content)

  // Count words
  const wordCount = contentMarkdown
    .replace(/[#*`\[\]()]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 0).length

  // Estimate reading time (200 words per minute)
  const estimatedReadingTime = Math.ceil(wordCount / 200)

  return {
    title: article.title || 'Untitled',
    author: article.byline || null,
    siteName,
    excerpt: article.excerpt || null,
    contentHtml: article.content,
    contentMarkdown,
    featuredImage,
    wordCount,
    estimatedReadingTime,
  }
}

export async function saveArticle(
  accountId: number,
  url: string,
  html: string
): Promise<Article> {
  const articleRepo = AppDataSource.getRepository(Article)

  // Check if article already exists for this user
  const existing = await articleRepo.findOne({
    where: { accountId, url },
  })

  if (existing) {
    return existing
  }

  // Parse the article
  const parsed = parseArticleFromHtml(html, url)

  // Generate unique public slug
  const publicSlug = generatePublicSlug()

  // Save to database
  const result = await articleRepo.insert({
    accountId,
    url,
    publicSlug,
    ...parsed,
  })

  return articleRepo.findOneOrFail({
    where: { id: result.identifiers[0].id },
  })
}

export async function getArticles(
  accountId: number,
  filter: 'all' | 'read' | 'unread' = 'all'
): Promise<Article[]> {
  const articleRepo = AppDataSource.getRepository(Article)

  const query = articleRepo
    .createQueryBuilder('article')
    .where('article.account_id = :accountId', { accountId })
    .orderBy('article.created_at', 'DESC')

  if (filter === 'read') {
    query.andWhere('article.is_read = true')
  } else if (filter === 'unread') {
    query.andWhere('article.is_read = false')
  }

  return query.getMany()
}

export async function getArticle(
  accountId: number,
  articleId: number
): Promise<Article> {
  const articleRepo = AppDataSource.getRepository(Article)

  const article = await articleRepo.findOne({
    where: { id: articleId, accountId },
  })

  if (!article) {
    throw new NotFoundError('Article not found')
  }

  return article
}

export async function getArticleBySlug(slug: string): Promise<Article> {
  const articleRepo = AppDataSource.getRepository(Article)

  const article = await articleRepo.findOne({
    where: { publicSlug: slug },
    relations: ['account'],
  })

  if (!article) {
    throw new NotFoundError('Article not found')
  }

  return article
}

export async function markArticleAsRead(
  accountId: number,
  articleId: number
): Promise<Article> {
  const articleRepo = AppDataSource.getRepository(Article)

  const article = await getArticle(accountId, articleId)

  await articleRepo.update(articleId, {
    isRead: true,
    readAt: new Date(),
  })

  return articleRepo.findOneOrFail({ where: { id: articleId } })
}

export async function markArticleAsUnread(
  accountId: number,
  articleId: number
): Promise<Article> {
  const articleRepo = AppDataSource.getRepository(Article)

  const article = await getArticle(accountId, articleId)

  await articleRepo.update(articleId, {
    isRead: false,
    readAt: null,
  })

  return articleRepo.findOneOrFail({ where: { id: articleId } })
}

export async function deleteArticle(
  accountId: number,
  articleId: number
): Promise<void> {
  const article = await getArticle(accountId, articleId)
  const articleRepo = AppDataSource.getRepository(Article)
  await articleRepo.softDelete(articleId)
}

export async function updateArticleAudio(
  articleId: number,
  audioUrl: string,
  voiceId: string
): Promise<Article> {
  const articleRepo = AppDataSource.getRepository(Article)

  await articleRepo.update(articleId, {
    audioUrl,
    audioVoiceId: voiceId,
  })

  return articleRepo.findOneOrFail({ where: { id: articleId } })
}
