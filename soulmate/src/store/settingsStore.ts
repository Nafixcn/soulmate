import { create } from 'zustand'
import { AISettings, TTSSettings, Persona, API_PRESETS, DEFAULT_PERSONA, ThemeColors, THEME_PRESETS } from '../types'
import {
  clearLegacyApiKey,
  clearLocalSettingsSnapshots,
  deletePersonaData,
  hasApiKey,
  loadLegacyLocalApiKey,
  loadLegacyApiKey,
  loadSettingsSnapshot,
  saveApiKey,
  saveSettingsSnapshot,
  type SettingsSnapshotInput,
} from '../services/settingsPersistence'
import { normalizePersonas } from '../domain/persona'

interface SettingsStore {
  aiSettings: AISettings
  ttsSettings: TTSSettings
  persona: Persona
  personas: Persona[]
  activePersonaIndex: number
  aiConfigured: boolean
  theme: ThemeColors
  themePresetIndex: number
  persistenceError: string | null

  setAISettings: (settings: Partial<AISettings>) => void
  setApiKey: (apiKey: string) => Promise<boolean>
  setTTSSettings: (settings: Partial<TTSSettings>) => void
  setPersona: (persona: Persona) => void
  applyPreset: (index: number) => void
  applyThemePreset: (index: number) => void
  setTheme: (colors: ThemeColors) => void
  loadFromStorage: () => Promise<void>
  saveToStorage: () => Promise<boolean>
  clearPersistenceError: () => void
  addPersona: (persona: Persona) => void
  updatePersona: (index: number, persona: Persona) => void
  removePersona: (index: number) => Promise<boolean>
  switchPersona: (index: number) => void
}

const defaultAI: AISettings = {
  endpoint: API_PRESETS[0].endpoint,
  model: API_PRESETS[0].models[0],
  temperature: 0.6,
  maxTokens: 1024,
  autoProgress: false,
  evalInterval: 20,
  useWebSearch: false,
}

const defaultTTS: TTSSettings = {
  enabled: false,
  autoPlay: false,
  rate: 1.1,
  pitch: 1.2,
  voiceURI: '',
}

const defaultTheme: ThemeColors = {
  primary: '#e896b0',
  bg: '#faf5f7',
  chatBg: '#fef5f8',
  userBubble: '#f0a8c0',
  aiBubble: '#ffffff',
  text: '#4a3040',
  subText: '#998893',
  petals: ['🌸', '💮', '🌷', '🏵️', '✿', '❀', '🌸', '💮'],
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let persistenceBlockCount = 0
let saveRequestedWhileBlocked = false

function snapshotFromState(state: SettingsStore): SettingsSnapshotInput {
  return {
    aiSettings: state.aiSettings,
    ttsSettings: state.ttsSettings,
    persona: state.persona,
    personas: state.personas,
    activePersonaIndex: state.activePersonaIndex,
    theme: state.theme,
    themePresetIndex: state.themePresetIndex,
  }
}

function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    if (persistenceBlockCount > 0) {
      saveRequestedWhileBlocked = true
      return
    }
    void useSettingsStore.getState().saveToStorage()
  }, 300)
}

function blockDebouncedPersistence() {
  persistenceBlockCount++
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    saveRequestedWhileBlocked = true
  }
}

function resumeDebouncedPersistence() {
  persistenceBlockCount = Math.max(0, persistenceBlockCount - 1)
  if (persistenceBlockCount === 0 && saveRequestedWhileBlocked) {
    saveRequestedWhileBlocked = false
    debouncedSave()
  }
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  aiSettings: defaultAI,
  ttsSettings: defaultTTS,
  persona: { ...DEFAULT_PERSONA },
  personas: [{ ...DEFAULT_PERSONA }],
  activePersonaIndex: 0,
  aiConfigured: false,
  theme: { ...defaultTheme },
  themePresetIndex: 0,
  persistenceError: null,

  setAISettings: (partial) => {
    set((state) => ({ aiSettings: { ...state.aiSettings, ...partial } }))
    debouncedSave()
  },
  setApiKey: async (apiKey) => {
    const saved = await saveApiKey(apiKey.trim())
    if (saved) {
      set({ aiConfigured: apiKey.trim().length > 0, persistenceError: null })
    } else {
      set({ persistenceError: 'API Key 无法写入系统钥匙串' })
    }
    return saved
  },
  setTTSSettings: (partial) => {
    set((state) => ({ ttsSettings: { ...state.ttsSettings, ...partial } }))
    debouncedSave()
  },
  setPersona: (persona) => {
    const index = get().activePersonaIndex
    const personas = [...get().personas]
    if (!personas[index]) return
    const updatedPersona = { ...persona, id: personas[index].id }
    personas[index] = updatedPersona
    set({ persona: updatedPersona, personas })
    debouncedSave()
  },
  applyPreset: (index) => {
    const preset = API_PRESETS[index]
    if (!preset) return
    set((state) => ({
      aiSettings: {
        ...state.aiSettings,
        endpoint: preset.endpoint || state.aiSettings.endpoint,
        model: preset.models[0] || state.aiSettings.model,
      },
    }))
    debouncedSave()
  },
  applyThemePreset: (index) => {
    const preset = THEME_PRESETS[index]
    if (!preset) return
    set({ theme: { ...preset.colors }, themePresetIndex: index })
    debouncedSave()
  },
  setTheme: (colors) => {
    set({ theme: { ...colors }, themePresetIndex: THEME_PRESETS.length - 1 })
    debouncedSave()
  },
  addPersona: (input) => {
    const existingIds = new Set(get().personas.map((persona) => persona.id))
    const persona = { ...input, id: input.id && !existingIds.has(input.id) ? input.id : crypto.randomUUID() }
    const personas = [...get().personas, persona]
    set({ personas, persona, activePersonaIndex: personas.length - 1 })
    debouncedSave()
  },
  updatePersona: (index, input) => {
    const personas = [...get().personas]
    if (!personas[index]) return
    const persona = { ...input, id: personas[index].id }
    personas[index] = persona
    const updates: Partial<SettingsStore> = { personas }
    if (index === get().activePersonaIndex) updates.persona = persona
    set(updates)
    debouncedSave()
  },
  removePersona: async (index) => {
    const state = get()
    if (state.personas.length <= 1 || !state.personas[index]) return false

    const removedPersona = state.personas[index]
    const personas = state.personas.filter((_, personaIndex) => personaIndex !== index)
    let activePersonaIndex = state.activePersonaIndex
    if (index === activePersonaIndex) activePersonaIndex = 0
    else if (index < activePersonaIndex) activePersonaIndex--
    const persona = personas[activePersonaIndex]
    const nextState = { ...state, personas, persona, activePersonaIndex }

    blockDebouncedPersistence()
    try {
      await deletePersonaData(removedPersona.id, snapshotFromState(nextState))
      set({ personas, persona, activePersonaIndex, persistenceError: null })
      return true
    } catch (error) {
      console.error('Failed to delete persona:', error)
      set({ persistenceError: '角色删除失败，聊天记录未被修改' })
      return false
    } finally {
      resumeDebouncedPersistence()
    }
  },
  switchPersona: (index) => {
    const personas = get().personas
    if (index < 0 || index >= personas.length) return
    set({ persona: personas[index], activePersonaIndex: index })
    debouncedSave()
  },
  loadFromStorage: async () => {
    let legacyApiKey = loadLegacyLocalApiKey()
    let loadedFromLocal = false

    try {
      const loaded = await loadSettingsSnapshot()
      if (loaded) {
        loadedFromLocal = loaded.source === 'local'
        const data = loaded.snapshot
        const { apiKey, ...storedAISettings } = data.aiSettings || {}
        legacyApiKey = apiKey || legacyApiKey
        const storedPersonas = data.personas?.length ? data.personas : [data.persona || {}]
        const { personas, activeIndex } = normalizePersonas(storedPersonas, data.activePersonaIndex ?? 0)
        set({
          aiSettings: { ...defaultAI, ...storedAISettings },
          ttsSettings: { ...defaultTTS, ...data.ttsSettings },
          persona: personas[activeIndex],
          personas,
          activePersonaIndex: activeIndex,
          theme: data.theme ? { ...defaultTheme, ...data.theme } : { ...defaultTheme },
          themePresetIndex: data.themePresetIndex ?? 0,
        })
      }
    } catch (error) {
      console.warn('Failed to load settings:', error)
      set({ persistenceError: '设置加载失败，已使用默认配置' })
    }

    let configured = await hasApiKey()
    const legacyStoreApiKey = await loadLegacyApiKey()
    const migrationCandidate = configured ? '' : legacyApiKey || legacyStoreApiKey

    if (migrationCandidate && (await saveApiKey(migrationCandidate))) {
      configured = true
      await clearLegacyApiKey()
    } else if (configured && legacyStoreApiKey) {
      await clearLegacyApiKey()
    }
    set({ aiConfigured: configured })

    if (loadedFromLocal) {
      const persisted = await get().saveToStorage()
      if (persisted && (!legacyApiKey || configured)) clearLocalSettingsSnapshots()
    } else if (configured && legacyApiKey) {
      clearLocalSettingsSnapshots()
    }
  },
  saveToStorage: async () => {
    try {
      await saveSettingsSnapshot(snapshotFromState(get()))
      set({ persistenceError: null })
      return true
    } catch (error) {
      console.error('Failed to save settings:', error)
      set({ persistenceError: '设置保存失败，请稍后重试' })
      return false
    }
  },
  clearPersistenceError: () => set({ persistenceError: null }),
}))
