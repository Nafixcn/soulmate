import { create } from 'zustand'
import { AISettings, TTSSettings, Persona, API_PRESETS, DEFAULT_PERSONA, ThemeColors, THEME_PRESETS } from '../types'
import {
  clearLegacyApiKey,
  loadApiKey,
  loadLegacyApiKey,
  loadSettingsSnapshot,
  saveApiKey,
  saveSettingsSnapshot,
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

  setAISettings: (s: Partial<AISettings>) => void
  setTTSSettings: (s: Partial<TTSSettings>) => void
  setPersona: (p: Persona) => void
  applyPreset: (index: number) => void
  applyThemePreset: (index: number) => void
  setTheme: (colors: ThemeColors) => void
  loadFromStorage: () => Promise<void>
  saveToStorage: () => void
  addPersona: (p: Persona) => void
  updatePersona: (index: number, p: Persona) => void
  removePersona: (index: number) => void
  switchPersona: (index: number) => void
}

const defaultAI: AISettings = {
  apiKey: '',
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

let saveTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const { aiSettings, ttsSettings, persona, personas, activePersonaIndex, theme, themePresetIndex } =
      useSettingsStore.getState()
    saveSettingsSnapshot({ aiSettings, ttsSettings, persona, personas, activePersonaIndex, theme, themePresetIndex })
    saveTimer = null
  }, 300)
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

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  aiSettings: defaultAI,
  ttsSettings: defaultTTS,
  persona: { ...DEFAULT_PERSONA },
  personas: [{ ...DEFAULT_PERSONA }],
  activePersonaIndex: 0,
  aiConfigured: false,
  theme: { ...defaultTheme },
  themePresetIndex: 0,

  setAISettings: (partial) => {
    const current = get().aiSettings
    const merged = { ...current, ...partial }
    const hasKey = !!merged.apiKey
    set({ aiSettings: merged, aiConfigured: hasKey })
    if (partial.apiKey !== undefined) {
      void saveApiKey(merged.apiKey)
    }
    debouncedSave()
  },
  setTTSSettings: (partial) => {
    set((s) => ({ ttsSettings: { ...s.ttsSettings, ...partial } }))
    debouncedSave()
  },
  setPersona: (persona) => {
    const idx = get().activePersonaIndex
    const personas = [...get().personas]
    if (personas[idx]) {
      const updatedPersona = { ...persona, id: personas[idx].id }
      personas[idx] = updatedPersona
      set({ persona: updatedPersona, personas })
    }
    debouncedSave()
  },
  applyPreset: (index) => {
    const preset = API_PRESETS[index]
    if (!preset) return
    set((s) => ({
      aiSettings: {
        ...s.aiSettings,
        endpoint: preset.endpoint || s.aiSettings.endpoint,
        model: preset.models[0] || s.aiSettings.model,
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
  addPersona: (p) => {
    const existingIds = new Set(get().personas.map((persona) => persona.id))
    const persona = { ...p, id: p.id && !existingIds.has(p.id) ? p.id : crypto.randomUUID() }
    const personas = [...get().personas, persona]
    set({ personas, persona, activePersonaIndex: personas.length - 1 })
    debouncedSave()
  },
  updatePersona: (index, p) => {
    const personas = [...get().personas]
    if (!personas[index]) return
    personas[index] = { ...p, id: personas[index].id }
    const updates: Partial<{ personas: Persona[]; persona: Persona }> = { personas }
    if (index === get().activePersonaIndex) updates.persona = p
    set(updates as { personas: Persona[]; persona: Persona })
    debouncedSave()
  },
  removePersona: (index) => {
    const personas = get().personas
    if (personas.length <= 1) return
    const newPersonas = personas.filter((_, i) => i !== index)
    let activeIdx = get().activePersonaIndex
    if (index === activeIdx) activeIdx = 0
    else if (index < activeIdx) activeIdx--
    set({ personas: newPersonas, persona: newPersonas[activeIdx], activePersonaIndex: activeIdx })
    debouncedSave()
  },
  switchPersona: (index) => {
    const personas = get().personas
    if (index < 0 || index >= personas.length) return
    set({ persona: personas[index], activePersonaIndex: index })
    debouncedSave()
  },
  loadFromStorage: async () => {
    let legacyApiKey = ''
    let shouldPersistNormalizedSettings = false
    try {
      const data = loadSettingsSnapshot()
      if (data) {
        shouldPersistNormalizedSettings = true
        legacyApiKey = data.aiSettings?.apiKey || ''
        const storedPersonas = data.personas?.length ? data.personas : [data.persona || {}]
        const { personas: loadedPersonas, activeIndex } = normalizePersonas(
          storedPersonas,
          data.activePersonaIndex ?? 0,
        )
        set({
          aiSettings: { ...defaultAI, ...data.aiSettings, apiKey: '' },
          ttsSettings: { ...defaultTTS, ...data.ttsSettings },
          persona: loadedPersonas[activeIndex],
          personas: loadedPersonas,
          activePersonaIndex: activeIndex,
          aiConfigured: false,
          theme: data.theme ? { ...defaultTheme, ...data.theme } : { ...defaultTheme },
          themePresetIndex: data.themePresetIndex ?? 0,
        })
      }
    } catch (e) {
      console.warn('load settings:', e)
    }

    try {
      let storedApiKey = await loadApiKey()
      const legacyStoreApiKey = await loadLegacyApiKey()
      let canRemoveLegacyApiKey = !legacyApiKey
      const migrationCandidate = storedApiKey ? '' : legacyApiKey || legacyStoreApiKey

      if (migrationCandidate && (await saveApiKey(migrationCandidate))) {
        storedApiKey = migrationCandidate
        canRemoveLegacyApiKey = true
        await clearLegacyApiKey()
      } else if (storedApiKey) {
        canRemoveLegacyApiKey = true
        if (legacyStoreApiKey) await clearLegacyApiKey()
      }

      const apiKey = storedApiKey || migrationCandidate
      if (apiKey) {
        const current = get()
        set({
          aiSettings: { ...current.aiSettings, apiKey },
          aiConfigured: true,
        })
      }
      if (shouldPersistNormalizedSettings && canRemoveLegacyApiKey) {
        get().saveToStorage()
      }
    } catch {
      /* Tauri runtime or system keychain unavailable */
    }
  },
  saveToStorage: () => {
    const { aiSettings, ttsSettings, persona, personas, activePersonaIndex, theme, themePresetIndex } = get()
    saveSettingsSnapshot({ aiSettings, ttsSettings, persona, personas, activePersonaIndex, theme, themePresetIndex })
  },
}))
