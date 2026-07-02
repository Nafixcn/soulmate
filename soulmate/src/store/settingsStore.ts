import { create } from 'zustand'
import { AISettings, TTSSettings, Persona, API_PRESETS, DEFAULT_PERSONA } from '../types'
import { load } from '@tauri-apps/plugin-store'

const STORE_PATH = 'soulmate-settings.json'
let tauriStore: Awaited<ReturnType<typeof load>> | null = null
let storeLoading: Promise<void> | null = null

async function getStore() {
  if (tauriStore) return tauriStore
  if (!storeLoading) {
    storeLoading = (async () => {
      tauriStore = await load(STORE_PATH, { autoSave: false, defaults: {} })
    })()
  }
  await storeLoading
  return tauriStore!
}

async function loadApiKeyFromStore(): Promise<string> {
  try {
    const s = await getStore()
    const key = await s.get<string>('apiKey')
    return key || ''
  } catch {
    return ''
  }
}

async function saveApiKeyToStore(apiKey: string) {
  try {
    const s = await getStore()
    await s.set('apiKey', apiKey || '')
    await s.save()
  } catch (e) {
    console.warn('Failed to save API key to store:', e)
  }
}

interface SettingsStore {
  aiSettings: AISettings
  ttsSettings: TTSSettings
  persona: Persona
  personas: Persona[]
  activePersonaIndex: number
  aiConfigured: boolean

  setAISettings: (s: Partial<AISettings>) => void
  setTTSSettings: (s: Partial<TTSSettings>) => void
  setPersona: (p: Persona) => void
  applyPreset: (index: number) => void
  loadFromStorage: () => void
  saveToStorage: () => void
  addPersona: (p: Persona) => void
  updatePersona: (index: number, p: Persona) => void
  removePersona: (index: number) => void
  switchPersona: (index: number) => void
}

const STORAGE_KEY = 'soulmate_v3_settings'

const defaultAI: AISettings = {
  apiKey: '',
  endpoint: API_PRESETS[0].endpoint,
  model: API_PRESETS[0].models[0],
  temperature: 0.85,
  maxTokens: 512,
  autoProgress: false,
}

const defaultTTS: TTSSettings = {
  enabled: false,
  autoPlay: false,
  rate: 1.1,
  pitch: 1.2,
  voiceURI: ''
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const { aiSettings, ttsSettings, persona, personas, activePersonaIndex } = useSettingsStore.getState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ aiSettings, ttsSettings, persona, personas, activePersonaIndex }))
    saveTimer = null
  }, 300)
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  aiSettings: defaultAI,
  ttsSettings: defaultTTS,
  persona: { ...DEFAULT_PERSONA },
  personas: [{ ...DEFAULT_PERSONA }],
  activePersonaIndex: 0,
  aiConfigured: false,

  setAISettings: (partial) => {
    const current = get().aiSettings
    const merged = { ...current, ...partial }
    const hasKey = !!merged.apiKey
    set({ aiSettings: merged, aiConfigured: hasKey })
    if (partial.apiKey !== undefined) {
      saveApiKeyToStore(merged.apiKey)
    }
    debouncedSave()
  },
  setTTSSettings: (partial) => {
    set(s => ({ ttsSettings: { ...s.ttsSettings, ...partial } }))
    debouncedSave()
  },
  setPersona: (persona) => {
    set({ persona })
    const idx = get().activePersonaIndex
    const personas = [...get().personas]
    if (personas[idx]) {
      personas[idx] = persona
      set({ personas })
    }
    debouncedSave()
  },
  applyPreset: (index) => {
    const preset = API_PRESETS[index]
    if (!preset) return
    set(s => ({
      aiSettings: { ...s.aiSettings, endpoint: preset.endpoint || s.aiSettings.endpoint, model: preset.models[0] || s.aiSettings.model }
    }))
    debouncedSave()
  },
  addPersona: (p) => {
    const personas = [...get().personas, p]
    set({ personas, persona: p, activePersonaIndex: personas.length - 1 })
    debouncedSave()
  },
  updatePersona: (index, p) => {
    const personas = [...get().personas]
    personas[index] = p
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
  loadFromStorage: () => {
    try {
      let raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        const oldRaw = localStorage.getItem('soulmate_v2_settings')
        if (oldRaw) {
          const old = JSON.parse(oldRaw)
          raw = JSON.stringify({
            aiSettings: old.aiSettings || defaultAI,
            ttsSettings: old.ttsSettings || defaultTTS,
            persona: old.persona || DEFAULT_PERSONA,
            personas: [old.persona || DEFAULT_PERSONA],
            activePersonaIndex: 0,
          })
        }
      }
      if (raw) {
        const data = JSON.parse(raw)
        const loadedPersonas: Persona[] = data.personas?.length ? data.personas : [{ ...DEFAULT_PERSONA }]
        const activeIdx = data.activePersonaIndex ?? 0
        set({
          aiSettings: { ...defaultAI, ...data.aiSettings },
          ttsSettings: { ...defaultTTS, ...data.ttsSettings },
          persona: { ...DEFAULT_PERSONA, ...data.persona },
          personas: loadedPersonas.map((p: Persona) => ({ ...DEFAULT_PERSONA, ...p })),
          activePersonaIndex: Math.min(activeIdx, loadedPersonas.length - 1),
          aiConfigured: !!(data.aiSettings?.apiKey),
        })
      }
    } catch (e) { console.warn('load settings:', e) }

    loadApiKeyFromStore().then(apiKey => {
      if (apiKey) {
        const current = get()
        set({
          aiSettings: { ...current.aiSettings, apiKey },
          aiConfigured: true,
        })
      }
    })
  },
  saveToStorage: () => {
    const { aiSettings, ttsSettings, persona, personas, activePersonaIndex } = get()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ aiSettings, ttsSettings, persona, personas, activePersonaIndex }))
  }
}))
