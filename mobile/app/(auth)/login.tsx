import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
  ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { colors, spacing, borderRadius } from '@/constants/theme'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/AuthContext'

export default function LoginScreen() {
  const colorScheme = useColorScheme()
  const theme = colors[colorScheme ?? 'light']
  const { signIn } = useAuth()

  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSendCode = async () => {
    if (phoneNumber.length < 10) {
      setError('Please enter a valid phone number')
      return
    }

    setLoading(true)
    setError('')

    try {
      await api.sendCode(phoneNumber)
      setStep('code')
    } catch (err: any) {
      setError(err.message || 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      setError('Please enter a 6-digit code')
      return
    }

    setLoading(true)
    setError('')

    try {
      await signIn(phoneNumber, code)
      router.replace('/(tabs)')
    } catch (err: any) {
      setError(err.message || 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.primary }]}>Consumemate</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Save articles to read or listen later
        </Text>

        {step === 'phone' ? (
          <View style={styles.form}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              placeholder="+1 (555) 123-4567"
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              autoFocus
            />
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: theme.primary },
                loading && styles.buttonDisabled,
              ]}
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Send Code</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={[styles.info, { color: theme.textSecondary }]}>
              Enter the 6-digit code sent to {phoneNumber}
            </Text>
            <TextInput
              style={[
                styles.input,
                styles.codeInput,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              placeholder="123456"
              placeholderTextColor={theme.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              autoFocus
            />
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: theme.primary },
                loading && styles.buttonDisabled,
              ]}
              onPress={handleVerifyCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setStep('phone')
                setCode('')
                setError('')
              }}
            >
              <Text style={[styles.backButtonText, { color: theme.primary }]}>
                Back
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {error ? (
          <View style={[styles.errorContainer, { backgroundColor: theme.errorBackground }]}>
            <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  title: {
    fontSize: 36,
    fontFamily: 'Georgia',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Georgia',
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  form: {
    gap: spacing.md,
  },
  input: {
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    fontSize: 18,
    fontFamily: 'Georgia',
  },
  codeInput: {
    textAlign: 'center',
    letterSpacing: 8,
    fontSize: 24,
  },
  info: {
    fontSize: 14,
    fontFamily: 'Georgia',
    textAlign: 'center',
  },
  button: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Georgia',
    fontWeight: '500',
  },
  backButton: {
    alignItems: 'center',
    padding: spacing.sm,
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: 'Georgia',
  },
  errorContainer: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'Georgia',
    textAlign: 'center',
  },
})
