// ElevenLabs TTS Provider - uses backend API

import { api } from '../api'
import type { TTSProvider, TTSProviderInfo, Voice, TTSChunkResult } from './types'

export class ElevenLabsProvider implements TTSProvider {
  private lastError: string | null = null

  getProviderInfo(): TTSProviderInfo {
    return {
      id: 'elevenlabs',
      name: 'ElevenLabs',
      description: 'High-quality AI voices via cloud API',
      requiresNetwork: true,
      supportsWordTimings: true,
    }
  }

  async getVoices(): Promise<Voice[]> {
    try {
      const { voices } = await api.getVoices()
      return voices.map(v => ({
        ...v,
        provider: 'elevenlabs' as const,
      }))
    } catch (error) {
      console.error('[ElevenLabsProvider] Failed to get voices:', error)
      return []
    }
  }

  getChunkCount(text: string): number {
    // Match backend chunk size (1000 chars)
    const MAX_CHUNK_CHARS = 1000
    const cleanedText = this.cleanTextForSpeech(text)
    return Math.ceil(cleanedText.length / MAX_CHUNK_CHARS) || 1
  }

  async generateChunk(
    text: string,
    voiceId: string,
    chunkIndex: number
  ): Promise<TTSChunkResult> {
    // This calls the backend API which handles chunking
    const result = await api.generateAudioChunk(
      0, // articleId - will be passed by caller
      voiceId,
      chunkIndex
    )

    return {
      audioData: result.audioData,
      contentType: result.contentType,
      wordTimings: result.wordTimings || [],
      chunkText: result.chunkText || '',
      chunkIndex: result.chunkIndex,
      totalChunks: result.totalChunks,
    }
  }

  // Generate chunk for a specific article (the actual API call)
  async generateChunkForArticle(
    articleId: number,
    voiceId: string,
    chunkIndex: number
  ): Promise<TTSChunkResult> {
    try {
      const result = await api.generateAudioChunk(articleId, voiceId, chunkIndex)
      this.lastError = null

      return {
        audioData: result.audioData,
        contentType: result.contentType,
        wordTimings: result.wordTimings || [],
        chunkText: result.chunkText || '',
        chunkIndex: result.chunkIndex,
        totalChunks: result.totalChunks,
      }
    } catch (error: any) {
      // Check for quota exceeded error
      if (error.message?.includes('quota') || error.message?.includes('401')) {
        this.lastError = 'quota_exceeded'
      } else {
        this.lastError = error.message || 'Unknown error'
      }
      throw error
    }
  }

  async isAvailable(): Promise<boolean> {
    // Check if we recently hit quota limits
    if (this.lastError === 'quota_exceeded') {
      return false
    }

    // Could add a health check here, but for now assume available
    return true
  }

  getLastError(): string | null {
    return this.lastError
  }

  clearError(): void {
    this.lastError = null
  }

  private cleanTextForSpeech(text: string): string {
    // Basic text cleaning - the backend does more thorough cleaning
    return text
      .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links to text
      .replace(/[#*`_~]/g, '') // Markdown formatting
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
}
