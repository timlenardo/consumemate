// TTS Service - manages multiple TTS providers and switching between them

import { ElevenLabsProvider } from './ElevenLabsProvider'
import { AVSpeechProvider } from './AVSpeechProvider'
import { EdgeTTSProvider } from './EdgeTTSProvider'
import type {
  TTSProvider,
  TTSProviderInfo,
  TTSProviderPreference,
  Voice,
  TTSChunkResult,
} from './types'

export type TTSProviderType = 'elevenlabs' | 'avspeech' | 'edge'

class TTSService {
  private providers: Map<TTSProviderType, TTSProvider> = new Map()
  private currentProvider: TTSProviderType = 'elevenlabs'
  private fallbackEnabled = true

  constructor() {
    // Initialize providers
    this.providers.set('elevenlabs', new ElevenLabsProvider())
    this.providers.set('avspeech', new AVSpeechProvider())
    this.providers.set('edge', new EdgeTTSProvider())
  }

  // Get list of all available providers
  getProviders(): TTSProviderInfo[] {
    return Array.from(this.providers.values()).map(p => p.getProviderInfo())
  }

  // Get current provider type
  getCurrentProviderType(): TTSProviderType {
    return this.currentProvider
  }

  // Get current provider instance
  getCurrentProvider(): TTSProvider {
    return this.providers.get(this.currentProvider)!
  }

  // Get a specific provider
  getProvider(type: TTSProviderType): TTSProvider | undefined {
    return this.providers.get(type)
  }

  // Get the ElevenLabs provider (typed)
  getElevenLabsProvider(): ElevenLabsProvider {
    return this.providers.get('elevenlabs') as ElevenLabsProvider
  }

  // Get the AVSpeech provider (typed)
  getAVSpeechProvider(): AVSpeechProvider {
    return this.providers.get('avspeech') as AVSpeechProvider
  }

  // Get the Edge TTS provider (typed)
  getEdgeTTSProvider(): EdgeTTSProvider {
    return this.providers.get('edge') as EdgeTTSProvider
  }

  // Set the active provider
  setProvider(type: TTSProviderType): void {
    if (!this.providers.has(type)) {
      throw new Error(`Unknown provider: ${type}`)
    }
    this.currentProvider = type
    console.log(`[TTSService] Switched to provider: ${type}`)
  }

  // Enable/disable fallback to on-device TTS when cloud fails
  setFallbackEnabled(enabled: boolean): void {
    this.fallbackEnabled = enabled
  }

  // Check if fallback is enabled
  isFallbackEnabled(): boolean {
    return this.fallbackEnabled
  }

  // Get all voices from all providers
  async getAllVoices(): Promise<Voice[]> {
    const allVoices: Voice[] = []
    const providerTypes: TTSProviderType[] = ['elevenlabs', 'avspeech', 'edge']

    for (const type of providerTypes) {
      const provider = this.providers.get(type)
      if (provider) {
        try {
          const voices = await provider.getVoices()
          allVoices.push(...voices)
        } catch (error) {
          console.error(`[TTSService] Failed to get voices from ${type}:`, error)
        }
      }
    }

    return allVoices
  }

  // Get voices from current provider
  async getVoices(): Promise<Voice[]> {
    return this.getCurrentProvider().getVoices()
  }

  // Get voices from a specific provider
  async getVoicesFromProvider(type: TTSProviderType): Promise<Voice[]> {
    const provider = this.providers.get(type)
    if (!provider) {
      throw new Error(`Unknown provider: ${type}`)
    }
    return provider.getVoices()
  }

  // Check if a provider is available
  async isProviderAvailable(type: TTSProviderType): Promise<boolean> {
    const provider = this.providers.get(type)
    if (!provider) return false
    return provider.isAvailable()
  }

  // Determine which provider to use based on availability and preference
  async selectBestProvider(preference: TTSProviderPreference = 'auto'): Promise<TTSProviderType> {
    if (preference === 'elevenlabs') {
      const available = await this.isProviderAvailable('elevenlabs')
      if (available) return 'elevenlabs'
      if (this.fallbackEnabled) {
        console.log('[TTSService] ElevenLabs not available, falling back to on-device TTS')
        return 'avspeech'
      }
      throw new Error('ElevenLabs is not available and fallback is disabled')
    }

    if (preference === 'avspeech') {
      return 'avspeech'
    }

    // Auto mode: try ElevenLabs first, fall back to on-device
    const elevenLabsAvailable = await this.isProviderAvailable('elevenlabs')
    if (elevenLabsAvailable) {
      return 'elevenlabs'
    }

    console.log('[TTSService] Auto-selecting on-device TTS (ElevenLabs not available)')
    return 'avspeech'
  }

  // Generate audio chunk using the appropriate provider
  // For ElevenLabs, use generateChunkForArticle on the typed provider
  // For AVSpeech, this prepares metadata but actual playback is separate
  async generateChunk(
    text: string,
    voiceId: string,
    chunkIndex: number,
    providerType?: TTSProviderType
  ): Promise<TTSChunkResult> {
    const type = providerType || this.currentProvider
    const provider = this.providers.get(type)

    if (!provider) {
      throw new Error(`Unknown provider: ${type}`)
    }

    return provider.generateChunk(text, voiceId, chunkIndex)
  }

  // Get chunk count for text
  getChunkCount(text: string, providerType?: TTSProviderType): number {
    const type = providerType || this.currentProvider
    const provider = this.providers.get(type)

    if (!provider) {
      throw new Error(`Unknown provider: ${type}`)
    }

    return provider.getChunkCount(text)
  }
}

// Singleton instance
export const ttsService = new TTSService()

// Re-export types
export type { TTSProvider, TTSProviderInfo, Voice, TTSChunkResult, WordTiming } from './types'
