import { Router } from 'express'
import authRoutes from './auth'
import articleRoutes from './articles'
import publicRoutes from './public'

const router = Router()

// API routes
router.use('/v1/auth', authRoutes)
router.use('/v1/articles', articleRoutes)

// Public routes (no /v1 prefix for cleaner URLs)
router.use('/', publicRoutes)

// Health check
router.get('/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default router
