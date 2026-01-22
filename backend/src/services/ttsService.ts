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

  constructor(apiKey: string) {
    this.client = new ElevenLabsClient({ apiKey })
  }

  async generateSpeech(text: string, voiceId: string): Promise<SpeechResult> {
    // ElevenLabs has a ~5000 character limit per request
    // Truncate long text for now (TODO: implement chunking for full articles)
    const MAX_CHARS = 4500
    let processedText = text
    if (text.length > MAX_CHARS) {
      // Truncate at sentence boundary
      processedText = text.substring(0, MAX_CHARS)
      const lastPeriod = processedText.lastIndexOf('.')
      if (lastPeriod > MAX_CHARS * 0.8) {
        processedText = processedText.substring(0, lastPeriod + 1)
      }
      processedText += ' ... Article truncated for audio preview.'
    }

    // Use regular convert for speed (convertWithTimestamps is too slow for Heroku's 30s timeout)
    // TODO: Implement async audio generation to enable word timestamps
    const response = await this.client.textToSpeech.convert(voiceId, {
      text: processedText,
      modelId: 'eleven_multilingual_v2',
    })

    // Convert stream to buffer
    const chunks: Buffer[] = []
    const reader = response.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(Buffer.from(value))
    }
    const audioBuffer = Buffer.concat(chunks)

    // No word timings with regular convert (would need convertWithTimestamps)
    const wordTimings: WordTiming[] = []

    return {
      audio: audioBuffer,
      wordTimings,
      processedText,
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
