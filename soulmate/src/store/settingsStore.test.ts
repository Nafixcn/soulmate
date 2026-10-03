import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PERSONA } from '../types'

const mocks = vi.hoisted(() => ({
  clearLegacyApiKey: vi.fn(),
  clearLocalSettingsSnapshots: vi.fn(),
  deletePersonaData: vi.fn(),
  hasApiKey: vi.fn(),
  loadLegacyLocalApiKey: vi.fn(),
  loadLegacyApiKey: vi.fn(),
  loadSettingsSnapshot: vi.fn(),
  saveApiKey: vi.fn(),
  saveSettingsSnapshot: vi.fn(),
}))

vi.mock('../services/settingsPersistence', () => mocks)

import { useSettingsStore } from './settingsStore'

describe('settings store persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.hasApiKey.mockResolvedValue(false)
    mocks.loadLegacyApiKey.mockResolvedValue('')
    mocks.loadLegacyLocalApiKey.mockReturnValue('')
    mocks.loadSettingsSnapshot.mockResolvedValue(null)
    mocks.saveSettingsSnapshot.mockResolvedValue(undefined)
    useSettingsStore.setState({
      persona: { ...DEFAULT_PERSONA },
      personas: [{ ...DEFAULT_PERSONA }],
      activePersonaIndex: 0,
      aiConfigured: false,
      persistenceError: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps a persona when its transactional deletion fails', async () => {
    const secondPersona = { ...DEFAULT_PERSONA, id: 'second', name: '小雨' }
    useSettingsStore.setState({ personas: [{ ...DEFAULT_PERSONA }, secondPersona] })
    mocks.deletePersonaData.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(useSettingsStore.getState().removePersona(1)).resolves.toBe(false)

    expect(useSettingsStore.getState().personas).toHaveLength(2)
    expect(useSettingsStore.getState().persistenceError).toBe('角色删除失败，聊天记录未被修改')
  })

  it('removes a persona only after its transaction succeeds', async () => {
    const secondPersona = { ...DEFAULT_PERSONA, id: 'second', name: '小雨' }
    useSettingsStore.setState({ personas: [{ ...DEFAULT_PERSONA }, secondPersona] })
    mocks.deletePersonaData.mockResolvedValueOnce(undefined)

    await expect(useSettingsStore.getState().removePersona(1)).resolves.toBe(true)

    expect(mocks.deletePersonaData).toHaveBeenCalledOnce()
    expect(useSettingsStore.getState().personas).toEqual([{ ...DEFAULT_PERSONA }])
  })

  it('does not write an old settings snapshot while persona deletion is in flight', async () => {
    const secondPersona = { ...DEFAULT_PERSONA, id: 'second', name: '小雨' }
    let finishDeletion: (() => void) | undefined
    mocks.deletePersonaData.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishDeletion = resolve
        }),
    )
    useSettingsStore.setState({ personas: [{ ...DEFAULT_PERSONA }, secondPersona] })

    useSettingsStore.getState().setAISettings({ temperature: 0.7 })
    const deletion = useSettingsStore.getState().removePersona(1)
    await vi.advanceTimersByTimeAsync(300)

    expect(mocks.saveSettingsSnapshot).not.toHaveBeenCalled()

    finishDeletion?.()
    await expect(deletion).resolves.toBe(true)
  })

  it('preserves edits, additions and selection made while a persona is being deleted', async () => {
    const second = { ...DEFAULT_PERSONA, id: 'second', name: '小雨' }
    const third = { ...DEFAULT_PERSONA, id: 'third', name: '小雪' }
    let finishDeletion!: () => void
    mocks.deletePersonaData.mockImplementationOnce(() => new Promise<void>((resolve) => (finishDeletion = resolve)))
    useSettingsStore.setState({ personas: [{ ...DEFAULT_PERSONA }, second] })
    const deletion = useSettingsStore.getState().removePersona(1)
    await Promise.resolve()

    useSettingsStore.getState().updatePersona(0, { ...DEFAULT_PERSONA, name: '刚改的名字' })
    useSettingsStore.getState().setAISettings({ temperature: 0.9 })
    useSettingsStore.getState().addPersona(third)
    finishDeletion()
    await expect(deletion).resolves.toBe(true)
    await vi.advanceTimersByTimeAsync(300)

    expect(useSettingsStore.getState().personas.map(({ id }) => id)).toEqual([DEFAULT_PERSONA.id, 'third'])
    expect(useSettingsStore.getState().personas[0].name).toBe('刚改的名字')
    expect(useSettingsStore.getState().persona.id).toBe('third')
    expect(useSettingsStore.getState().activePersonaIndex).toBe(1)
    const saved = mocks.saveSettingsSnapshot.mock.calls[mocks.saveSettingsSnapshot.mock.calls.length - 1]?.[0]
    expect(saved).toMatchObject({
      aiSettings: { temperature: 0.9 },
      personas: [{ name: '刚改的名字' }, { id: 'third' }],
      persona: { id: 'third' },
      activePersonaIndex: 1,
    })
  })

  it('serializes concurrent deletions using persona IDs and the latest settings snapshot', async () => {
    const second = { ...DEFAULT_PERSONA, id: 'second' }
    const third = { ...DEFAULT_PERSONA, id: 'third' }
    let finishFirst!: () => void
    mocks.deletePersonaData.mockImplementationOnce(() => new Promise<void>((resolve) => (finishFirst = resolve)))
    mocks.deletePersonaData.mockResolvedValueOnce(undefined)
    useSettingsStore.setState({ personas: [{ ...DEFAULT_PERSONA }, second, third] })

    const first = useSettingsStore.getState().removePersona(1)
    const next = useSettingsStore.getState().removePersona(2)
    await Promise.resolve()
    expect(mocks.deletePersonaData).toHaveBeenCalledTimes(1)
    finishFirst()
    await expect(first).resolves.toBe(true)
    await expect(next).resolves.toBe(true)

    expect(useSettingsStore.getState().personas.map(({ id }) => id)).toEqual([DEFAULT_PERSONA.id])
    expect(mocks.deletePersonaData.mock.calls[1]?.[0]).toBe('third')
    expect(mocks.deletePersonaData.mock.calls[1]?.[1].personas.map(({ id }: { id: string }) => id)).toEqual([
      DEFAULT_PERSONA.id,
    ])
  })

  it('keeps the last persona when simultaneous deletions target both remaining personas', async () => {
    const second = { ...DEFAULT_PERSONA, id: 'second' }
    let finishFirst!: () => void
    mocks.deletePersonaData.mockImplementationOnce(() => new Promise<void>((resolve) => (finishFirst = resolve)))
    useSettingsStore.setState({ personas: [{ ...DEFAULT_PERSONA }, second] })

    const first = useSettingsStore.getState().removePersona(1)
    const last = useSettingsStore.getState().removePersona(0)
    await Promise.resolve()
    finishFirst()
    await expect(first).resolves.toBe(true)
    await expect(last).resolves.toBe(false)

    expect(mocks.deletePersonaData).toHaveBeenCalledTimes(1)
    expect(useSettingsStore.getState().personas.map(({ id }) => id)).toEqual([DEFAULT_PERSONA.id])
  })

  it('does not persist a snapshot containing a persona that is already being deleted', async () => {
    const second = { ...DEFAULT_PERSONA, id: 'second' }
    let finishDeletion!: () => void
    mocks.deletePersonaData.mockImplementationOnce(() => new Promise<void>((resolve) => (finishDeletion = resolve)))
    useSettingsStore.setState({ personas: [{ ...DEFAULT_PERSONA }, second] })

    const deletion = useSettingsStore.getState().removePersona(1)
    const saving = useSettingsStore.getState().saveToStorage()
    await Promise.resolve()
    expect(mocks.saveSettingsSnapshot).not.toHaveBeenCalled()
    finishDeletion()
    await deletion
    await expect(saving).resolves.toBe(true)

    const saved = mocks.saveSettingsSnapshot.mock.calls[mocks.saveSettingsSnapshot.mock.calls.length - 1]?.[0]
    expect(saved.personas.map(({ id }: { id: string }) => id)).toEqual([DEFAULT_PERSONA.id])
  })

  it('does not delete the same persona twice when duplicate operations are queued', async () => {
    const second = { ...DEFAULT_PERSONA, id: 'second' }
    const third = { ...DEFAULT_PERSONA, id: 'third' }
    mocks.deletePersonaData.mockResolvedValue(undefined)
    useSettingsStore.setState({ personas: [{ ...DEFAULT_PERSONA }, second, third] })

    const first = useSettingsStore.getState().removePersona(1)
    const duplicate = useSettingsStore.getState().removePersona(1)

    await expect(first).resolves.toBe(true)
    await expect(duplicate).resolves.toBe(false)
    expect(mocks.deletePersonaData).toHaveBeenCalledTimes(1)
    expect(useSettingsStore.getState().personas.map(({ id }) => id)).toEqual([DEFAULT_PERSONA.id, 'third'])
  })

  it('continues queued deletion after a preceding transaction fails', async () => {
    const second = { ...DEFAULT_PERSONA, id: 'second' }
    const third = { ...DEFAULT_PERSONA, id: 'third' }
    mocks.deletePersonaData.mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce(undefined)
    useSettingsStore.setState({ personas: [{ ...DEFAULT_PERSONA }, second, third] })

    const failed = useSettingsStore.getState().removePersona(1)
    const next = useSettingsStore.getState().removePersona(2)

    await expect(failed).resolves.toBe(false)
    await expect(next).resolves.toBe(true)
    expect(useSettingsStore.getState().personas.map(({ id }) => id)).toEqual([DEFAULT_PERSONA.id, 'second'])
    expect(mocks.deletePersonaData.mock.calls[1]?.[1].personas.map(({ id }: { id: string }) => id)).toEqual([
      DEFAULT_PERSONA.id,
      'second',
    ])
  })

  it('loads only the keychain configuration state', async () => {
    mocks.hasApiKey.mockResolvedValueOnce(true)

    await useSettingsStore.getState().loadFromStorage()

    expect(useSettingsStore.getState().aiConfigured).toBe(true)
    expect(mocks.hasApiKey).toHaveBeenCalledWith(useSettingsStore.getState().aiSettings.endpoint)
    expect(mocks.saveApiKey).not.toHaveBeenCalled()
  })

  it('replaces retired model IDs when loading saved settings', async () => {
    mocks.loadSettingsSnapshot.mockResolvedValueOnce({
      source: 'database',
      snapshot: {
        aiSettings: {
          ...useSettingsStore.getState().aiSettings,
          endpoint: 'https://api.deepseek.com/v1/chat/completions',
          model: 'deepseek-chat',
        },
      },
    })

    await useSettingsStore.getState().loadFromStorage()

    expect(useSettingsStore.getState().aiSettings.model).toBe('deepseek-flash')
  })

  it('refreshes keychain state when the API provider changes', async () => {
    mocks.hasApiKey.mockResolvedValueOnce(true)

    useSettingsStore.getState().setAISettings({ endpoint: 'https://provider.example/v1/chat' })
    await Promise.resolve()

    expect(mocks.hasApiKey).toHaveBeenCalledWith('https://provider.example/v1/chat')
    expect(useSettingsStore.getState().aiConfigured).toBe(true)
  })

  it('stores credentials for the currently selected provider', async () => {
    mocks.saveApiKey.mockResolvedValueOnce(true)
    useSettingsStore.setState({
      aiSettings: { ...useSettingsStore.getState().aiSettings, endpoint: 'https://provider.example/v1/chat' },
    })

    await expect(useSettingsStore.getState().setApiKey(' secret ')).resolves.toBe(true)

    expect(mocks.saveApiKey).toHaveBeenCalledWith('https://provider.example/v1/chat', 'secret')
  })

  it('saves and restores a custom sidebar mark and stage appearance', async () => {
    const persona = {
      ...DEFAULT_PERSONA,
      emoji: '🦊',
      stageAppearance: { 朋友: { label: '知己', icon: '🤝' } },
    }
    useSettingsStore.getState().setPersona(persona)
    useSettingsStore.getState().setAppIcon('🪐')
    await vi.advanceTimersByTimeAsync(300)

    const calls = mocks.saveSettingsSnapshot.mock.calls
    const saved = calls[calls.length - 1]?.[0]
    expect(saved).toMatchObject({
      appIcon: '🪐',
      persona: { emoji: '🦊', stageAppearance: { 朋友: { label: '知己', icon: '🤝' } } },
    })

    mocks.loadSettingsSnapshot.mockResolvedValueOnce({ source: 'database', snapshot: saved })
    await useSettingsStore.getState().loadFromStorage()
    expect(useSettingsStore.getState()).toMatchObject({
      appIcon: '🪐',
      persona: { emoji: '🦊', stageAppearance: { 朋友: { label: '知己', icon: '🤝' } } },
    })
  })
})
