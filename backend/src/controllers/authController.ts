import { z } from 'zod'
import { endpoint, endpointAuth } from '@middleware/endpoint'
import * as authService from '@services/authService'

export const sendCode = endpoint(
  async (req) => {
    const { phoneNumber } = req.body
    await authService.sendVerificationCode(phoneNumber)
    return { success: true }
  },
  z.object({
    body: z.object({
      phoneNumber: z.string().min(10),
    }),
  })
)

export const verifyCode = endpoint(
  async (req) => {
    const { phoneNumber, code } = req.body
    const result = await authService.verifyCode(phoneNumber, code)
    return {
      token: result.token,
      account: {
        id: result.account.id,
        phoneNumber: result.account.phoneNumber,
        name: result.account.name,
        preferredVoiceId: result.account.preferredVoiceId,
      },
      isNewUser: result.isNewUser,
    }
  },
  z.object({
    body: z.object({
      phoneNumber: z.string().min(10),
      code: z.string().length(6),
    }),
  })
)

export const getAccount = endpointAuth(async (req) => {
  const account = await authService.getAccount(req.auth.accountId)
  if (!account) {
    return null
  }
  return {
    id: account.id,
    phoneNumber: account.phoneNumber,
    name: account.name,
    preferredVoiceId: account.preferredVoiceId,
  }
})

export const updateAccount = endpointAuth(
  async (req) => {
    const account = await authService.updateAccount(req.auth.accountId, req.body)
    return {
      id: account.id,
      phoneNumber: account.phoneNumber,
      name: account.name,
      preferredVoiceId: account.preferredVoiceId,
    }
  },
  z.object({
    body: z.object({
      name: z.string().optional(),
      preferredVoiceId: z.string().optional(),
    }),
  })
)

export const deleteAccount = endpointAuth(async (req) => {
  await authService.deleteAccount(req.auth.accountId)
  return { success: true }
})
