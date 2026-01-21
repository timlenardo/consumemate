import { Request, Response, NextFunction, RequestHandler } from 'express'
import { ZodTypeAny, z } from 'zod'
import { AuthPayload } from './auth'

export type RequestCallback<T extends ZodTypeAny> = (
  req: z.infer<T> & Omit<Request, 'body' | 'query' | 'params'>
) => Promise<unknown> | unknown

export type RequestCallbackAuth<T extends ZodTypeAny> = (
  req: z.infer<T> & Omit<Request, 'body' | 'query' | 'params'> & { auth: AuthPayload }
) => Promise<unknown> | unknown

export interface Endpoint<T extends ZodTypeAny> {
  schema?: T
  callback: RequestCallback<T>
}

export interface EndpointAuth<T extends ZodTypeAny> {
  schema?: T
  callback: RequestCallbackAuth<T>
}

export function endpoint<T extends ZodTypeAny>(
  callback: RequestCallback<T>,
  schema?: T
): Endpoint<T> {
  return { callback, schema }
}

export function endpointAuth<T extends ZodTypeAny>(
  callback: RequestCallbackAuth<T>,
  schema?: T
): EndpointAuth<T> {
  return { callback, schema }
}

function schemaHandler<T extends ZodTypeAny>(schema?: T): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!schema) {
      return next()
    }

    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      })

      req.body = parsed.body ?? req.body
      req.query = parsed.query ?? req.query
      req.params = parsed.params ?? req.params

      next()
    } catch (error) {
      next(error)
    }
  }
}

function callbackHandler<T extends ZodTypeAny>(
  callback: RequestCallback<T> | RequestCallbackAuth<T>
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await callback(req as any)

      if (result !== undefined) {
        res.json(result)
      } else {
        res.status(200).end()
      }
    } catch (error) {
      next(error)
    }
  }
}

export function endpointToArray<T extends ZodTypeAny>(
  ep: Endpoint<T>
): RequestHandler[] {
  return [schemaHandler(ep.schema), callbackHandler(ep.callback)]
}

export function endpointToArrayAuth<T extends ZodTypeAny>(
  ep: EndpointAuth<T>
): RequestHandler[] {
  return [schemaHandler(ep.schema), callbackHandler(ep.callback)]
}
