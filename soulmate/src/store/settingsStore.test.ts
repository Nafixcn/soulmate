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

  it('loads only the keychain configuration state', async () => {
    mocks.hasApiKey.mockResolvedValueOnce(true)

    await useSettingsStore.getState().loadFromStorage()

    expect(useSettingsStore.getState().aiConfigured).toBe(true)
    expect(mocks.saveApiKey).not.toHaveBeenCalled()
  })
})
