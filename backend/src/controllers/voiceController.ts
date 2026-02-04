import { z } from 'zod'
import { endpoint } from '@middleware/endpoint'
import * as ttsService from '@services/ttsService'

// Get voices from a specific provider (defaults to ElevenLabs for backwards compatibility)
export const getVoices = endpoint(
  async (req) => {
    const provider = (req.query?.provider as ttsService.TTSProviderType) || 'elevenlabs'
    const voices = await ttsService.getAvailableVoices(provider)
    return { voices, provider }
  },
  z.object({
    query: z.object({
      provider: z.enum(['elevenlabs', 'edge']).optional(),
    }).optional(),
  })
)

// Get all voices from all providers
export const getAllVoices = endpoint(async () => {
  const allVoices = await ttsService.getAllVoices()
  return { providers: allVoices }
})
