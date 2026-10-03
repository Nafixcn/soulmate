import { create } from 'zustand'
import {
  AISettings,
  TTSSettings,
  Persona,
  DEFAULT_PERSONA,
  DEFAULT_USER_PROFILE,
  ThemeColors,
  THEME_PRESETS,
  type GreetingSettings,
  type UserProfile,
} from '../types'
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
import { DEFAULT_MODEL_PROVIDER, MODEL_PROVIDERS, normalizeSavedModel } from '../domain/modelProvider'

interface SettingsStore {
  aiSettings: AISettings
  ttsSettings: TTSSettings
  persona: Persona
  personas: Persona[]
  activePersonaIndex: number
  aiConfigured: boolean
  theme: ThemeColors
  themePresetIndex: number
  appIcon: string
  persistenceError: string | null
  userProfile: UserProfile
  onboardingCompleted: boolean
  greetingSettings: GreetingSettings

  setAISettings: (settings: Partial<AISettings>) => void
  setApiKey: (apiKey: string) => Promise<boolean>
  setTTSSettings: (settings: Partial<TTSSettings>) => void
  setPersona: (persona: Persona) => void
  advancePersonaRelationship: (personaId: string, relationshipStage: Persona['relationshipStage']) => boolean
  applyPreset: (index: number) => void
  applyThemePreset: (index: number) => void
  setTheme: (colors: ThemeColors) => void
  setAppIcon: (icon: string) => void
  loadFromStorage: () => Promise<void>
  saveToStorage: () => Promise<boolean>
  clearPersistenceError: () => void
  setUserProfile: (profile: Partial<UserProfile>) => void
  completeOnboarding: () => Promise<boolean>
  setGreetingSettings: (settings: Partial<GreetingSettings>) => void
  addPersona: (persona: Persona) => void
  updatePersona: (index: number, persona: Persona) => void
  removePersona: (index: number) => Promise<boolean>
  switchPersona: (index: number) => void
}

const defaultAI: AISettings = {
  endpoint: DEFAULT_MODEL_PROVIDER.endpoint,
  model: DEFAULT_MODEL_PROVIDER.models[0],
  temperature: 0.6,
  maxTokens: 1024,
  autoProgress: false,
  evalInterval: 20,
  useWebSearch: false,
  memoryEnabled: true,
  memoryExtractionInterval: 6,
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

const defaultGreetingSettings: GreetingSettings = {
  enabled: true,
  dailyCount: 2,
  quietStart: 22,
  quietEnd: 9,
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let persistenceBlockCount = 0
let saveRequestedWhileBlocked = false
// Read snapshots inside the queue, after preceding deletions have updated the store.
let persistenceOperationQueue: Promise<void> = Promise.resolve()

function enqueueSettingsPersistence<T>(operation: () => Promise<T>): Promise<T> {
  const queued = persistenceOperationQueue.then(operation)
  persistenceOperationQueue = queued.then(
    () => undefined,
    () => undefined,
  )
  return queued
}

function snapshotFromState(state: SettingsStore): SettingsSnapshotInput {
  return {
    aiSettings: state.aiSettings,
    ttsSettings: state.ttsSettings,
    persona: state.persona,
    personas: state.personas,
    activePersonaIndex: state.activePersonaIndex,
    theme: state.theme,
    themePresetIndex: state.themePresetIndex,
    appIcon: state.appIcon,
    userProfile: state.userProfile,
    onboardingCompleted: state.onboardingCompleted,
    greetingSettings: state.greetingSettings,
  }
}

function withoutPersona(state: SettingsStore, personaId: string) {
  const personas = state.personas.filter((persona) => persona.id !== personaId)
  const activeId = state.personas[state.activePersonaIndex]?.id
  const activePersonaIndex = Math.max(
    0,
    personas.findIndex((persona) => persona.id === activeId),
  )
  return { personas, persona: personas[activePersonaIndex], activePersonaIndex }
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

async function refreshApiKeyStatus(endpoint: string): Promise<void> {
  const configured = isLocalEndpoint(endpoint) || (await hasApiKey(endpoint))
  if (useSettingsStore.getState().aiSettings.endpoint === endpoint) {
    useSettingsStore.setState({ aiConfigured: configured })
  }
}

function isLocalEndpoint(endpoint: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(new URL(endpoint).hostname)
  } catch {
    return false
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
  appIcon: '✦',
  persistenceError: null,
  userProfile: { ...DEFAULT_USER_PROFILE },
  onboardingCompleted: false,
  greetingSettings: { ...defaultGreetingSettings },

  setAISettings: (partial) => {
    const previousEndpoint = get().aiSettings.endpoint
    const aiSettings = { ...get().aiSettings, ...partial }
    set({
      aiSettings,
      ...(aiSettings.endpoint !== previousEndpoint ? { aiConfigured: false } : {}),
    })
    if (aiSettings.endpoint !== previousEndpoint) void refreshApiKeyStatus(aiSettings.endpoint)
    debouncedSave()
  },
  setApiKey: async (apiKey) => {
    const endpoint = get().aiSettings.endpoint
    const saved = await saveApiKey(endpoint, apiKey.trim())
    if (saved && get().aiSettings.endpoint === endpoint) {
      set({ aiConfigured: apiKey.trim().length > 0, persistenceError: null })
    } else if (!saved) {
      set({ persistenceError: 'API Key 无法写入系统钥匙串' })
    }
    return saved
  },
  setTTSSettings: (partial) => {
    set((state) => ({ ttsSettings: { ...state.ttsSettings, ...partial } }))
    debouncedSave()
  },
  setUserProfile: (partial) => {
    set((state) => ({ userProfile: { ...state.userProfile, ...partial } }))
    debouncedSave()
  },
  completeOnboarding: async () => {
    set({ onboardingCompleted: true })
    if (await get().saveToStorage()) return true
    set({ onboardingCompleted: false })
    return false
  },
  setGreetingSettings: (partial) => {
    set((state) => ({
      greetingSettings: {
        ...state.greetingSettings,
        ...partial,
        dailyCount: Math.max(0, Math.min(4, partial.dailyCount ?? state.greetingSettings.dailyCount)),
      },
    }))
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
  advancePersonaRelationship: (personaId, relationshipStage) => {
    const state = get()
    const index = state.personas.findIndex((persona) => persona.id === personaId)
    if (index < 0) return false

    const updatedPersona = { ...state.personas[index], relationshipStage }
    const personas = [...state.personas]
    personas[index] = updatedPersona
    set({
      personas,
      ...(index === state.activePersonaIndex ? { persona: updatedPersona } : {}),
    })
    debouncedSave()
    return true
  },
  applyPreset: (index) => {
    const preset = MODEL_PROVIDERS[index]
    if (!preset) return
    const previousEndpoint = get().aiSettings.endpoint
    const endpoint = preset.endpoint
    set((state) => ({
      aiSettings: {
        ...state.aiSettings,
        endpoint,
        model: preset.models[0] || (preset.id === 'custom' ? '' : state.aiSettings.model),
      },
      ...(endpoint !== previousEndpoint ? { aiConfigured: false } : {}),
    }))
    if (endpoint !== previousEndpoint) void refreshApiKeyStatus(endpoint)
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
  setAppIcon: (icon) => {
    set({ appIcon: icon.slice(0, 12) })
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
    const removedPersonaId = get().personas[index]?.id
    if (!removedPersonaId || get().personas.length <= 1) return false

    blockDebouncedPersistence()
    try {
      return await enqueueSettingsPersistence(async () => {
        const state = get()
        if (state.personas.length <= 1 || !state.personas.some((persona) => persona.id === removedPersonaId)) {
          return false
        }
        try {
          const nextState = { ...state, ...withoutPersona(state, removedPersonaId) }
          await deletePersonaData(removedPersonaId, snapshotFromState(nextState))
        } catch (error) {
          console.error('Failed to delete persona:', error)
          set({ persistenceError: '角色删除失败，聊天记录未被修改' })
          return false
        }

        const latest = get()
        set({ ...withoutPersona(latest, removedPersonaId), persistenceError: null })
        if (latest !== state) {
          try {
            await saveSettingsSnapshot(snapshotFromState(get()))
          } catch (error) {
            console.error('Failed to save settings after persona deletion:', error)
            set({ persistenceError: '角色已删除，但设置保存失败，请稍后重试' })
          }
        }
        return true
      })
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
    let modelMigrated = false

    try {
      const loaded = await loadSettingsSnapshot()
      if (loaded) {
        loadedFromLocal = loaded.source === 'local'
        const data = loaded.snapshot
        const { apiKey, ...storedAISettings } = data.aiSettings || {}
        legacyApiKey = apiKey || legacyApiKey
        const model = normalizeSavedModel(
          storedAISettings.endpoint || defaultAI.endpoint,
          storedAISettings.model || defaultAI.model,
        )
        modelMigrated = Boolean(storedAISettings.model && storedAISettings.model !== model)
        const storedPersonas = data.personas?.length ? data.personas : [data.persona || {}]
        const { personas, activeIndex } = normalizePersonas(storedPersonas, data.activePersonaIndex ?? 0)
        set({
          aiSettings: {
            ...defaultAI,
            ...storedAISettings,
            model,
          },
          ttsSettings: { ...defaultTTS, ...data.ttsSettings },
          persona: personas[activeIndex],
          personas,
          activePersonaIndex: activeIndex,
          theme: data.theme ? { ...defaultTheme, ...data.theme } : { ...defaultTheme },
          themePresetIndex: data.themePresetIndex ?? 0,
          appIcon: typeof data.appIcon === 'string' ? data.appIcon.slice(0, 12) : '✦',
          userProfile: { ...DEFAULT_USER_PROFILE, ...data.userProfile },
          onboardingCompleted: data.onboardingCompleted ?? true,
          greetingSettings: { ...defaultGreetingSettings, ...data.greetingSettings },
        })
      }
    } catch (error) {
      console.warn('Failed to load settings:', error)
      set({ persistenceError: '设置加载失败，已使用默认配置' })
    }

    const endpoint = get().aiSettings.endpoint
    let configured = isLocalEndpoint(endpoint) || (await hasApiKey(endpoint))
    const legacyStoreApiKey = await loadLegacyApiKey()
    const migrationCandidate = configured ? '' : legacyApiKey || legacyStoreApiKey

    if (migrationCandidate && (await saveApiKey(endpoint, migrationCandidate))) {
      configured = true
      await clearLegacyApiKey()
    } else if (configured && legacyStoreApiKey) {
      await clearLegacyApiKey()
    }
    set({ aiConfigured: configured })

    if (loadedFromLocal || modelMigrated) {
      const persisted = await get().saveToStorage()
      if (loadedFromLocal && persisted && (!legacyApiKey || configured)) clearLocalSettingsSnapshots()
    } else if (configured && legacyApiKey) {
      clearLocalSettingsSnapshots()
    }
  },
  saveToStorage: () =>
    enqueueSettingsPersistence(async () => {
      try {
        await saveSettingsSnapshot(snapshotFromState(get()))
        set({ persistenceError: null })
        return true
      } catch (error) {
        console.error('Failed to save settings:', error)
        set({ persistenceError: '设置保存失败，请稍后重试' })
        return false
      }
    }),
  clearPersistenceError: () => set({ persistenceError: null }),
}))
