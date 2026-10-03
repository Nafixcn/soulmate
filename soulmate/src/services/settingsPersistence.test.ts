import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearLegacyApiKey,
  clearLocalSettingsSnapshots,
  deletePersonaData,
  hasApiKey,
  loadLegacyApiKey,
  loadLegacyLocalApiKey,
  loadSettingsSnapshot,
  saveApiKey,
  saveSettingsSnapshot,
  type SettingsSnapshotInput,
} from './settingsPersistence'
import { DEFAULT_PERSONA, type AISettings, type Persona, type TTSSettings, type ThemeColors } from '../types'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  storeGet: vi.fn(),
  storeDelete: vi.fn(),
  storeSave: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(async () => ({
    get: mocks.storeGet,
    delete: mocks.storeDelete,
    save: mocks.storeSave,
  })),
}))

const aiSettings: AISettings = {
  endpoint: 'https://example.com',
  model: 'model',
  temperature: 0.6,
  maxTokens: 1024,
  autoProgress: false,
  evalInterval: 20,
  useWebSearch: false,
}

const ttsSettings: TTSSettings = {
  enabled: false,
  autoPlay: false,
  rate: 1,
  pitch: 1,
  voiceURI: '',
}

const persona: Persona = {
  ...DEFAULT_PERSONA,
  id: 'persona-1',
  name: '灵伴',
  age: 20,
  personality: '温柔体贴',
  hobby: '音乐',
  nickname: '哥哥',
  speakingStyle: '自然',
  relationshipStage: '朋友',
  emoji: '🌸',
  hairColor: '',
  eyeColor: '',
  avatar: '',
}

const theme: ThemeColors = {
  primary: '#000',
  bg: '#fff',
  chatBg: '#fff',
  userBubble: '#000',
  aiBubble: '#fff',
  text: '#000',
  subText: '#777',
  petals: [],
}

const snapshot: SettingsSnapshotInput = {
  aiSettings,
  ttsSettings,
  persona,
  personas: [persona],
  activePersonaIndex: 0,
  theme,
  themePresetIndex: 0,
  appIcon: '✦',
}

describe('settings persistence', () => {
  let values: Map<string, string>

  beforeEach(() => {
    values = new Map()
    vi.clearAllMocks()
    mocks.invoke.mockResolvedValue(undefined)
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
  })

  it('stores non-sensitive settings in SQLite', async () => {
    await saveSettingsSnapshot(snapshot)

    expect(mocks.invoke).toHaveBeenCalledWith('save_settings', {
      settingsJson: JSON.stringify(snapshot),
    })
    expect(JSON.stringify(snapshot)).not.toContain('apiKey')
  })

  it('serializes writes so an older snapshot cannot finish after a newer one', async () => {
    let finishFirst: (() => void) | undefined
    mocks.invoke.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve
        }),
    )
    const older = saveSettingsSnapshot({ ...snapshot, aiSettings: { ...aiSettings, model: 'older' } })
    const newer = saveSettingsSnapshot({ ...snapshot, aiSettings: { ...aiSettings, model: 'newer' } })

    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1))
    finishFirst?.()
    await older
    await newer

    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'save_settings', {
      settingsJson: expect.stringContaining('"model":"newer"'),
    })
  })

  it('loads settings from SQLite before local migration data', async () => {
    mocks.invoke.mockResolvedValueOnce(JSON.stringify(snapshot))
    values.set('soulmate_v3_settings', JSON.stringify({ aiSettings: { model: 'legacy' } }))

    const loaded = await loadSettingsSnapshot()

    expect(loaded?.source).toBe('database')
    expect(loaded?.snapshot.aiSettings?.model).toBe('model')
  })

  it('loads the legacy settings shape for migration', async () => {
    mocks.invoke.mockResolvedValueOnce(null)
    values.set(
      'soulmate_v2_settings',
      JSON.stringify({ aiSettings: { ...aiSettings, apiKey: 'legacy-key' }, ttsSettings, persona }),
    )

    const loaded = await loadSettingsSnapshot()

    expect(loaded?.source).toBe('local')
    expect(loaded?.snapshot.personas).toEqual([persona])
    expect(loaded?.snapshot.aiSettings?.apiKey).toBe('legacy-key')
    expect(loadLegacyLocalApiKey()).toBe('legacy-key')
  })

  it('only exposes keychain configuration state to the frontend', async () => {
    mocks.invoke.mockResolvedValueOnce(true).mockResolvedValueOnce(undefined)

    await expect(hasApiKey('https://api.example.com/v1/chat')).resolves.toBe(true)
    await expect(saveApiKey('https://api.example.com/v1/chat', 'new-key')).resolves.toBe(true)

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'has_api_key', {
      endpoint: 'https://api.example.com/v1/chat',
    })
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'save_api_key', {
      endpoint: 'https://api.example.com/v1/chat',
      apiKey: 'new-key',
    })
    expect(mocks.invoke).not.toHaveBeenCalledWith('load_api_key')
  })

  it('returns safe keychain fallbacks when the runtime is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.invoke.mockRejectedValue(new Error('unavailable'))

    await expect(hasApiKey('https://api.example.com/v1/chat')).resolves.toBe(false)
    await expect(saveApiKey('https://api.example.com/v1/chat', 'new-key')).resolves.toBe(false)
    warn.mockRestore()
  })

  it('loads and removes the legacy store value after migration', async () => {
    mocks.storeGet.mockResolvedValue('legacy-key')

    await expect(loadLegacyApiKey()).resolves.toBe('legacy-key')
    await clearLegacyApiKey()

    expect(mocks.storeDelete).toHaveBeenCalledWith('apiKey')
    expect(mocks.storeSave).toHaveBeenCalledOnce()
  })

  it('clears browser snapshots only when migration has succeeded', () => {
    values.set('soulmate_v3_settings', '{}')
    values.set('soulmate_v2_settings', '{}')

    clearLocalSettingsSnapshots()

    expect(values.size).toBe(0)
  })

  it('deletes persona data and updates settings in one backend command', async () => {
    await deletePersonaData(persona.id, snapshot)

    expect(mocks.invoke).toHaveBeenCalledWith('delete_persona', {
      personaId: persona.id,
      settingsJson: JSON.stringify(snapshot),
    })
  })
})
