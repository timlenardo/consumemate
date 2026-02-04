import { Router } from 'express'
import { endpointToArray } from '@middleware/endpoint'
import * as articleController from '@controllers/articleController'
import * as voiceController from '@controllers/voiceController'

const router = Router()

// Public article page
router.get('/read/:slug', ...endpointToArray(articleController.getPublicArticle))

// Available voices (public so extension can show them)
router.get('/voices', ...endpointToArray(voiceController.getVoices))

// Get all voices from all providers
router.get('/voices/all', ...endpointToArray(voiceController.getAllVoices))

export default router
