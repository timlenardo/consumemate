import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api, Account } from './api'

interface AuthContextType {
  isLoading: boolean
  isAuthenticated: boolean
  account: Account | null
  signIn: (phoneNumber: string, code: string) => Promise<void>
  signOut: () => Promise<void>
  updateAccount: (updates: { name?: string; preferredVoiceId?: string }) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [account, setAccount] = useState<Account | null>(null)

  useEffect(() => {
    async function init() {
      await api.init()

      if (api.isAuthenticated()) {
        try {
          const acc = await api.getAccount()
          setAccount(acc)
          setIsAuthenticated(true)
        } catch (error) {
          // Token invalid, clear it
          await api.clearToken()
        }
      }

      setIsLoading(false)
    }

    init()
  }, [])

  const signIn = useCallback(async (phoneNumber: string, code: string) => {
    const result = await api.verifyCode(phoneNumber, code)
    setAccount(result.account)
    setIsAuthenticated(true)
  }, [])

  const signOut = useCallback(async () => {
    await api.clearToken()
    setAccount(null)
    setIsAuthenticated(false)
  }, [])

  const updateAccount = useCallback(async (updates: { name?: string; preferredVoiceId?: string }) => {
    const updated = await api.updateAccount(updates)
    setAccount(updated)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        account,
        signIn,
        signOut,
        updateAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
