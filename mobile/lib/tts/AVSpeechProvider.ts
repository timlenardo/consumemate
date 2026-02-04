// AVSpeechSynthesizer Provider - uses on-device iOS TTS via expo-speech

import * as Speech from 'expo-speech'
import type { TTSProvider, TTSProviderInfo, Voice, TTSChunkResult, WordTiming } from './types'

// iOS voice identifiers for high-quality voices
const PREFERRED_VOICES = [
  // Premium/Enhanced voices (if available)
  { id: 'com.apple.voice.premium.en-US.Ava', name: 'Ava (Premium)', quality: 'premium' },
  { id: 'com.apple.voice.premium.en-US.Zoe', name: 'Zoe (Premium)', quality: 'premium' },
  { id: 'com.apple.voice.premium.en-GB.Malcolm', name: 'Malcolm (Premium)', quality: 'premium' },
  { id: 'com.apple.voice.premium.en-GB.Daniel', name: 'Daniel (Premium)', quality: 'premium' },
  // Enhanced voices
  { id: 'com.apple.voice.enhanced.en-US.Evan', name: 'Evan (Enhanced)', quality: 'enhanced' },
  { id: 'com.apple.voice.enhanced.en-US.Samantha', name: 'Samantha (Enhanced)', quality: 'enhanced' },
  { id: 'com.apple.voice.enhanced.en-GB.Daniel', name: 'Daniel UK (Enhanced)', quality: 'enhanced' },
  // Standard voices
  { id: 'com.apple.ttsbundle.siri_female_en-US_compact', name: 'Siri Female', quality: 'standard' },
  { id: 'com.apple.ttsbundle.siri_male_en-US_compact', name: 'Siri Male', quality: 'standard' },
]

export class AVSpeechProvider implements TTSProvider {
  private availableVoices: Voice[] = []
  private voicesLoaded = false
  private readonly MAX_CHUNK_CHARS = 500 // Smaller chunks for on-device TTS

  getProviderInfo(): TTSProviderInfo {
    return {
      id: 'avspeech',
      name: 'On-Device (iOS)',
      description: 'Built-in iOS text-to-speech - works offline',
      requiresNetwork: false,
      supportsWordTimings: false, // expo-speech doesn't provide word timings
    }
  }

  async getVoices(): Promise<Voice[]> {
    if (this.voicesLoaded) {
      return this.availableVoices
    }

    try {
      const systemVoices = await Speech.getAvailableVoicesAsync()

      // Filter to English voices and map to our format
      const englishVoices = systemVoices
        .filter(v => v.language.startsWith('en'))
        .map(v => {
          // Check if this is a preferred voice
          const preferred = PREFERRED_VOICES.find(pv =>
            v.identifier.includes(pv.id) || v.name?.includes(pv.name.split(' ')[0])
          )

          return {
            id: v.identifier,
            name: v.name || v.identifier,
            provider: 'avspeech' as const,
            category: preferred?.quality || (v.quality === 'Enhanced' ? 'enhanced' : 'standard'),
          }
        })
        // Sort by quality
        .sort((a, b) => {
          const qualityOrder = { premium: 0, enhanced: 1, standard: 2 }
          return (qualityOrder[a.category as keyof typeof qualityOrder] || 3) -
                 (qualityOrder[b.category as keyof typeof qualityOrder] || 3)
        })

      this.availableVoices = englishVoices
      this.voicesLoaded = true

      console.log(`[AVSpeechProvider] Found ${englishVoices.length} English voices`)
      return englishVoices
    } catch (error) {
      console.error('[AVSpeechProvider] Failed to get voices:', error)
      // Return a default voice
      return [{
        id: 'default',
        name: 'System Default',
        provider: 'avspeech',
        category: 'standard',
      }]
    }
  }

  getChunkCount(text: string): number {
    const cleanedText = this.cleanTextForSpeech(text)
    const chunks = this.splitIntoChunks(cleanedText)
    return chunks.length
  }

  async generateChunk(
    text: string,
    voiceId: string,
    chunkIndex: number
  ): Promise<TTSChunkResult> {
    const cleanedText = this.cleanTextForSpeech(text)
    const chunks = this.splitIntoChunks(cleanedText)
    const totalChunks = chunks.length

    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      throw new Error(`Invalid chunk index ${chunkIndex}. Total chunks: ${totalChunks}`)
    }

    const chunkText = chunks[chunkIndex]

    // For AVSpeechSynthesizer, we don't generate audio data - we speak directly
    // This method returns metadata, and the actual playback happens via speakChunk
    return {
      audioData: '', // No audio data - playback is direct
      contentType: 'avspeech/direct',
      wordTimings: this.generateEstimatedWordTimings(chunkText),
      chunkText,
      chunkIndex,
      totalChunks,
    }
  }

  // Speak a chunk directly using AVSpeechSynthesizer
  async speakChunk(
    text: string,
    voiceId: string,
    chunkIndex: number,
    options: {
      rate?: number  // 0.5 to 2.0
      pitch?: number // 0.5 to 2.0
      onDone?: () => void
      onStopped?: () => void
      onError?: (error: any) => void
    } = {}
  ): Promise<void> {
    const cleanedText = this.cleanTextForSpeech(text)
    const chunks = this.splitIntoChunks(cleanedText)

    if (chunkIndex < 0 || chunkIndex >= chunks.length) {
      throw new Error(`Invalid chunk index ${chunkIndex}`)
    }

    const chunkText = chunks[chunkIndex]

    return new Promise((resolve, reject) => {
      Speech.speak(chunkText, {
        voice: voiceId === 'default' ? undefined : voiceId,
        rate: options.rate || 1.0,
        pitch: options.pitch || 1.0,
        onDone: () => {
          options.onDone?.()
          resolve()
        },
        onStopped: () => {
          options.onStopped?.()
          resolve()
        },
        onError: (error) => {
          options.onError?.(error)
          reject(error)
        },
      })
    })
  }

  // Speak text directly (without chunking)
  async speak(
    text: string,
    voiceId: string,
    options: {
      rate?: number
      pitch?: number
      onDone?: () => void
      onStopped?: () => void
    } = {}
  ): Promise<void> {
    const cleanedText = this.cleanTextForSpeech(text)

    return new Promise((resolve) => {
      Speech.speak(cleanedText, {
        voice: voiceId === 'default' ? undefined : voiceId,
        rate: options.rate || 1.0,
        pitch: options.pitch || 1.0,
        onDone: () => {
          options.onDone?.()
          resolve()
        },
        onStopped: () => {
          options.onStopped?.()
          resolve()
        },
      })
    })
  }

  // Stop any current speech
  stop(): void {
    Speech.stop()
  }

  // Pause current speech
  pause(): void {
    Speech.pause()
  }

  // Resume paused speech
  resume(): void {
    Speech.resume()
  }

  // Check if currently speaking
  async isSpeaking(): Promise<boolean> {
    return Speech.isSpeakingAsync()
  }

  async isAvailable(): Promise<boolean> {
    // AVSpeechSynthesizer is always available on iOS
    return true
  }

  private cleanTextForSpeech(text: string): string {
    return text
      // Remove images
      .replace(/!\[.*?\]\(.*?\)/g, '')
      // Convert links to text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove URLs
      .replace(/https?:\/\/[^\s]+/g, '')
      // Remove markdown formatting
      .replace(/#{1,6}\s*/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/```[\s\S]*?```/g, '')
      // Clean up whitespace
      .replace(/\n{3,}/g, '\n\n')
      .replace(/  +/g, ' ')
      .trim()
  }

  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = []
    let remaining = text

    while (remaining.length > 0) {
      if (remaining.length <= this.MAX_CHUNK_CHARS) {
        chunks.push(remaining)
        break
      }

      // Find sentence boundary
      let splitPoint = this.MAX_CHUNK_CHARS
      const searchText = remaining.substring(0, this.MAX_CHUNK_CHARS)
      const sentenceEnders = ['. ', '! ', '? ', '.\n', '!\n', '?\n']
      let bestSplit = -1

      for (const ender of sentenceEnders) {
        const lastIndex = searchText.lastIndexOf(ender)
        if (lastIndex > bestSplit && lastIndex > this.MAX_CHUNK_CHARS * 0.3) {
          bestSplit = lastIndex + ender.length - 1
        }
      }

      if (bestSplit > 0) {
        splitPoint = bestSplit + 1
      } else {
        // Fall back to paragraph or space
        const lastNewline = searchText.lastIndexOf('\n')
        if (lastNewline > this.MAX_CHUNK_CHARS * 0.3) {
          splitPoint = lastNewline + 1
        } else {
          const lastSpace = searchText.lastIndexOf(' ')
          if (lastSpace > this.MAX_CHUNK_CHARS * 0.3) {
            splitPoint = lastSpace + 1
          }
        }
      }

      chunks.push(remaining.substring(0, splitPoint).trim())
      remaining = remaining.substring(splitPoint).trim()
    }

    return chunks.filter(chunk => chunk.length > 0)
  }

  // Generate estimated word timings based on average speech rate
  // AVSpeechSynthesizer doesn't provide actual timings, so we estimate
  private generateEstimatedWordTimings(text: string): WordTiming[] {
    const words = text.split(/\s+/).filter(w => w.length > 0)
    const avgWordDurationMs = 300 // ~200 words per minute = ~300ms per word

    return words.map((word, index) => ({
      word: word.replace(/[.,!?;:'"]/g, ''), // Remove punctuation
      start: index * avgWordDurationMs,
      end: (index + 1) * avgWordDurationMs - 50,
    }))
  }
}
