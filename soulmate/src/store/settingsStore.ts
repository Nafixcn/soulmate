import { create } from 'zustand'
import { AISettings, TTSSettings, Persona, API_PRESETS } from '../types'

interface SettingsStore {
  aiSettings: AISettings
  ttsSettings: TTSSettings
  persona: Persona
  aiConfigured: boolean

  setAISettings: (s: Partial<AISettings>) => void
  setTTSSettings: (s: Partial<TTSSettings>) => void
  setPersona: (p: Persona) => void
  applyPreset: (index: number) => void
  loadFromStorage: () => void
  saveToStorage: () => void
}

const STORAGE_KEY = 'soulmate_v2_settings'

const defaultAI: AISettings = {
  apiKey: '',
  endpoint: API_PRESETS[0].endpoint,
  model: API_PRESETS[0].models[0],
  temperature: 0.85,
  maxTokens: 512
}

const defaultTTS: TTSSettings = {
  enabled: false,
  autoPlay: false,
  rate: 1.1,
  pitch: 1.2,
  voiceURI: ''
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

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  aiSettings: defaultAI,
  ttsSettings: defaultTTS,
  persona: defaultPersona,
  aiConfigured: false,

  setAISettings: (partial) => {
    set(s => ({
      aiSettings: { ...s.aiSettings, ...partial },
      aiConfigured: !!(partial.apiKey !== undefined ? partial.apiKey : s.aiSettings.apiKey)
    }))
    get().saveToStorage()
  },
  setTTSSettings: (partial) => {
    set(s => ({ ttsSettings: { ...s.ttsSettings, ...partial } }))
    get().saveToStorage()
  },
  setPersona: (persona) => {
    set({ persona })
    get().saveToStorage()
  },
  applyPreset: (index) => {
    const preset = API_PRESETS[index]
    if (!preset) return
    set(s => ({
      aiSettings: { ...s.aiSettings, endpoint: preset.endpoint || s.aiSettings.endpoint, model: preset.models[0] || s.aiSettings.model }
    }))
    get().saveToStorage()
  },
  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const data = JSON.parse(raw)
        set({
          aiSettings: { ...defaultAI, ...data.aiSettings },
          ttsSettings: { ...defaultTTS, ...data.ttsSettings },
          persona: { ...defaultPersona, ...data.persona },
          aiConfigured: !!(data.aiSettings?.apiKey),
        })
      }
    } catch (e) { console.warn('load settings:', e) }
  },
  saveToStorage: () => {
    const { aiSettings, ttsSettings, persona } = get()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ aiSettings, ttsSettings, persona }))
  }
}))
