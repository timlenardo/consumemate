import { Stack } from 'expo-router'
import { useColorScheme } from 'react-native'
import { colors } from '@/constants/theme'

export default function AuthLayout() {
  const colorScheme = useColorScheme()
  const theme = colors[colorScheme ?? 'light']

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    />
  )
}
