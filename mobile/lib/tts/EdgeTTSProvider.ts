// Edge TTS Provider - Client-side implementation using react-native-edge-tts
// This generates audio directly on the device, bypassing Heroku

import { EdgeTTS, listVoices } from 'react-native-edge-tts'
import { TTSProvider, TTSProviderInfo, Voice, TTSChunkResult, WordTiming } from './types'

// Chunk size for splitting text
const MAX_CHUNK_CHARS = 1000

// Preferred English voices with friendly names
const PREFERRED_VOICES: { id: string; name: string }[] = [
  { id: 'en-US-AriaNeural', name: 'Aria (US)' },
  { id: 'en-US-JennyNeural', name: 'Jenny (US)' },
  { id: 'en-US-GuyNeural', name: 'Guy (US)' },
  { id: 'en-US-ChristopherNeural', name: 'Christopher (US)' },
  { id: 'en-US-EricNeural', name: 'Eric (US)' },
  { id: 'en-US-MichelleNeural', name: 'Michelle (US)' },
  { id: 'en-US-RogerNeural', name: 'Roger (US)' },
  { id: 'en-US-SteffanNeural', name: 'Steffan (US)' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia (UK)' },
  { id: 'en-GB-RyanNeural', name: 'Ryan (UK)' },
  { id: 'en-GB-LibbyNeural', name: 'Libby (UK)' },
  { id: 'en-AU-NatashaNeural', name: 'Natasha (AU)' },
  { id: 'en-AU-WilliamNeural', name: 'William (AU)' },
]

export class EdgeTTSProvider implements TTSProvider {
  private cachedVoices: Voice[] | null = null

  getProviderInfo(): TTSProviderInfo {
    return {
      id: 'edge',
      name: 'Edge TTS',
      description: 'Free Microsoft neural voices (generated on device)',
      requiresNetwork: true,
      supportsWordTimings: true,
    }
  }

  async getVoices(): Promise<Voice[]> {
    if (this.cachedVoices) {
      return this.cachedVoices
    }

    try {
      const allVoices = await listVoices()
      const availableVoiceIds = new Set(allVoices.map(v => v.ShortName))

      // Filter to preferred voices that are available
      this.cachedVoices = PREFERRED_VOICES
        .filter(v => availableVoiceIds.has(v.id))
        .map(v => ({
          id: v.id,
          name: v.name,
          category: 'neural',
          provider: 'edge',
        }))

      console.log(`[EdgeTTS Client] Found ${this.cachedVoices.length} preferred voices`)
      return this.cachedVoices
    } catch (error) {
      console.error('[EdgeTTS Client] Failed to load voices:', error)
      // Return static list as fallback
      return PREFERRED_VOICES.map(v => ({
        id: v.id,
        name: v.name,
        category: 'neural',
        provider: 'edge',
      }))
    }
  }

  // Clean text for TTS
  private prepareTextForSpeech(text: string): string {
    let cleaned = text

    // Remove markdown images
    cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    cleaned = cleaned.replace(/!\[[^\]]*\]\[[^\]]*\]/g, '')
    cleaned = cleaned.replace(/!\[[^\]]*\]/g, '')
    cleaned = cleaned.replace(/<img[^>]*>/gi, '')

    // Convert markdown links to text
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    cleaned = cleaned.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')

    // Remove URLs
    cleaned = cleaned.replace(/https?:\/\/[^\s\])>"']+/gi, '')
    cleaned = cleaned.replace(/www\.[^\s\])>"']+/gi, '')

    // Remove markdown formatting
    cleaned = cleaned.replace(/#{1,6}\s*/g, '')
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1')
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1')
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1')
    cleaned = cleaned.replace(/_([^_]+)_/g, '$1')
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1')
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '')
    cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1')
    cleaned = cleaned.replace(/<[^>]+>/gi, '')
    cleaned = cleaned.replace(/\bhttps?:\/\/\S+/gi, '')

    // Clean up whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
    cleaned = cleaned.replace(/  +/g, ' ')
    cleaned = cleaned.trim()

    return cleaned
  }

  // Split text into chunks at sentence boundaries
  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = []
    let remaining = text

    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHUNK_CHARS) {
        chunks.push(remaining)
        break
      }

      let splitPoint = MAX_CHUNK_CHARS
      const searchText = remaining.substring(0, MAX_CHUNK_CHARS)

      // Find sentence boundary
      const sentenceEnders = ['. ', '! ', '? ', '.\n', '!\n', '?\n']
      let bestSplit = -1

      for (const ender of sentenceEnders) {
        const lastIndex = searchText.lastIndexOf(ender)
        if (lastIndex > bestSplit && lastIndex > MAX_CHUNK_CHARS * 0.5) {
          bestSplit = lastIndex + ender.length - 1
        }
      }

      if (bestSplit > 0) {
        splitPoint = bestSplit + 1
      } else {
        const lastNewline = searchText.lastIndexOf('\n')
        if (lastNewline > MAX_CHUNK_CHARS * 0.5) {
          splitPoint = lastNewline + 1
        } else {
          const lastSpace = searchText.lastIndexOf(' ')
          if (lastSpace > MAX_CHUNK_CHARS * 0.5) {
            splitPoint = lastSpace + 1
          }
        }
      }

      chunks.push(remaining.substring(0, splitPoint).trim())
      remaining = remaining.substring(splitPoint).trim()
    }

    return chunks.filter(chunk => chunk.length > 0)
  }

  getChunkCount(text: string): number {
    const cleanedText = this.prepareTextForSpeech(text)
    const chunks = this.splitIntoChunks(cleanedText)
    return chunks.length
  }

  // Generate estimated word timings based on text and audio duration
  private generateEstimatedWordTimings(text: string, audioDurationMs: number): WordTiming[] {
    const words = text.split(/\s+/).filter(w => w.length > 0)
    if (words.length === 0) return []

    const avgWordDurationMs = audioDurationMs / words.length

    return words.map((word, index) => ({
      word: word.replace(/[.,!?;:'"]/g, ''),
      start: Math.round(index * avgWordDurationMs),
      end: Math.round((index + 1) * avgWordDurationMs - 10),
    }))
  }

  async generateChunk(
    text: string,
    voiceId: string,
    chunkIndex: number
  ): Promise<TTSChunkResult> {
    const cleanedText = this.prepareTextForSpeech(text)
    const chunks = this.splitIntoChunks(cleanedText)
    const totalChunks = chunks.length

    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      throw new Error(`Invalid chunk index ${chunkIndex}. Total chunks: ${totalChunks}`)
    }

    const chunkText = chunks[chunkIndex]
    console.log(`[EdgeTTS Client] Generating chunk ${chunkIndex + 1}/${totalChunks} (${chunkText.length} chars)`)

    try {
      // Create TTS instance and synthesize
      const tts = new EdgeTTS(chunkText, voiceId)
      const result = await tts.synthesize()

      // Convert Blob to base64
      const arrayBuffer = await result.audio.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      // Convert to base64
      let binary = ''
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i])
      }
      const base64Audio = btoa(binary)

      // Estimate duration from audio size (MP3 ~128kbps = 16 bytes per ms)
      const estimatedDurationMs = Math.round(arrayBuffer.byteLength / 16)

      // Generate word timings from subtitle data if available, otherwise estimate
      let wordTimings: WordTiming[] = []
      if (result.subtitle && result.subtitle.length > 0) {
        // Use actual word boundaries from the service
        wordTimings = result.subtitle.map((sub: any) => ({
          word: sub.text || sub.content || '',
          start: Math.round((sub.offset || sub.start || 0) / 10000), // Convert from 100ns to ms
          end: Math.round(((sub.offset || sub.start || 0) + (sub.duration || 0)) / 10000),
        }))
      } else {
        // Fallback to estimated timings
        wordTimings = this.generateEstimatedWordTimings(chunkText, estimatedDurationMs)
      }

      console.log(`[EdgeTTS Client] Chunk ${chunkIndex + 1} generated: ${arrayBuffer.byteLength} bytes, ${wordTimings.length} words`)

      return {
        audioData: base64Audio,
        contentType: 'audio/mpeg',
        wordTimings,
        chunkText,
        chunkIndex,
        totalChunks,
      }
    } catch (error: any) {
      console.error(`[EdgeTTS Client] Error generating chunk ${chunkIndex}:`, error)
      throw new Error(`Edge TTS failed: ${error.message}`)
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Try to list voices to check if the service is accessible
      await listVoices()
      return true
    } catch {
      return false
    }
  }
}
