import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ScrollView,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing, borderRadius } from '@/constants/theme'
import { useAuth } from '@/lib/AuthContext'
import { api, Voice } from '@/lib/api'

export default function SettingsScreen() {
  const colorScheme = useColorScheme()
  const theme = colors[colorScheme ?? 'light']
  const { account, signOut, updateAccount } = useAuth()

  const [voices, setVoices] = useState<Voice[]>([])
  const [loadingVoices, setLoadingVoices] = useState(true)

  useEffect(() => {
    async function loadVoices() {
      try {
        const { voices: voiceList } = await api.getVoices()
        setVoices(voiceList)
      } catch (error) {
        console.error('Failed to load voices:', error)
      } finally {
        setLoadingVoices(false)
      }
    }
    loadVoices()
  }, [])

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ]
    )
  }

  const handleSelectVoice = async (voiceId: string) => {
    try {
      await updateAccount({ preferredVoiceId: voiceId })
    } catch (error) {
      Alert.alert('Error', 'Failed to update voice preference')
    }
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Account Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>ACCOUNT</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.row}>
            <Ionicons name="call-outline" size={20} color={theme.textSecondary} />
            <Text style={[styles.rowText, { color: theme.text }]}>
              {account?.phoneNumber}
            </Text>
          </View>
        </View>
      </View>

      {/* Voice Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>VOICE FOR AUDIO</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {loadingVoices ? (
            <Text style={[styles.rowText, { color: theme.textSecondary }]}>
              Loading voices...
            </Text>
          ) : (
            voices.map((voice, index) => (
              <TouchableOpacity
                key={voice.id}
                style={[
                  styles.voiceRow,
                  index < voices.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                ]}
                onPress={() => handleSelectVoice(voice.id)}
              >
                <Text style={[styles.rowText, { color: theme.text }]}>{voice.name}</Text>
                {account?.preferredVoiceId === voice.id && (
                  <Ionicons name="checkmark" size={20} color={theme.primary} />
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>

      {/* Sign Out */}
      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.signOutButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={20} color={theme.error} />
          <Text style={[styles.signOutText, { color: theme.error }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={styles.appInfo}>
        <Text style={[styles.appName, { color: theme.primary }]}>Consumemate</Text>
        <Text style={[styles.appVersion, { color: theme.textMuted }]}>Version 1.0.0</Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Georgia',
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  rowText: {
    fontSize: 16,
    fontFamily: 'Georgia',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  signOutText: {
    fontSize: 16,
    fontFamily: 'Georgia',
    fontWeight: '500',
  },
  appInfo: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  appName: {
    fontSize: 20,
    fontFamily: 'Georgia',
    fontWeight: '600',
  },
  appVersion: {
    fontSize: 14,
    fontFamily: 'Georgia',
    marginTop: spacing.xs,
  },
})
