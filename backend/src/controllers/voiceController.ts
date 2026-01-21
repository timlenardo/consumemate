import { endpoint } from '@middleware/endpoint'
import * as ttsService from '@services/ttsService'

export const getVoices = endpoint(async () => {
  const voices = await ttsService.getAvailableVoices()
  return { voices }
})
