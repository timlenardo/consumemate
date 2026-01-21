import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '@config/env'
import { AppDataSource } from '@config/database'
import { Account } from '@entities/Account'
import { UnauthorizedError } from '@utils/ResponseError'

export interface AuthPayload {
  accountId: number
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload
    }
  }
}

export function authMiddleware(whitelist: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const path = req.path

    // Check if path is whitelisted
    if (whitelist.some(pattern => path.startsWith(pattern))) {
      return next()
    }

    try {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing or invalid authorization header')
      }

      const token = authHeader.substring(7)
      const payload = jwt.verify(token, env.secretKey) as AuthPayload

      // Verify account exists
      const accountRepo = AppDataSource.getRepository(Account)
      const account = await accountRepo.findOne({
        where: { id: payload.accountId },
      })

      if (!account) {
        throw new UnauthorizedError('Account not found')
      }

      req.auth = { accountId: payload.accountId }
      next()
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        next(new UnauthorizedError('Invalid token'))
      } else {
        next(error)
      }
    }
  }
}
