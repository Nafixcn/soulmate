import { create } from 'zustand'

export interface WeChatUser {
  openid: string
  nickname: string
  avatar: string
}

interface AuthStore {
  user: WeChatUser | null
  isLoggingIn: boolean
  port: number

  setUser: (user: WeChatUser | null) => void
  setLoggingIn: (v: boolean) => void
  setPort: (p: number) => void
  loadFromStorage: () => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoggingIn: false,
  port: 0,

  setUser: (user) => {
    set({ user, isLoggingIn: false })
    if (user) {
      localStorage.setItem('wx_user', JSON.stringify(user))
    }
  },

  setLoggingIn: (v) => set({ isLoggingIn: v }),
  setPort: (p) => set({ port: p }),

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem('wx_user')
      if (raw) {
        set({ user: JSON.parse(raw) })
      }
    } catch {}
  },

  logout: () => {
    localStorage.removeItem('wx_user')
    set({ user: null })
  },
}))
