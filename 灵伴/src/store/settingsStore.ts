import { create } from 'zustand'
import { AISettings, TTSSettings, API_PRESETS } from '../types'

interface SettingsStore {
  aiSettings: AISettings
  ttsSettings: TTSSettings
  aiConfigured: boolean
  live2dModelIndex: number

  setAISettings: (s: Partial<AISettings>) => void
  setTTSSettings: (s: Partial<TTSSettings>) => void
  applyPreset: (index: number) => void
  setLive2dModelIndex: (index: number) => void
  loadFromStorage: () => void
  saveToStorage: () => void
}

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

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  aiSettings: defaultAI,
  ttsSettings: defaultTTS,
  aiConfigured: false,
  live2dModelIndex: 0,

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

  applyPreset: (index) => {
    const preset = API_PRESETS[index]
    if (!preset) return
    set(s => ({
      aiSettings: {
        ...s.aiSettings,
        endpoint: preset.endpoint || s.aiSettings.endpoint,
        model: preset.models[0] || s.aiSettings.model
      }
    }))
    get().saveToStorage()
  },

  setLive2dModelIndex: (index) => {
    set({ live2dModelIndex: index })
    get().saveToStorage()
  },

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem('lt_settings')
      if (raw) {
        const data = JSON.parse(raw)
        set({
          aiSettings: { ...defaultAI, ...data.aiSettings },
          ttsSettings: { ...defaultTTS, ...data.ttsSettings },
          aiConfigured: !!(data.aiSettings?.apiKey),
          live2dModelIndex: data.live2dModelIndex ?? 0,
        })
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage:', e)
    }
  },

  saveToStorage: () => {
    const { aiSettings, ttsSettings, live2dModelIndex } = get()
    localStorage.setItem('lt_settings', JSON.stringify({ aiSettings, ttsSettings, live2dModelIndex }))
  }
}))
