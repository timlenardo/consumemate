import { z } from 'zod'
import { endpointAuth } from '@middleware/endpoint'
import * as podcastService from '@services/podcastService'

export const resolveUrl = endpointAuth(
  async (req) => {
    return await podcastService.resolveUrl(req.body.url)
  },
  z.object({
    body: z.object({
      url: z.string().url(),
    }),
  })
)

// Transcribe is registered directly in routes/podcasts.ts because it
// streams NDJSON instead of returning a single JSON body.
