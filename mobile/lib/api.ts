import AsyncStorage from '@react-native-async-storage/async-storage'

// API URLs
const STAGING_URL = 'https://consume-dev-56af3b34f0b8.herokuapp.com'
const PRODUCTION_URL = 'https://consume-dev-56af3b34f0b8.herokuapp.com' // Using staging as production for now

// In dev mode, use staging server (works on physical devices)
// In production builds, use production URL
const API_URL = __DEV__ ? STAGING_URL : PRODUCTION_URL

export interface Account {
  id: number
  phoneNumber: string
  name: string | null
  preferredVoiceId: string | null
}

export interface ArticleSummary {
  id: number
  url: string
  title: string
  author: string | null
  siteName: string | null
  excerpt: string | null
  featuredImage: string | null
  wordCount: number | null
  estimatedReadingTime: number | null
  isRead: boolean
  readAt: string | null
  publicSlug: string
  publicUrl: string
  hasAudio: boolean
  createdAt: string
}

export interface Article extends ArticleSummary {
  contentMarkdown: string
  contentHtml: string
  audioUrl: string | null
  audioVoiceId: string | null
}

export interface Voice {
  id: string
  name: string
  previewUrl?: string
  category?: string
}

export interface WordTiming {
  word: string
  start: number  // start time in milliseconds
  end: number    // end time in milliseconds
}

class ApiClient {
  private token: string | null = null

  async init() {
    this.token = await AsyncStorage.getItem('token')
  }

  async setToken(token: string) {
    this.token = token
    await AsyncStorage.setItem('token', token)
  }

  async clearToken() {
    this.token = null
    await AsyncStorage.removeItem('token')
    await AsyncStorage.removeItem('phoneNumber')
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    console.log(`[API] ${options.method || 'GET'} ${endpoint}`)

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    })

    const text = await response.text()
    console.log(`[API] Response status: ${response.status}, length: ${text.length}`)

    // Log first 500 chars of response for debugging
    if (text.length > 0) {
      console.log(`[API] Response preview: ${text.substring(0, 500)}`)
    }

    let data: any
    try {
      data = JSON.parse(text)
    } catch (e) {
      console.error(`[API] JSON parse error for ${endpoint}:`, e)
      console.error(`[API] Raw response: ${text.substring(0, 1000)}`)
      throw new Error(`Invalid JSON response from server: ${text.substring(0, 100)}`)
    }

    if (!response.ok) {
      if (response.status === 401) {
        await this.clearToken()
      }
      throw new Error(data.message || 'Request failed')
    }

    return data
  }

  // Auth
  async sendCode(phoneNumber: string): Promise<void> {
    await this.request('/v1/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    })
  }

  async verifyCode(phoneNumber: string, code: string): Promise<{
    token: string
    account: Account
    isNewUser: boolean
  }> {
    const result = await this.request<{
      token: string
      account: Account
      isNewUser: boolean
    }>('/v1/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, code }),
    })

    await this.setToken(result.token)
    await AsyncStorage.setItem('phoneNumber', result.account.phoneNumber)

    return result
  }

  async getAccount(): Promise<Account | null> {
    return this.request('/v1/auth/account')
  }

  async updateAccount(updates: { name?: string; preferredVoiceId?: string }): Promise<Account> {
    return this.request('/v1/auth/account', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  // Articles
  async getArticles(filter: 'all' | 'read' | 'unread' = 'all'): Promise<ArticleSummary[]> {
    return this.request(`/v1/articles?filter=${filter}`)
  }

  async getArticle(id: number): Promise<Article> {
    return this.request(`/v1/articles/${id}`)
  }

  async markAsRead(id: number): Promise<void> {
    await this.request(`/v1/articles/${id}/read`, { method: 'POST' })
  }

  async markAsUnread(id: number): Promise<void> {
    await this.request(`/v1/articles/${id}/unread`, { method: 'POST' })
  }

  async deleteArticle(id: number): Promise<void> {
    await this.request(`/v1/articles/${id}`, { method: 'DELETE' })
  }

  async generateAudio(id: number, voiceId: string): Promise<{
    audioData: string
    contentType: string
    wordTimings: WordTiming[]
    processedText: string
    estimatedDurationMs?: number
  }> {
    return this.request(`/v1/articles/${id}/audio`, {
      method: 'POST',
      body: JSON.stringify({ voiceId }),
    })
  }

  async clearAudio(id: number): Promise<void> {
    await this.request(`/v1/articles/${id}/audio`, { method: 'DELETE' })
  }

  // Voices
  async getVoices(): Promise<{ voices: Voice[] }> {
    return this.request('/voices')
  }

  // Public
  async getPublicArticle(slug: string): Promise<Article> {
    return this.request(`/read/${slug}`)
  }

  isAuthenticated(): boolean {
    return !!this.token
  }
}

export const api = new ApiClient()
