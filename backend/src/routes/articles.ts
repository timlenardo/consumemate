import { Router } from 'express'
import { endpointToArray, endpointToArrayAuth } from '@middleware/endpoint'
import * as articleController from '@controllers/articleController'

const router = Router()

// Authenticated endpoints
router.post('/', ...endpointToArrayAuth(articleController.saveArticle))
router.get('/', ...endpointToArrayAuth(articleController.getArticles))
router.get('/:id', ...endpointToArrayAuth(articleController.getArticle))
router.post('/:id/read', ...endpointToArrayAuth(articleController.markAsRead))
router.post('/:id/unread', ...endpointToArrayAuth(articleController.markAsUnread))
router.delete('/:id', ...endpointToArrayAuth(articleController.deleteArticle))
router.post('/:id/audio', ...endpointToArrayAuth(articleController.generateAudio))
router.delete('/:id/audio', ...endpointToArrayAuth(articleController.clearAudio))
router.get('/:id/audio/chunks', ...endpointToArrayAuth(articleController.getAudioChunkCount))
router.post('/:id/audio/chunk', ...endpointToArrayAuth(articleController.generateAudioChunk))

export default router
