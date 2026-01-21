export class ResponseError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'ResponseError'
  }
}

export class BadRequestError extends ResponseError {
  constructor(message: string = 'Bad request') {
    super(message, 400)
    this.name = 'BadRequestError'
  }
}

export class UnauthorizedError extends ResponseError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends ResponseError {
  constructor(message: string = 'Forbidden') {
    super(message, 403)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends ResponseError {
  constructor(message: string = 'Not found') {
    super(message, 404)
    this.name = 'NotFoundError'
  }
}
