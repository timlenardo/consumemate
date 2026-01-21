import { Tabs } from 'expo-router'
import { useColorScheme } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/theme'

export default function TabsLayout() {
  const colorScheme = useColorScheme()
  const theme = colors[colorScheme ?? 'light']

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
        },
        headerStyle: {
          backgroundColor: theme.background,
        },
        headerTintColor: theme.text,
        headerTitleStyle: {
          fontFamily: 'Georgia',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Unread',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="read"
        options={{
          title: 'Read',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-done-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
