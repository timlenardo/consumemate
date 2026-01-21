import 'reflect-metadata'
import express from 'express'
import cors from 'cors'
import { env, validateEnv } from '@config/env'
import { AppDataSource } from '@config/database'
import { authMiddleware } from '@middleware/auth'
import { errorHandler } from '@middleware/errorHandler'
import routes from '@routes/index'

// Validate environment variables
validateEnv()

const app = express()

// Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Auth middleware with whitelist
const publicPaths = [
  '/v1/auth/send-code',
  '/v1/auth/verify-code',
  '/v1/health',
  '/read/',
  '/voices',
]
app.use(authMiddleware(publicPaths))

// Routes
app.use(routes)

// Error handler (must be last)
app.use(errorHandler)

// Start server
async function start() {
  try {
    // Initialize database connection
    await AppDataSource.initialize()
    console.log('Database connected')

    // Run migrations
    await AppDataSource.runMigrations()
    console.log('Migrations complete')

    app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

start()
