import Parser from 'rss-parser'
import { BadRequestError, NotFoundError } from '@utils/ResponseError'

/**
 * Podcast URL resolver.
 *
 * Accepts any URL that points to a podcast episode or show, dispatches to a
 * source-specific resolver (Spotify, Apple Podcasts, RSS today; YouTube and
 * others later), and returns the underlying audio URL plus episode metadata.
 *
 * Adding a new source: implement `UrlResolver` and register it in `RESOLVERS`
 * below. Resolvers are tried in order; the RSS resolver is the last fallback
 * since its `matches()` accepts any URL.
 */

const FETCH_TIMEOUT_MS = 15_000
const MAX_HTML_BYTES = 2_000_000

// rss-parser automatically maps the `itunes:` namespace to `item.itunes.*`
// and `feed.itunes.*`, so we don't need customFields here.
const rssParser = new Parser()

export interface ResolvedShow {
  title: string
  author: string | null
  feedUrl: string
  artworkUrl: string | null
}

export interface ResolvedEpisode {
  title: string
  audioUrl: string
  durationSeconds: number | null
  pubDate: string | null
  guid: string
  description: string | null
}

export type ResolveSource = 'spotify' | 'apple' | 'rss'  // extend as resolvers are added

export interface ResolveResult {
  source: ResolveSource
  type: 'episode' | 'show'
  show: ResolvedShow
  episode: ResolvedEpisode | null
}

/**
 * Contract for a source-specific resolver. Each implementation declares which
 * URLs it can handle (`matches`) and how to turn one into a ResolveResult.
 */
export interface UrlResolver {
  source: ResolveSource
  matches(url: URL): boolean
  resolve(url: URL): Promise<ResolveResult>
}

export async function resolveUrl(rawUrl: string): Promise<ResolveResult> {
  const url = parseUrl(rawUrl)
  const resolver = RESOLVERS.find((r) => r.matches(url))
  if (!resolver) {
    throw new BadRequestError(
      `No resolver available for ${url.hostname}. ` +
      `Currently supported: Spotify, Apple Podcasts, RSS feeds.`
    )
  }
  return resolver.resolve(url)
}

function parseUrl(raw: string): URL {
  try {
    return new URL(raw)
  } catch {
    throw new BadRequestError('Not a valid URL')
  }
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetchWithTimeout(url, init)
  if (!res.ok) throw new BadRequestError(`Fetch failed [${res.status}] for ${url}`)
  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_HTML_BYTES) {
    throw new BadRequestError(`Response too large (${buf.byteLength} bytes)`)
  }
  return new TextDecoder('utf-8').decode(buf)
}

// --- Spotify -----------------------------------------------------------------

async function resolveSpotify(url: URL): Promise<ResolveResult> {
  // /episode/:id or /show/:id
  const match = url.pathname.match(/^\/(episode|show)\/([A-Za-z0-9]+)/)
  if (!match) throw new BadRequestError('Unrecognized Spotify URL')
  const kind = match[1] as 'episode' | 'show'

  const html = await fetchText(url.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0 consumemate-resolver/1.0' },
  })

  const showName = pickMeta(html, 'music:musician_description')
    || pickMeta(html, 'og:music:album')
    || pickMeta(html, 'og:site_name_alternate')
    || extractShowFromTitle(pickMeta(html, 'og:title') || '')

  const ogTitle = pickMeta(html, 'og:title') || ''
  const episodeTitle = kind === 'episode' ? cleanEpisodeTitle(ogTitle) : null

  if (!showName) throw new BadRequestError('Could not extract show name from Spotify page')

  const feedUrl = await findFeedViaItunes(showName)
  if (!feedUrl) {
    throw new NotFoundError(
      'Could not find an Apple-Podcasts feed for this show — it may be a Spotify exclusive'
    )
  }

  const { show, episodes } = await fetchFeed(feedUrl)
  const episode = kind === 'episode' && episodeTitle
    ? findEpisodeByTitle(episodes, episodeTitle)
    : episodes[0] ?? null

  return {
    source: 'spotify',
    type: kind,
    show,
    episode,
  }
}

function pickMeta(html: string, property: string): string | null {
  // Match either <meta property="..." content="..."> or content first
  const propEsc = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${propEsc}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${propEsc}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${propEsc}["'][^>]+content=["']([^"']+)["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m) return decodeHtmlEntities(m[1])
  }
  return null
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
}

function extractShowFromTitle(ogTitle: string): string | null {
  // Spotify formats: "Episode title - Show name | Podcast on Spotify"
  // or "Show name | Podcast on Spotify"
  const cleaned = ogTitle.replace(/\s*\|\s*Podcast on Spotify\s*$/i, '')
  const parts = cleaned.split(' - ')
  if (parts.length >= 2) return parts.slice(1).join(' - ').trim()
  return cleaned.trim() || null
}

function cleanEpisodeTitle(ogTitle: string): string {
  return ogTitle
    .replace(/\s*\|\s*Podcast on Spotify\s*$/i, '')
    .split(' - ')[0]
    .trim()
}

// --- Apple Podcasts ----------------------------------------------------------

async function resolveApple(url: URL): Promise<ResolveResult> {
  // /{country}/podcast/{slug}/id{showId}?i={episodeId}
  const showMatch = url.pathname.match(/\/id(\d+)/)
  if (!showMatch) throw new BadRequestError('Unrecognized Apple Podcasts URL')
  const showId = showMatch[1]
  const episodeId = url.searchParams.get('i')

  const lookup = await fetchText(
    `https://itunes.apple.com/lookup?id=${showId}`
  )
  const data = JSON.parse(lookup) as { results: any[] }
  const showResult = data.results[0]
  if (!showResult?.feedUrl) {
    throw new NotFoundError('Apple Podcasts has no feed URL for this show')
  }

  const { show, episodes } = await fetchFeed(showResult.feedUrl)

  let episode: ResolvedEpisode | null = null
  if (episodeId) {
    // Episode IDs don't resolve via `/lookup?id={episodeId}` directly. Instead
    // we query the show's full episode list and filter by trackId.
    const epLookup = await fetchText(
      `https://itunes.apple.com/lookup?id=${showId}&entity=podcastEpisode&limit=200`
    )
    const epData = JSON.parse(epLookup) as { results: any[] }
    const epResult = epData.results.find(
      (r: any) => r.kind === 'podcast-episode' && String(r.trackId) === episodeId
    )
    if (epResult?.trackName) {
      episode = findEpisodeByTitle(episodes, epResult.trackName)
    }
  }
  if (!episode) episode = episodes[0] ?? null

  return {
    source: 'apple',
    type: episodeId ? 'episode' : 'show',
    show,
    episode,
  }
}

// --- RSS direct --------------------------------------------------------------

async function resolveRss(url: URL): Promise<ResolveResult> {
  let parsed
  try {
    parsed = await fetchFeed(url.toString())
  } catch (e: any) {
    // The RSS resolver is the fallback for any URL that didn't match a
    // specialized resolver, so failures here usually mean "we don't yet
    // support this kind of URL" — say so explicitly.
    throw new BadRequestError(
      `Could not handle ${url.hostname} — not a recognized podcast source ` +
      `and not a valid RSS feed. Currently supported: Spotify, Apple Podcasts, ` +
      `and direct RSS feeds. (${e.message})`
    )
  }
  return {
    source: 'rss',
    type: 'show',
    show: parsed.show,
    episode: parsed.episodes[0] ?? null,
  }
}

// --- Shared helpers ----------------------------------------------------------

async function findFeedViaItunes(showName: string): Promise<string | null> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(showName)}&entity=podcast&limit=10`
  const body = await fetchText(url)
  const data = JSON.parse(body) as { results: any[] }
  // Prefer an exact case-insensitive match on collectionName.
  const norm = showName.toLowerCase().trim()
  const exact = data.results.find(
    (r) => typeof r.collectionName === 'string' && r.collectionName.toLowerCase().trim() === norm
  )
  return (exact?.feedUrl as string | undefined) || (data.results[0]?.feedUrl as string | undefined) || null
}

async function fetchFeed(feedUrl: string): Promise<{ show: ResolvedShow; episodes: ResolvedEpisode[] }> {
  const xml = await fetchText(feedUrl, {
    headers: { 'User-Agent': 'consumemate-resolver/1.0' },
  })
  const parsed = await rssParser.parseString(xml)

  const show: ResolvedShow = {
    title: parsed.title || 'Unknown',
    author: parsed.itunes?.author || parsed.creator || null,
    feedUrl,
    artworkUrl: extractArtwork(parsed),
  }

  const episodes: ResolvedEpisode[] = (parsed.items || []).flatMap((item) => {
    const audioUrl = item.enclosure?.url
    if (!audioUrl) return []
    return [{
      title: item.title || 'Untitled',
      audioUrl,
      durationSeconds: parseDuration(item.itunes?.duration),
      pubDate: item.pubDate || null,
      guid: item.guid || audioUrl,
      description: item.contentSnippet || item.content || null,
    }]
  })

  return { show, episodes }
}

function extractArtwork(parsed: any): string | null {
  const img = parsed.itunes?.image
  if (typeof img === 'string') return img
  if (parsed.image?.url) return parsed.image.url
  return null
}

function parseDuration(raw: string | undefined): number | null {
  if (!raw) return null
  // Either "HH:MM:SS", "MM:SS", or a plain integer seconds string.
  if (/^\d+$/.test(raw)) return parseInt(raw, 10)
  const parts = raw.split(':').map((p) => parseInt(p, 10))
  if (parts.some((n) => isNaN(n))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

function findEpisodeByTitle(episodes: ResolvedEpisode[], target: string): ResolvedEpisode | null {
  const normTarget = normalizeTitle(target)
  // Exact normalized match first
  const exact = episodes.find((e) => normalizeTitle(e.title) === normTarget)
  if (exact) return exact
  // Substring match: target contained in episode title or vice versa
  const sub = episodes.find((e) => {
    const t = normalizeTitle(e.title)
    return t.includes(normTarget) || normTarget.includes(t)
  })
  return sub ?? null
}

function normalizeTitle(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// --- Resolver registry -------------------------------------------------------
//
// Order matters: more specific resolvers first; the RSS resolver is the
// catch-all fallback. To add a new source (YouTube, Overcast, etc.), implement
// the UrlResolver interface and insert the new resolver above `rssResolver`.

const spotifyResolver: UrlResolver = {
  source: 'spotify',
  matches: (url) => url.hostname === 'open.spotify.com' || url.hostname.endsWith('.spotify.com'),
  resolve: resolveSpotify,
}

const appleResolver: UrlResolver = {
  source: 'apple',
  matches: (url) => url.hostname === 'podcasts.apple.com' || url.hostname.endsWith('.podcasts.apple.com'),
  resolve: resolveApple,
}

const rssResolver: UrlResolver = {
  source: 'rss',
  matches: () => true, // fallback for everything else
  resolve: resolveRss,
}

const RESOLVERS: UrlResolver[] = [
  spotifyResolver,
  appleResolver,
  // Future: youtubeResolver, overcastResolver, etc.
  rssResolver,
]

