import { randomBytes } from 'crypto'

export function generatePublicSlug(): string {
  return randomBytes(8).toString('base64url')
}
