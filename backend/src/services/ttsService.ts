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

  constructor(apiKey: string) {
    this.client = new ElevenLabsClient({ apiKey })
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

  // Convert a single chunk to audio
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
    const textChunks = this.splitIntoChunks(text)
    console.log(`Processing ${textChunks.length} chunks for TTS (total ${text.length} chars)`)

    // Process all chunks and collect audio buffers
    const audioBuffers: Buffer[] = []

    for (let i = 0; i < textChunks.length; i++) {
      console.log(`Processing chunk ${i + 1}/${textChunks.length} (${textChunks[i].length} chars)`)
      const audioBuffer = await this.convertChunkToAudio(textChunks[i], voiceId)
      audioBuffers.push(audioBuffer)
    }

    // Concatenate all audio buffers
    const combinedAudio = Buffer.concat(audioBuffers)
    console.log(`Combined audio size: ${combinedAudio.length} bytes`)

    // No word timings with regular convert (would need convertWithTimestamps)
    const wordTimings: WordTiming[] = []

    return {
      audio: combinedAudio,
      wordTimings,
      processedText: text,  // Return the full text since we process it all now
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
