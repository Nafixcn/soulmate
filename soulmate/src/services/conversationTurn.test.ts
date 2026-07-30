import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PERSONA, type AISettings, type TTSSettings } from '../types'

const mocks = vi.hoisted(() => ({
  prepareConversation: vi.fn(),
  streamCompletion: vi.fn(),
  saveMessage: vi.fn(),
  speak: vi.fn(),
}))

vi.mock('./conversationService', () => ({ prepareConversation: mocks.prepareConversation }))
vi.mock('./conversationGateway', () => ({
  conversationGateway: {
    streamCompletion: mocks.streamCompletion,
    saveMessage: mocks.saveMessage,
  },
}))
vi.mock('./ttsService', () => ({ speak: mocks.speak }))

import { runConversationTurn } from './conversationTurn'

const aiSettings: AISettings = {
  endpoint: 'https://example.com/v1/chat',
  model: 'test-model',
  temperature: 0.6,
  maxTokens: 512,
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

describe('conversation turn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prepareConversation.mockResolvedValue([{ role: 'system', content: 'prompt' }])
    mocks.saveMessage.mockResolvedValue(undefined)
    mocks.speak.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('retries the completion and persists the successful reply', async () => {
    vi.useFakeTimers()
    mocks.streamCompletion
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ content: '你好呀', thinking: '思考中' })

    const turn = runConversationTurn({
      messages: [],
      query: '你好',
      persona: DEFAULT_PERSONA,
      aiSettings,
      ttsSettings,
      requestId: 'request-1',
      signal: new AbortController().signal,
      isCurrent: () => true,
      onChunk: vi.fn(),
      onSpeakingChange: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(1500)
    const result = await turn

    expect(mocks.streamCompletion).toHaveBeenCalledTimes(2)
    expect(mocks.saveMessage).toHaveBeenCalledWith(
      DEFAULT_PERSONA.id,
      expect.objectContaining({ role: 'assistant', content: '你好呀', thinking: '思考中' }),
    )
    expect(result?.persistenceError).toBeNull()
  })

  it('does not restart a completion when cancelled during the retry delay', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    mocks.streamCompletion.mockRejectedValueOnce(new Error('temporary failure'))

    const turn = runConversationTurn({
      messages: [],
      query: '取消重试',
      persona: DEFAULT_PERSONA,
      aiSettings,
      ttsSettings,
      requestId: 'request-cancelled-during-retry',
      signal: controller.signal,
      isCurrent: () => true,
      onChunk: vi.fn(),
      onSpeakingChange: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)
    controller.abort()
    await vi.runAllTimersAsync()

    await expect(turn).resolves.toBeNull()
    expect(mocks.streamCompletion).toHaveBeenCalledTimes(1)
  })

  it('returns the reply with a warning when persistence fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.streamCompletion.mockResolvedValueOnce({ content: '已经收到', thinking: '' })
    mocks.saveMessage.mockRejectedValueOnce(new Error('database unavailable'))

    const result = await runConversationTurn({
      messages: [],
      query: '测试',
      persona: DEFAULT_PERSONA,
      aiSettings,
      ttsSettings,
      requestId: 'request-2',
      signal: new AbortController().signal,
      isCurrent: () => true,
      onChunk: vi.fn(),
      onSpeakingChange: vi.fn(),
    })

    expect(result?.message.content).toBe('已经收到')
    expect(result?.persistenceError).toBe('回复已生成，但保存失败，重启后可能丢失')
  })

  it('starts speech only when automatic playback is enabled', async () => {
    mocks.streamCompletion.mockResolvedValueOnce({ content: '晚安', thinking: '' })
    const onSpeakingChange = vi.fn()

    await runConversationTurn({
      messages: [],
      query: '晚安',
      persona: DEFAULT_PERSONA,
      aiSettings,
      ttsSettings: { ...ttsSettings, enabled: true, autoPlay: true },
      requestId: 'request-3',
      signal: new AbortController().signal,
      isCurrent: () => true,
      onChunk: vi.fn(),
      onSpeakingChange,
    })
    await Promise.resolve()

    expect(mocks.speak).toHaveBeenCalledWith('晚安', expect.objectContaining({ autoPlay: true }))
    expect(onSpeakingChange).toHaveBeenNthCalledWith(1, true)
    expect(onSpeakingChange).toHaveBeenLastCalledWith(false)
  })
})
