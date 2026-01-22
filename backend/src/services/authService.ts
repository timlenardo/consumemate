import jwt from 'jsonwebtoken'
import twilio from 'twilio'
import { AppDataSource } from '@config/database'
import { env } from '@config/env'
import { Account } from '@entities/Account'
import { VerificationCode } from '@entities/VerificationCode'
import { BadRequestError, UnauthorizedError } from '@utils/ResponseError'

const twilioClient = env.twilioAccountSid && env.twilioAuthToken
  ? twilio(env.twilioAccountSid, env.twilioAuthToken)
  : null

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except leading +
  const cleaned = phone.replace(/[^\d+]/g, '')
  // Ensure it starts with +
  return cleaned.startsWith('+') ? cleaned : `+1${cleaned}`
}

export async function sendVerificationCode(phoneNumber: string): Promise<void> {
  const normalized = normalizePhoneNumber(phoneNumber)
  const code = generateCode()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

  const verificationRepo = AppDataSource.getRepository(VerificationCode)

  // Save verification code
  await verificationRepo.insert({
    phoneNumber: normalized,
    code,
    expiresAt,
  })

  // Send SMS via Twilio
  if (twilioClient) {
    try {
      await twilioClient.messages.create({
        body: `Your Consumemate verification code is: ${code}`,
        from: env.twilioPhoneNumber,
        to: normalized,
      })
    } catch (error) {
      // Twilio failed (e.g., pending approval) - log code for dev
      console.log(`[DEV] Twilio failed, verification code for ${normalized}: ${code}`)
    }
  } else {
    // Development mode - log the code
    console.log(`[DEV] Verification code for ${normalized}: ${code}`)
  }
}

export async function verifyCode(
  phoneNumber: string,
  code: string
): Promise<{ token: string; account: Account; isNewUser: boolean }> {
  const normalized = normalizePhoneNumber(phoneNumber)
  const verificationRepo = AppDataSource.getRepository(VerificationCode)
  const accountRepo = AppDataSource.getRepository(Account)

  // TODO: Remove this bypass code before production
  const BYPASS_CODE = '123456'
  const isBypass = code === BYPASS_CODE

  if (!isBypass) {
    // Find valid verification code
    const verification = await verificationRepo
      .createQueryBuilder('vc')
      .where('vc.phone_number = :phoneNumber', { phoneNumber: normalized })
      .andWhere('vc.code = :code', { code })
      .andWhere('vc.expires_at > :now', { now: new Date() })
      .andWhere('vc.used_at IS NULL')
      .orderBy('vc.created_at', 'DESC')
      .getOne()

    if (!verification) {
      throw new UnauthorizedError('Invalid or expired verification code')
    }

    // Mark code as used
    await verificationRepo.update(verification.id, { usedAt: new Date() })
  }

  // Find or create account
  let account = await accountRepo.findOne({
    where: { phoneNumber: normalized },
    withDeleted: true,
  })

  let isNewUser = false

  if (!account) {
    isNewUser = true
    const result = await accountRepo.insert({
      phoneNumber: normalized,
    })
    account = await accountRepo.findOneOrFail({
      where: { id: result.identifiers[0].id },
    })
  } else if (account.deletedAt) {
    // Reactivate soft-deleted account
    await accountRepo.update(account.id, { deletedAt: null })
    account.deletedAt = null
  }

  // Generate JWT
  const token = jwt.sign(
    { accountId: account.id },
    env.secretKey,
    { algorithm: 'HS256' }
  )

  return { token, account, isNewUser }
}

export async function getAccount(accountId: number): Promise<Account | null> {
  const accountRepo = AppDataSource.getRepository(Account)
  return accountRepo.findOne({ where: { id: accountId } })
}

export async function updateAccount(
  accountId: number,
  updates: { name?: string; preferredVoiceId?: string }
): Promise<Account> {
  const accountRepo = AppDataSource.getRepository(Account)

  await accountRepo.update(accountId, updates)

  const account = await accountRepo.findOneOrFail({
    where: { id: accountId },
  })

  return account
}

export async function deleteAccount(accountId: number): Promise<void> {
  const accountRepo = AppDataSource.getRepository(Account)
  await accountRepo.softDelete(accountId)
}
