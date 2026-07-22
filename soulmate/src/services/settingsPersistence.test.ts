import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearLegacyApiKey,
  loadApiKey,
  loadLegacyApiKey,
  loadSettingsSnapshot,
  saveApiKey,
  saveSettingsSnapshot,
} from './settingsPersistence'
import type { AISettings, Persona, TTSSettings, ThemeColors } from '../types'

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
  apiKey: 'secret-key',
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

describe('settings persistence', () => {
  let values: Map<string, string>

  beforeEach(() => {
    values = new Map()
    vi.clearAllMocks()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
  })

  it('never writes the API key to localStorage', () => {
    saveSettingsSnapshot({
      aiSettings,
      ttsSettings,
      persona,
      personas: [persona],
      activePersonaIndex: 0,
      theme,
      themePresetIndex: 0,
    })

    const raw = values.get('soulmate_v3_settings')
    expect(raw).not.toContain('secret-key')
    expect(loadSettingsSnapshot()?.aiSettings?.model).toBe('model')
  })

  it('loads the legacy settings shape for migration', () => {
    values.set('soulmate_v2_settings', JSON.stringify({ aiSettings, ttsSettings, persona }))

    const snapshot = loadSettingsSnapshot()

    expect(snapshot?.personas).toEqual([persona])
    expect(snapshot?.activePersonaIndex).toBe(0)
  })

  it('reads and writes the API key through the system keychain commands', async () => {
    mocks.invoke.mockResolvedValueOnce('keychain-key').mockResolvedValueOnce(undefined)

    await expect(loadApiKey()).resolves.toBe('keychain-key')
    await expect(saveApiKey('new-key')).resolves.toBe(true)

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'load_api_key')
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'save_api_key', { apiKey: 'new-key' })
  })

  it('returns a safe fallback when the system keychain is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.invoke.mockRejectedValue(new Error('unavailable'))

    await expect(loadApiKey()).resolves.toBe('')
    await expect(saveApiKey('new-key')).resolves.toBe(false)
    warn.mockRestore()
  })

  it('loads and removes the legacy store value after migration', async () => {
    mocks.storeGet.mockResolvedValue('legacy-key')

    await expect(loadLegacyApiKey()).resolves.toBe('legacy-key')
    await clearLegacyApiKey()

    expect(mocks.storeDelete).toHaveBeenCalledWith('apiKey')
    expect(mocks.storeSave).toHaveBeenCalledOnce()
  })
})
