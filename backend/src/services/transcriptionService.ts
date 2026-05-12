import crypto from 'crypto'
import { AppDataSource } from '@config/database'
import { env } from '@config/env'
import { TranscriptCache } from '@entities/TranscriptCache'
import { BadRequestError } from '@utils/ResponseError'

/**
 * Whisper-V3 (OpenAI `whisper-1`) podcast transcription.
 *
 * Lifecycle:
 *  1. Hash audioUrl. Hit cache → return.
 *  2. Stream the audio into memory. OpenAI's /v1/audio/transcriptions caps
 *     uploads at 25 MB, so we reject larger files for now. Long episodes will
 *     need server-side ffmpeg chunking — tracked separately.
 *  3. POST as multipart to OpenAI with word + segment granularity.
 *  4. Normalize start/end into milliseconds. Persist to cache. Return.
 */

const OPENAI_AUDIO_MAX_BYTES = 25 * 1024 * 1024
const FETCH_TIMEOUT_MS = 60_000
const OPENAI_TIMEOUT_MS = 300_000

export interface TranscriptionWord {
  text: string
  startMs: number
  endMs: number
}

export interface TranscriptionSegment {
  speaker: string
  startMs: number
  endMs: number
  text: string
}

export interface TranscriptionPayload {
  provider: 'openai'
  text: string
  words: TranscriptionWord[]
  segments: TranscriptionSegment[]
  cached: boolean
  durationSeconds: number | null
}

export async function transcribeAudio(
  audioUrl: string,
  hintedDurationSeconds: number | null
): Promise<TranscriptionPayload> {
  const repo = AppDataSource.getRepository(TranscriptCache)
  const hash = sha256(audioUrl)

  // 1. Cache hit?
  const cached = await repo.findOne({ where: { audioUrlHash: hash } })
  if (cached) {
    return { ...(cached.payload as TranscriptionPayload), cached: true }
  }

  // 2. Download. Whisper's upload limit is 25 MB.
  const audioBuf = await downloadAudio(audioUrl)

  // 3. Call Whisper.
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new BadRequestError('Transcription is not configured (OPENAI_API_KEY missing).')
  }
  const filename = filenameFromUrl(audioUrl)
  const whisper = await callOpenAIWhisper(apiKey, audioBuf, filename)

  // 4. Normalize.
  const words: TranscriptionWord[] = (whisper.words ?? []).map((w: any) => ({
    text: String(w.word ?? '').trim(),
    startMs: Math.round((w.start ?? 0) * 1000),
    endMs: Math.round((w.end ?? 0) * 1000),
  })).filter((w: TranscriptionWord) => w.text.length > 0)

  const segments: TranscriptionSegment[] = (whisper.segments ?? []).map((s: any) => ({
    speaker: 'Speaker',  // Whisper doesn't diarize; placeholder for now.
    startMs: Math.round((s.start ?? 0) * 1000),
    endMs: Math.round((s.end ?? 0) * 1000),
    text: String(s.text ?? '').trim(),
  }))

  const durationSeconds: number | null =
    typeof whisper.duration === 'number'
      ? whisper.duration
      : hintedDurationSeconds ?? null

  const payload: TranscriptionPayload = {
    provider: 'openai',
    text: String(whisper.text ?? ''),
    words,
    segments,
    cached: false,
    durationSeconds,
  }

  await repo.insert({
    audioUrlHash: hash,
    audioUrl,
    provider: 'openai',
    payload,
    durationSeconds,
  })

  return payload
}

// ── helpers ────────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const tail = u.pathname.split('/').filter(Boolean).pop() || 'audio'
    return tail.includes('.') ? tail : `${tail}.mp3`
  } catch {
    return 'audio.mp3'
  }
}

async function downloadAudio(url: string): Promise<Buffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 cue-transcriber/1.0' },
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!res.ok) {
      throw new BadRequestError(`Audio fetch failed [${res.status}] for ${url}`)
    }
    const contentLengthHeader = res.headers.get('content-length')
    if (contentLengthHeader) {
      const len = parseInt(contentLengthHeader, 10)
      if (len > OPENAI_AUDIO_MAX_BYTES) {
        throw new BadRequestError(
          `Episode audio is ${Math.round(len / 1024 / 1024)} MB. ` +
          `Whisper's upload limit is 25 MB; long episodes need server-side chunking (not yet implemented).`
        )
      }
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > OPENAI_AUDIO_MAX_BYTES) {
      throw new BadRequestError(
        `Episode audio is ${Math.round(buf.byteLength / 1024 / 1024)} MB. ` +
        `Whisper's upload limit is 25 MB; long episodes need server-side chunking (not yet implemented).`
      )
    }
    return buf
  } finally {
    clearTimeout(timer)
  }
}

async function callOpenAIWhisper(apiKey: string, audio: Buffer, filename: string): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)
  try {
    const form = new FormData()
    form.append('model', 'whisper-1')
    form.append('response_format', 'verbose_json')
    form.append('timestamp_granularities[]', 'segment')
    form.append('timestamp_granularities[]', 'word')
    form.append('file', new Blob([new Uint8Array(audio)]), filename)

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text()
      throw new BadRequestError(`OpenAI Whisper failed [${res.status}]: ${body.slice(0, 300)}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}
