import { z } from 'zod'
import { endpointAuth } from '@middleware/endpoint'
import * as podcastService from '@services/podcastService'
import * as transcriptionService from '@services/transcriptionService'

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

export const transcribe = endpointAuth(
  async (req) => {
    return await transcriptionService.transcribeAudio(
      req.body.audioUrl,
      req.body.durationSeconds ?? null
    )
  },
  z.object({
    body: z.object({
      audioUrl: z.string().url(),
      durationSeconds: z.number().positive().optional(),
    }),
  })
)
