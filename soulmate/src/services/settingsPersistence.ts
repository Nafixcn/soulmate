import { invoke } from '@tauri-apps/api/core'
import { load } from '@tauri-apps/plugin-store'
import type { AISettings, Persona, ThemeColors, TTSSettings } from '../types'

const STORE_PATH = 'soulmate-settings.json'
const STORAGE_KEY = 'soulmate_v3_settings'
const LEGACY_STORAGE_KEY = 'soulmate_v2_settings'

export interface SettingsSnapshot {
  aiSettings?: Partial<AISettings>
  ttsSettings?: Partial<TTSSettings>
  persona?: Partial<Persona>
  personas?: Partial<Persona>[]
  activePersonaIndex?: number
  theme?: Partial<ThemeColors>
  themePresetIndex?: number
}

interface SettingsSnapshotInput {
  aiSettings: AISettings
  ttsSettings: TTSSettings
  persona: Persona
  personas: Persona[]
  activePersonaIndex: number
  theme: ThemeColors
  themePresetIndex: number
}

let tauriStore: Awaited<ReturnType<typeof load>> | null = null
let storeLoading: Promise<void> | null = null

export function loadSettingsSnapshot(): SettingsSnapshot | null {
  const current = parseSnapshot(localStorage.getItem(STORAGE_KEY))
  if (current) return current

  const legacy = parseSnapshot(localStorage.getItem(LEGACY_STORAGE_KEY))
  if (!legacy) return null

  return {
    aiSettings: legacy.aiSettings,
    ttsSettings: legacy.ttsSettings,
    persona: legacy.persona,
    personas: legacy.persona ? [legacy.persona] : undefined,
    activePersonaIndex: 0,
  }
}

export function saveSettingsSnapshot(snapshot: SettingsSnapshotInput): void {
  const { apiKey, ...safeAISettings } = snapshot.aiSettings
  void apiKey

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...snapshot,
        aiSettings: safeAISettings,
      }),
    )
  } catch {
    console.warn('localStorage 已满，头像可能过大，请使用小于500KB的图片')
  }
}

export async function loadApiKey(): Promise<string> {
  try {
    return (await invoke<string | null>('load_api_key')) || ''
  } catch {
    return ''
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
    return JSON.parse(raw) as SettingsSnapshot
  } catch (error) {
    console.warn('Failed to parse settings:', error)
    return null
  }
}
