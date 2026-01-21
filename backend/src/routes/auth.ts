import { Router } from 'express'
import { endpointToArray, endpointToArrayAuth } from '@middleware/endpoint'
import * as authController from '@controllers/authController'

const router = Router()

// Public endpoints
router.post('/send-code', ...endpointToArray(authController.sendCode))
router.post('/verify-code', ...endpointToArray(authController.verifyCode))

// Authenticated endpoints
router.get('/account', ...endpointToArrayAuth(authController.getAccount))
router.patch('/account', ...endpointToArrayAuth(authController.updateAccount))
router.delete('/account', ...endpointToArrayAuth(authController.deleteAccount))

export default router
