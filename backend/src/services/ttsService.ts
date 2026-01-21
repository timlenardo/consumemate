import { ElevenLabsClient } from 'elevenlabs'
import { env } from '@config/env'

// TTS Provider interface for easy swapping
export interface TTSProvider {
  generateSpeech(text: string, voiceId: string): Promise<Buffer>
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

  async generateSpeech(text: string, voiceId: string): Promise<Buffer> {
    const audio = await this.client.generate({
      voice: voiceId,
      text,
      model_id: 'eleven_multilingual_v2',
    })

    // Convert stream to buffer
    const chunks: Buffer[] = []
    for await (const chunk of audio) {
      chunks.push(Buffer.from(chunk))
    }

    return Buffer.concat(chunks)
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

    return response.voices
      .filter(v => popularVoiceIds.includes(v.voice_id))
      .map(v => ({
        id: v.voice_id,
        name: v.name || 'Unknown',
        previewUrl: v.preview_url,
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
export async function generateSpeech(text: string, voiceId: string): Promise<Buffer> {
  return getTTSProvider().generateSpeech(text, voiceId)
}

export async function getAvailableVoices(): Promise<Voice[]> {
  return getTTSProvider().getVoices()
}
