import { Router } from 'express'
import { endpointToArrayAuth } from '@middleware/endpoint'
import * as podcastController from '@controllers/podcastController'

const router = Router()

router.post('/resolve', ...endpointToArrayAuth(podcastController.resolveUrl))

export default router
