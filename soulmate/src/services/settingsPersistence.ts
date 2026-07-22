import { invoke } from '@tauri-apps/api/core'
import { load } from '@tauri-apps/plugin-store'
import type { AISettings, Persona, ThemeColors, TTSSettings } from '../types'

const STORE_PATH = 'soulmate-settings.json'
const STORAGE_KEY = 'soulmate_v3_settings'
const LEGACY_STORAGE_KEY = 'soulmate_v2_settings'

type LegacyAISettings = Partial<AISettings> & { apiKey?: string }

export interface SettingsSnapshot {
  aiSettings?: LegacyAISettings
  ttsSettings?: Partial<TTSSettings>
  persona?: Partial<Persona>
  personas?: Partial<Persona>[]
  activePersonaIndex?: number
  theme?: Partial<ThemeColors>
  themePresetIndex?: number
}

export interface SettingsSnapshotInput {
  aiSettings: AISettings
  ttsSettings: TTSSettings
  persona: Persona
  personas: Persona[]
  activePersonaIndex: number
  theme: ThemeColors
  themePresetIndex: number
}

export interface LoadedSettingsSnapshot {
  snapshot: SettingsSnapshot
  source: 'database' | 'local'
}

let tauriStore: Awaited<ReturnType<typeof load>> | null = null
let storeLoading: Promise<void> | null = null

export async function loadSettingsSnapshot(): Promise<LoadedSettingsSnapshot | null> {
  try {
    const raw = await invoke<string | null>('get_settings')
    const snapshot = parseSnapshot(raw)
    if (snapshot) return { snapshot, source: 'database' }
  } catch (error) {
    console.warn('Failed to load settings from database:', error)
  }

  const current = parseSnapshot(localStorage.getItem(STORAGE_KEY))
  if (current) return { snapshot: current, source: 'local' }

  const legacy = parseSnapshot(localStorage.getItem(LEGACY_STORAGE_KEY))
  if (!legacy) return null

  return {
    source: 'local',
    snapshot: {
      aiSettings: legacy.aiSettings,
      ttsSettings: legacy.ttsSettings,
      persona: legacy.persona,
      personas: legacy.persona ? [legacy.persona] : undefined,
      activePersonaIndex: 0,
    },
  }
}

export async function saveSettingsSnapshot(snapshot: SettingsSnapshotInput): Promise<void> {
  await invoke('save_settings', { settingsJson: JSON.stringify(snapshot) })
}

export function clearLocalSettingsSnapshots(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(LEGACY_STORAGE_KEY)
}

export function loadLegacyLocalApiKey(): string {
  const current = parseSnapshot(localStorage.getItem(STORAGE_KEY))
  const legacy = parseSnapshot(localStorage.getItem(LEGACY_STORAGE_KEY))
  return current?.aiSettings?.apiKey || legacy?.aiSettings?.apiKey || ''
}

export async function hasApiKey(): Promise<boolean> {
  try {
    return await invoke<boolean>('has_api_key')
  } catch {
    return false
  }
}

export async function saveApiKey(apiKey: string): Promise<boolean> {
  try {
    await invoke('save_api_key', { apiKey })
    return true
  } catch (error) {
    console.warn('Failed to save API key to system keychain:', error)
    return false
  }
}

export async function loadLegacyApiKey(): Promise<string> {
  try {
    const store = await getStore()
    return (await store.get<string>('apiKey')) || ''
  } catch {
    return ''
  }
}

export async function clearLegacyApiKey(): Promise<void> {
  try {
    const store = await getStore()
    await store.delete('apiKey')
    await store.save()
  } catch (error) {
    console.warn('Failed to clear legacy API key:', error)
  }
}

export async function deletePersonaData(personaId: string, snapshot: SettingsSnapshotInput): Promise<void> {
  await invoke('delete_persona', { personaId, settingsJson: JSON.stringify(snapshot) })
}

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

function parseSnapshot(raw: string | null): SettingsSnapshot | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as SettingsSnapshot) : null
  } catch (error) {
    console.warn('Failed to parse settings:', error)
    return null
  }
}
