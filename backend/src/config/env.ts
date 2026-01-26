import dotenv from 'dotenv'
dotenv.config()

export const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL!,
  secretKey: process.env.SECRET_KEY!,

  // Twilio
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID!,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN!,
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER!,

  // ElevenLabs
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY!,
  // TTS test mode - truncates to 100 words to conserve API quota (default: true for local dev)
  ttsTestMode: process.env.TTS_TEST_MODE !== 'false',

  // URLs
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000',
}

export function validateEnv() {
  const required = [
    'DATABASE_URL',
    'SECRET_KEY',
  ]

  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
