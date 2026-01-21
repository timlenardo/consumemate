import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useColorScheme, View, ActivityIndicator, StyleSheet } from 'react-native'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import { colors } from '@/constants/theme'

function RootLayoutNav() {
  const colorScheme = useColorScheme()
  const theme = colors[colorScheme ?? 'light']
  const { isLoading } = useAuth()

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  return (
    <>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerTitleStyle: { fontFamily: 'Georgia' },
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="article/[id]"
          options={{
            title: 'Article',
            headerBackTitle: 'Back',
          }}
        />
      </Stack>
    </>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
