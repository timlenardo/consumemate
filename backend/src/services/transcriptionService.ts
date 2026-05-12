import crypto from 'crypto'
import fs from 'fs/promises'
import { createWriteStream } from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { AppDataSource } from '@config/database'
import { TranscriptCache } from '@entities/TranscriptCache'
import { BadRequestError } from '@utils/ResponseError'

/**
 * Whisper-V3 (OpenAI `whisper-1`) podcast transcription with chunking.
 *
 * Lifecycle:
 *  1. Hash audioUrl. Hit cache → return.
 *  2. Stream the audio to a temp file (no size cap on the download itself).
 *  3. ffprobe duration; if file > 20 MB, ffmpeg-segment into ≤20 MB chunks.
 *     20 MB leaves headroom under OpenAI's 25 MB upload limit.
 *  4. Transcribe chunks in parallel against OpenAI Whisper.
 *  5. Stitch words/segments with chunk offsets; persist to cache.
 *
 * Caller passes `onEvent` so the controller can stream NDJSON progress to
 * the iOS client (avoids Heroku's 30s no-data H12 timeout on long podcasts).
 */

const TARGET_CHUNK_BYTES = 20 * 1024 * 1024
const OPENAI_HARD_LIMIT_BYTES = 25 * 1024 * 1024
const MIN_CHUNK_SECONDS = 60
const FETCH_TIMEOUT_MS = 120_000
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

export type ProgressEvent =
  | { type: 'status'; stage: 'cache_hit' | 'downloading' | 'probing' | 'splitting' | 'transcribing' | 'stitching' | 'caching'; chunkCount?: number; sizeBytes?: number; durationSeconds?: number }
  | { type: 'chunk_done'; index: number; chunkCount: number }
  | { type: 'heartbeat' }

export async function transcribeAudio(
  audioUrl: string,
  hintedDurationSeconds: number | null,
  onEvent: (event: ProgressEvent) => void
): Promise<TranscriptionPayload> {
  const repo = AppDataSource.getRepository(TranscriptCache)
  const hash = sha256(audioUrl)

  const cached = await repo.findOne({ where: { audioUrlHash: hash } })
  if (cached) {
    onEvent({ type: 'status', stage: 'cache_hit' })
    return { ...(cached.payload as TranscriptionPayload), cached: true }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new BadRequestError('Transcription is not configured (OPENAI_API_KEY missing).')
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cue-transcribe-'))
  try {
    onEvent({ type: 'status', stage: 'downloading' })
    const audioPath = path.join(workDir, 'input' + extensionFromUrl(audioUrl))
    const sizeBytes = await downloadToFile(audioUrl, audioPath)
    onEvent({ type: 'status', stage: 'probing', sizeBytes })

    let probedDuration: number | null = null
    try {
      probedDuration = await ffprobeDurationSeconds(audioPath)
    } catch {
      probedDuration = hintedDurationSeconds
    }
    const effectiveDuration = probedDuration ?? hintedDurationSeconds

    // Decide chunking.
    let chunks: { path: string; offsetSeconds: number }[]
    if (sizeBytes <= OPENAI_HARD_LIMIT_BYTES) {
      chunks = [{ path: audioPath, offsetSeconds: 0 }]
    } else {
      if (!effectiveDuration) {
        throw new BadRequestError(`Audio is ${(sizeBytes / 1024 / 1024).toFixed(1)} MB and exceeds the 25 MB Whisper limit, but we couldn't determine its duration for chunking.`)
      }
      const targetSeconds = Math.max(
        MIN_CHUNK_SECONDS,
        Math.floor((TARGET_CHUNK_BYTES * effectiveDuration) / sizeBytes)
      )
      onEvent({ type: 'status', stage: 'splitting' })
      chunks = await ffmpegSplit(audioPath, workDir, targetSeconds)
      onEvent({ type: 'status', stage: 'transcribing', chunkCount: chunks.length, durationSeconds: effectiveDuration })
    }
    if (chunks.length === 1) {
      onEvent({ type: 'status', stage: 'transcribing', chunkCount: 1, durationSeconds: effectiveDuration ?? undefined })
    }

    const total = chunks.length
    let completed = 0
    const results = await Promise.all(chunks.map(async (chunk) => {
      const buf = await fs.readFile(chunk.path)
      if (buf.byteLength > OPENAI_HARD_LIMIT_BYTES) {
        throw new BadRequestError(`Chunk too large after splitting (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB). The audio bitrate is higher than expected — try a different source.`)
      }
      const filename = path.basename(chunk.path)
      const whisper = await callOpenAIWhisper(apiKey, buf, filename)
      completed++
      onEvent({ type: 'chunk_done', index: completed - 1, chunkCount: total })
      return { whisper, offset: chunk.offsetSeconds }
    }))

    onEvent({ type: 'status', stage: 'stitching' })
    const stitched = stitchChunks(results)

    const finalDuration = effectiveDuration ?? maxEndSeconds(stitched.words, stitched.segments)

    const payload: TranscriptionPayload = {
      provider: 'openai',
      text: stitched.text,
      words: stitched.words,
      segments: stitched.segments,
      cached: false,
      durationSeconds: finalDuration,
    }

    onEvent({ type: 'status', stage: 'caching' })
    await repo.insert({
      audioUrlHash: hash,
      audioUrl,
      provider: 'openai',
      payload,
      durationSeconds: finalDuration,
    })

    return payload
  } finally {
    fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

function extensionFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const tail = u.pathname.split('/').filter(Boolean).pop() || 'audio.mp3'
    const dot = tail.lastIndexOf('.')
    return dot > 0 ? tail.substring(dot) : '.mp3'
  } catch {
    return '.mp3'
  }
}

async function downloadToFile(url: string, dest: string): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 cue-transcriber/1.0' },
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!res.ok || !res.body) {
      throw new BadRequestError(`Audio fetch failed [${res.status}] for ${url}`)
    }
    await pipeline(Readable.fromWeb(res.body as any), createWriteStream(dest))
    const stat = await fs.stat(dest)
    return stat.size
  } finally {
    clearTimeout(timer)
  }
}

async function ffprobeDurationSeconds(audioPath: string): Promise<number> {
  const args = [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    audioPath,
  ]
  const out = await runCommand('ffprobe', args)
  const n = parseFloat(out.trim())
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`ffprobe returned invalid duration: ${out}`)
  }
  return n
}

async function ffmpegSplit(
  audioPath: string,
  workDir: string,
  chunkSeconds: number
): Promise<{ path: string; offsetSeconds: number }[]> {
  const outPattern = path.join(workDir, 'chunk_%03d.mp3')
  const args = [
    '-y',
    '-i', audioPath,
    '-f', 'segment',
    '-segment_time', String(chunkSeconds),
    '-c', 'copy',
    '-reset_timestamps', '1',
    outPattern,
  ]
  await runCommand('ffmpeg', args)

  const names = (await fs.readdir(workDir))
    .filter(n => n.startsWith('chunk_') && n.endsWith('.mp3'))
    .sort()

  // Probe each chunk for its real duration so offsets are exact.
  const chunks: { path: string; offsetSeconds: number }[] = []
  let offset = 0
  for (const name of names) {
    const p = path.join(workDir, name)
    chunks.push({ path: p, offsetSeconds: offset })
    try {
      offset += await ffprobeDurationSeconds(p)
    } catch {
      offset += chunkSeconds
    }
  }
  return chunks
}

function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`${cmd} exited with ${code}: ${stderr.slice(-500)}`))
    })
  })
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

function stitchChunks(
  parts: { whisper: any; offset: number }[]
): { text: string; words: TranscriptionWord[]; segments: TranscriptionSegment[] } {
  const words: TranscriptionWord[] = []
  const segments: TranscriptionSegment[] = []
  const textParts: string[] = []

  for (const { whisper, offset } of parts) {
    const offsetMs = Math.round(offset * 1000)
    if (typeof whisper.text === 'string') textParts.push(whisper.text.trim())

    for (const w of (whisper.words ?? [])) {
      const text = String(w.word ?? '').trim()
      if (!text) continue
      words.push({
        text,
        startMs: Math.round((w.start ?? 0) * 1000) + offsetMs,
        endMs: Math.round((w.end ?? 0) * 1000) + offsetMs,
      })
    }
    for (const s of (whisper.segments ?? [])) {
      segments.push({
        speaker: 'Speaker',
        startMs: Math.round((s.start ?? 0) * 1000) + offsetMs,
        endMs: Math.round((s.end ?? 0) * 1000) + offsetMs,
        text: String(s.text ?? '').trim(),
      })
    }
  }
  return { text: textParts.join(' ').trim(), words, segments }
}

function maxEndSeconds(words: TranscriptionWord[], segments: TranscriptionSegment[]): number | null {
  let m = 0
  for (const w of words) m = Math.max(m, w.endMs)
  for (const s of segments) m = Math.max(m, s.endMs)
  return m > 0 ? m / 1000 : null
}
