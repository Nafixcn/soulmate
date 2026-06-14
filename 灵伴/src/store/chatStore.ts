import { create } from 'zustand'
import { Message, Persona, Expression, AISettings, TTSSettings } from '../types'
import { callAI } from '../services/aiService'
import { speak, stopSpeaking } from '../services/ttsService'

interface ChatStore {
  messages: Message[]
  persona: Persona
  isTyping: boolean
  expression: Expression
  isSpeaking: boolean
  error: string | null

  setPersona: (persona: Persona) => void
  setExpression: (expr: Expression) => void
  sendMessage: (content: string, aiSettings: AISettings, ttsSettings: TTSSettings) => Promise<void>
  clearChat: () => void
  clearError: () => void
}

const defaultPersona: Persona = {
  name: '灵伴',
  age: 20,
  personality: '温柔体贴',
  hobby: '看电影、听音乐',
  speakingStyle: '可爱活泼，喜欢用语气词，会称呼你为"哥哥"',
  relationshipStage: '刚认识',
  emoji: '🌸',
  hairColor: '#ff9fbf',
  eyeColor: '#ff6b9d'
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  persona: defaultPersona,
  isTyping: false,
  expression: 'neutral',
  isSpeaking: false,
  error: null,

  setPersona: (persona) => set({ persona }),
  setExpression: (expression) => set({ expression }),
  clearError: () => set({ error: null }),

  sendMessage: async (content, aiSettings, ttsSettings) => {
    const state = get()
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
    }

    set({
      messages: [...state.messages, userMsg],
      isTyping: true,
      expression: 'thinking',
      error: null
    })

    try {
      const result = await callAI(
        [...state.messages, userMsg],
        state.persona,
        aiSettings
      )

      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.content,
        thinking: result.thinking,
        timestamp: Date.now()
      }

      set(s => ({
        messages: [...s.messages, aiMsg],
        isTyping: false,
        expression: result.expression
      }))

      if (ttsSettings.autoPlay && ttsSettings.enabled) {
        set({ isSpeaking: true })
        await speak(result.content, ttsSettings)
        set({ isSpeaking: false })
      }

      setTimeout(() => {
        if (get().expression === result.expression) {
          set({ expression: 'neutral' })
        }
      }, 5000)

    } catch (error: unknown) {
      set({
        isTyping: false,
        error: error instanceof Error ? error.message : '发送失败，请检查网络和API设置'
      })
    }
  },

  clearChat: () => {
    stopSpeaking()
    set({ messages: [], expression: 'neutral', error: null })
  }
}))
