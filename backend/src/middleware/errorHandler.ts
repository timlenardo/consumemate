import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { ResponseError } from '@utils/ResponseError'
import { env } from '@config/env'

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (res.headersSent) {
    return next(error)
  }

  let statusCode = 500
  let message = 'Internal server error'

  if (error instanceof ZodError) {
    statusCode = 400
    message = error.errors
      .map(e => `${e.path.join('.')} invalid: ${e.message}`)
      .join(', ')
  } else if (error instanceof ResponseError) {
    statusCode = error.status
    message = error.message
  } else if (error instanceof Error) {
    message = error.message
  }

  console.error(`[Error] ${statusCode} - ${message}`, {
    path: req.path,
    method: req.method,
    stack: env.nodeEnv === 'development' ? error.stack : undefined,
  })

  res.status(statusCode).json({
    message,
    ...(env.nodeEnv === 'development' && { stack: error.stack }),
  })
}
