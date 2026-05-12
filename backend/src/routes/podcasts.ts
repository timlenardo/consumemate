import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { endpointToArrayAuth } from '@middleware/endpoint'
import * as podcastController from '@controllers/podcastController'
import * as transcriptionService from '@services/transcriptionService'

const router = Router()

router.post('/resolve', ...endpointToArrayAuth(podcastController.resolveUrl))

// Streaming transcribe endpoint. Returns application/x-ndjson — one JSON
// object per line. Final line is {"type":"result", payload...} or
// {"type":"error", message}. Heartbeats keep Heroku's 30s no-data H12 quiet
// while Whisper is crunching long episodes.
const TranscribeBody = z.object({
  audioUrl: z.string().url(),
  durationSeconds: z.number().positive().optional(),
})

router.post('/transcribe', async (req: Request, res: Response, next: NextFunction) => {
  let body: z.infer<typeof TranscribeBody>
  try {
    body = TranscribeBody.parse(req.body)
  } catch (error) {
    return next(error)
  }

  res.setHeader('Content-Type', 'application/x-ndjson')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const writeEvent = (event: object) => {
    res.write(JSON.stringify(event) + '\n')
  }

  // Periodic heartbeat so we never go 25s without writing a byte.
  const heartbeat = setInterval(() => {
    writeEvent({ type: 'heartbeat' })
  }, 15_000)

  try {
    const payload = await transcriptionService.transcribeAudio(
      body.audioUrl,
      body.durationSeconds ?? null,
      writeEvent
    )
    writeEvent({ type: 'result', ...payload })
    res.end()
  } catch (error: any) {
    writeEvent({
      type: 'error',
      message: error?.message ?? 'Transcription failed',
    })
    res.end()
  } finally {
    clearInterval(heartbeat)
  }
})

export default router
