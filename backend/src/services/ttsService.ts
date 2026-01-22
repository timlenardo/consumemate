import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import { env } from '@config/env'

// Word timing for text-audio sync
export interface WordTiming {
  word: string
  start: number  // start time in milliseconds
  end: number    // end time in milliseconds
}

export interface SpeechResult {
  audio: Buffer
  wordTimings: WordTiming[]
  processedText: string  // The actual text that was converted to speech
}

// TTS Provider interface for easy swapping
export interface TTSProvider {
  generateSpeech(text: string, voiceId: string): Promise<SpeechResult>
  getVoices(): Promise<Voice[]>
}

export interface Voice {
  id: string
  name: string
  previewUrl?: string
  category?: string
}

// ElevenLabs implementation
class ElevenLabsTTSProvider implements TTSProvider {
  private client: ElevenLabsClient
  private readonly MAX_CHUNK_CHARS = 4500
  // TODO: Set to false for production - limits to ~100 words to conserve API quota
  private readonly TEST_MODE = true
  private readonly TEST_MODE_WORD_LIMIT = 100

  constructor(apiKey: string) {
    this.client = new ElevenLabsClient({ apiKey })
  }

  // Truncate text to word limit for testing (conserves API quota)
  private truncateForTesting(text: string): string {
    if (!this.TEST_MODE) return text

    const words = text.split(/\s+/)
    if (words.length <= this.TEST_MODE_WORD_LIMIT) return text

    const truncated = words.slice(0, this.TEST_MODE_WORD_LIMIT).join(' ')
    console.log(`[TEST MODE] Truncated from ${words.length} to ${this.TEST_MODE_WORD_LIMIT} words`)
    return truncated + '... (truncated for testing)'
  }

  // Clean text for TTS - remove URLs and convert markdown links to plain text
  private prepareTextForSpeech(text: string): string {
    let cleaned = text

    // Convert markdown links [text](url) to just "text"
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

    // Remove standalone URLs (http, https, www)
    cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '')
    cleaned = cleaned.replace(/www\.[^\s]+/g, '')

    // Remove markdown image syntax ![alt](url)
    cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, '')

    // Remove markdown formatting that sounds awkward
    cleaned = cleaned.replace(/#{1,6}\s*/g, '')  // Headers
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1')  // Bold
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1')  // Italic
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1')  // Bold underscore
    cleaned = cleaned.replace(/_([^_]+)_/g, '$1')  // Italic underscore
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1')  // Inline code
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '')  // Code blocks
    cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1')  // Strikethrough

    // Remove HTML tags if any slipped through
    cleaned = cleaned.replace(/<[^>]+>/g, '')

    // Clean up extra whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n')  // Multiple newlines to double
    cleaned = cleaned.replace(/  +/g, ' ')  // Multiple spaces to single
    cleaned = cleaned.trim()

    return cleaned
  }

  // Split text into chunks at sentence boundaries
  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = []
    let remaining = text

    while (remaining.length > 0) {
      if (remaining.length <= this.MAX_CHUNK_CHARS) {
        chunks.push(remaining)
        break
      }

      // Find the best split point (sentence boundary) within the limit
      let splitPoint = this.MAX_CHUNK_CHARS
      const searchText = remaining.substring(0, this.MAX_CHUNK_CHARS)

      // Look for sentence-ending punctuation followed by space
      const sentenceEnders = ['. ', '! ', '? ', '.\n', '!\n', '?\n']
      let bestSplit = -1

      for (const ender of sentenceEnders) {
        const lastIndex = searchText.lastIndexOf(ender)
        if (lastIndex > bestSplit && lastIndex > this.MAX_CHUNK_CHARS * 0.5) {
          bestSplit = lastIndex + ender.length - 1  // Include the punctuation
        }
      }

      if (bestSplit > 0) {
        splitPoint = bestSplit + 1
      } else {
        // No sentence boundary found, try to split at paragraph or newline
        const lastNewline = searchText.lastIndexOf('\n')
        if (lastNewline > this.MAX_CHUNK_CHARS * 0.5) {
          splitPoint = lastNewline + 1
        } else {
          // Last resort: split at last space
          const lastSpace = searchText.lastIndexOf(' ')
          if (lastSpace > this.MAX_CHUNK_CHARS * 0.5) {
            splitPoint = lastSpace + 1
          }
        }
      }

      chunks.push(remaining.substring(0, splitPoint).trim())
      remaining = remaining.substring(splitPoint).trim()
    }

    return chunks.filter(chunk => chunk.length > 0)
  }

  // Convert text to audio with word timestamps
  private async convertWithTimestamps(text: string, voiceId: string): Promise<{ audio: Buffer; wordTimings: WordTiming[] }> {
    const response = await this.client.textToSpeech.convertWithTimestamps(voiceId, {
      text,
      modelId: 'eleven_multilingual_v2',
    })

    const audioChunks: Buffer[] = []
    const wordTimings: WordTiming[] = []

    // Process the response - it returns audio chunks and alignment data
    if (response.audioBase64) {
      audioChunks.push(Buffer.from(response.audioBase64, 'base64'))
    }

    // Extract word timings from alignment data
    if (response.alignment) {
      const { characters, characterStartTimesSeconds, characterEndTimesSeconds } = response.alignment

      // Build words from characters
      let currentWord = ''
      let wordStart = 0

      for (let i = 0; i < characters.length; i++) {
        const char = characters[i]
        const startTime = characterStartTimesSeconds[i]
        const endTime = characterEndTimesSeconds[i]

        if (char === ' ' || char === '\n') {
          if (currentWord.trim()) {
            wordTimings.push({
              word: currentWord.trim(),
              start: Math.round(wordStart * 1000),
              end: Math.round(characterEndTimesSeconds[i - 1] * 1000),
            })
          }
          currentWord = ''
          wordStart = endTime
        } else {
          if (currentWord === '') {
            wordStart = startTime
          }
          currentWord += char
        }
      }

      // Don't forget the last word
      if (currentWord.trim()) {
        wordTimings.push({
          word: currentWord.trim(),
          start: Math.round(wordStart * 1000),
          end: Math.round(characterEndTimesSeconds[characters.length - 1] * 1000),
        })
      }
    }

    return {
      audio: Buffer.concat(audioChunks),
      wordTimings,
    }
  }

  // Fallback: Convert without timestamps (faster but no word sync)
  private async convertChunkToAudio(text: string, voiceId: string): Promise<Buffer> {
    const response = await this.client.textToSpeech.convert(voiceId, {
      text,
      modelId: 'eleven_multilingual_v2',
    })

    const chunks: Buffer[] = []
    const reader = response.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks)
  }

  async generateSpeech(text: string, voiceId: string): Promise<SpeechResult> {
    // Clean text for speech - remove URLs, convert markdown links to text
    let cleanedText = this.prepareTextForSpeech(text)
    console.log(`Cleaned text: ${text.length} -> ${cleanedText.length} chars`)

    // Truncate for testing to conserve API quota
    cleanedText = this.truncateForTesting(cleanedText)

    // In test mode with short text, use convertWithTimestamps for word sync
    // For longer texts, fall back to regular convert (faster, no word sync)
    const useTimestamps = this.TEST_MODE && cleanedText.split(/\s+/).length <= this.TEST_MODE_WORD_LIMIT + 10

    if (useTimestamps) {
      console.log('Using convertWithTimestamps for word sync')
      try {
        const result = await this.convertWithTimestamps(cleanedText, voiceId)
        console.log(`Generated audio with ${result.wordTimings.length} word timings`)
        return {
          audio: result.audio,
          wordTimings: result.wordTimings,
          processedText: cleanedText,
        }
      } catch (error) {
        console.error('convertWithTimestamps failed, falling back to regular convert:', error)
        // Fall through to regular convert
      }
    }

    // Regular convert without timestamps
    const textChunks = this.splitIntoChunks(cleanedText)
    console.log(`Processing ${textChunks.length} chunks for TTS in parallel (total ${cleanedText.length} chars)`)

    // Process all chunks in parallel for speed (Heroku has 30s timeout)
    const chunkPromises = textChunks.map((chunk, i) => {
      console.log(`Starting chunk ${i + 1}/${textChunks.length} (${chunk.length} chars)`)
      return this.convertChunkToAudio(chunk, voiceId).then(buffer => {
        console.log(`Completed chunk ${i + 1}/${textChunks.length}`)
        return { index: i, buffer }
      })
    })

    const results = await Promise.all(chunkPromises)

    // Sort by index to maintain order, then extract buffers
    results.sort((a, b) => a.index - b.index)
    const audioBuffers = results.map(r => r.buffer)

    // Concatenate all audio buffers
    const combinedAudio = Buffer.concat(audioBuffers)
    console.log(`Combined audio size: ${combinedAudio.length} bytes`)

    return {
      audio: combinedAudio,
      wordTimings: [],
      processedText: cleanedText,
    }
  }

  async getVoices(): Promise<Voice[]> {
    const response = await this.client.voices.getAll()

    // Filter to popular/recommended voices
    const popularVoiceIds = [
      'EXAVITQu4vr4xnSDxMaL', // Sarah
      'JBFqnCBsd6RMkjVDRZzb', // George
      'IKne3meq5aSn9XLyUdCD', // Charlie
      'XB0fDUnXU5powFXDhCwa', // Charlotte
      'pFZP5JQG7iQjIQuC4Bku', // Lily
      'TX3LPaxmHKxFdv7VOQHJ', // Liam
      'bIHbv24MWmeRgasZH58o', // Will
      'cgSgspJ2msm6clMCkdW9', // Jessica
    ]

    return (response.voices || [])
      .filter((v: any) => popularVoiceIds.includes(v.voiceId))
      .map((v: any) => ({
        id: v.voiceId,
        name: v.name || 'Unknown',
        previewUrl: v.previewUrl,
        category: v.category,
      }))
  }
}

// Factory function - easily swap providers here
let ttsProvider: TTSProvider | null = null

export function getTTSProvider(): TTSProvider {
  if (!ttsProvider) {
    if (!env.elevenLabsApiKey) {
      throw new Error('ElevenLabs API key not configured')
    }
    ttsProvider = new ElevenLabsTTSProvider(env.elevenLabsApiKey)
  }
  return ttsProvider
}

// Convenience exports
export async function generateSpeech(text: string, voiceId: string): Promise<SpeechResult> {
  return getTTSProvider().generateSpeech(text, voiceId)
}

export async function getAvailableVoices(): Promise<Voice[]> {
  return getTTSProvider().getVoices()
}
