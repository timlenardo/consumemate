// TTS Provider types and interfaces

export interface WordTiming {
  word: string
  start: number  // start time in milliseconds
  end: number    // end time in milliseconds
}

export interface Voice {
  id: string
  name: string
  previewUrl?: string
  category?: string
  provider: 'elevenlabs' | 'avspeech' | 'edge' | string
}

export interface TTSChunkResult {
  audioData: string  // base64 encoded audio
  contentType: string  // e.g., 'audio/mpeg'
  wordTimings: WordTiming[]
  chunkText: string
  chunkIndex: number
  totalChunks: number
}

export interface TTSProviderInfo {
  id: string
  name: string
  description: string
  requiresNetwork: boolean
  supportsWordTimings: boolean
}

// Base interface for all TTS providers
export interface TTSProvider {
  // Provider info
  getProviderInfo(): TTSProviderInfo

  // Get available voices for this provider
  getVoices(): Promise<Voice[]>

  // Get total number of chunks for text
  getChunkCount(text: string): number

  // Generate audio for a specific chunk
  generateChunk(
    text: string,
    voiceId: string,
    chunkIndex: number
  ): Promise<TTSChunkResult>

  // Check if provider is available (e.g., has API quota, device supports it)
  isAvailable(): Promise<boolean>
}

// Provider selection preference
export type TTSProviderPreference = 'elevenlabs' | 'avspeech' | 'auto'
