import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PERSONA, type AISettings, type Message, type MessagePage } from '../types'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  Channel: class {
    onmessage = () => undefined
  },
}))
vi.mock('../services/ttsService', () => ({
  speak: vi.fn(async () => undefined),
  stopSpeaking: vi.fn(),
}))

import { evaluateRelationshipProgress, useChatStore } from './chatStore'
import { useSettingsStore } from './settingsStore'

const messages: Message[] = [
  { id: 'user-1', role: 'user', content: '你好', timestamp: 1 },
  { id: 'assistant-1', role: 'assistant', content: '你好呀', timestamp: 2 },
]

const aiSettings: AISettings = {
  endpoint: 'https://example.com/v1/chat',
  model: 'test-model',
  temperature: 0.6,
  maxTokens: 512,
  autoProgress: true,
  evalInterval: 1,
  useWebSearch: false,
}
const ttsSettings = { enabled: false, autoPlay: false, rate: 1, pitch: 1, voiceURI: '' }

function page(items: Message[], hasMore = false, userMessageCount = 1): MessagePage {
  return { messages: items, hasMore, userMessageCount }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('chat store persistence consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useChatStore.setState({
      messages,
      activePersonaId: 'persona-1',
      isTyping: false,
      error: null,
      hasMore: false,
      isLoadingMore: false,
      isLoadingConversation: false,
      userMsgCount: 1,
      abortController: null,
      requestId: null,
      streamingContent: '',
      streamingThinking: '',
      expression: 'neutral',
      isSpeaking: false,
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('keeps messages visible when deleting from SQLite fails', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(useChatStore.getState().deleteFrom('assistant-1')).resolves.toBe(false)

    expect(useChatStore.getState().messages).toEqual(messages)
    expect(useChatStore.getState().error).toBe('删除失败，聊天记录未被修改')
  })

  it('updates the conversation only after deletion succeeds', async () => {
    mocks.invoke.mockResolvedValueOnce(1)

    await expect(useChatStore.getState().deleteFrom('assistant-1')).resolves.toBe(true)

    expect(useChatStore.getState().messages).toEqual([messages[0]])
    expect(useChatStore.getState().userMsgCount).toBe(1)
  })

  it('keeps messages visible when clearing SQLite fails', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(useChatStore.getState().clearChat()).resolves.toBe(false)

    expect(useChatStore.getState().messages).toEqual(messages)
    expect(useChatStore.getState().error).toBe('清空失败，聊天记录未被修改')
  })

  it.each(['clearChat', 'deleteFrom'] as const)('releases an aborted turn when %s fails', async (operation) => {
    const controller = new AbortController()
    useChatStore.setState({
      isTyping: true,
      requestId: 'old-request',
      abortController: controller,
      streamingContent: '生成中的回复',
    })
    mocks.invoke.mockImplementation((command: string) =>
      command === 'cancel_request' ? Promise.resolve(undefined) : Promise.reject(new Error('database unavailable')),
    )

    await expect(useChatStore.getState()[operation]('assistant-1')).resolves.toBe(false)

    expect(controller.signal.aborted).toBe(true)
    expect(useChatStore.getState()).toMatchObject({
      messages,
      isTyping: false,
      streamingContent: '',
      abortController: null,
      requestId: null,
      isLoadingConversation: false,
    })
  })

  it.each(['clearChat', 'deleteFrom'] as const)(
    'does not overwrite a new conversation when %s fails',
    async (operation) => {
      const deletion = deferred<never>()
      mocks.invoke.mockReturnValueOnce(deletion.promise)
      const pending = useChatStore.getState()[operation]('assistant-1')
      await Promise.resolve()
      const newController = new AbortController()
      useChatStore.setState({
        activePersonaId: 'persona-2',
        isTyping: true,
        requestId: 'new-request',
        abortController: newController,
        streamingContent: '新的回复',
        error: null,
      })

      deletion.reject(new Error('database unavailable'))
      await pending

      expect(useChatStore.getState()).toMatchObject({
        isTyping: true,
        requestId: 'new-request',
        streamingContent: '新的回复',
        error: null,
      })
      expect(newController.signal.aborted).toBe(false)
    },
  )

  it('does not let delayed cancellation clear a new turn', async () => {
    const cancellation = deferred<void>()
    mocks.invoke.mockReturnValueOnce(cancellation.promise)
    useChatStore.setState({ requestId: 'old-request', isTyping: true })
    const pending = useChatStore.getState().cancelRequest()
    useChatStore.setState({ requestId: 'new-request', isTyping: true, streamingContent: '新回复' })

    cancellation.resolve(undefined)
    await pending

    expect(useChatStore.getState()).toMatchObject({
      requestId: 'new-request',
      isTyping: true,
      streamingContent: '新回复',
    })
  })

  it.each(['clearChat', 'deleteFrom'] as const)('does not reset a newer turn after %s succeeds', async (operation) => {
    const deletion = deferred<number | undefined>()
    mocks.invoke.mockReturnValueOnce(deletion.promise)
    const pending = useChatStore.getState()[operation]('assistant-1')
    await Promise.resolve()
    useChatStore.setState({ requestId: 'new-request', isTyping: true, streamingContent: '新回复' })

    deletion.resolve(operation === 'deleteFrom' ? 1 : undefined)
    await pending

    expect(useChatStore.getState()).toMatchObject({
      requestId: 'new-request',
      isTyping: true,
      streamingContent: '新回复',
    })
  })

  it.each(['clearChat', 'deleteFrom'] as const)(
    'blocks sending a new message while %s is being persisted',
    async (operation) => {
      const deletion = deferred<number | undefined>()
      mocks.invoke.mockReturnValueOnce(deletion.promise)
      const pending = useChatStore.getState()[operation]('assistant-1')
      await Promise.resolve()

      await expect(
        useChatStore.getState().sendMessage('新消息', { ...DEFAULT_PERSONA, id: 'persona-1' }, aiSettings, ttsSettings),
      ).resolves.toBe(false)
      expect(mocks.invoke.mock.calls.some(([command]) => command === 'save_message')).toBe(false)

      deletion.resolve(operation === 'deleteFrom' ? 1 : undefined)
      await pending
      expect(useChatStore.getState().isLoadingConversation).toBe(false)
    },
  )

  it('loads a stable backend page and its total user count', async () => {
    mocks.invoke.mockResolvedValueOnce(page(messages, true, 52))

    await useChatStore.getState().loadMessages('persona-1')

    expect(mocks.invoke).toHaveBeenCalledWith('get_messages', { personaId: 'persona-1', limit: 100 })
    expect(useChatStore.getState().hasMore).toBe(true)
    expect(useChatStore.getState().userMsgCount).toBe(52)
  })

  it('keeps messages added while an earlier page is loading', async () => {
    let resolvePage!: (value: MessagePage) => void
    mocks.invoke.mockReturnValueOnce(new Promise<MessagePage>((resolve) => (resolvePage = resolve)))
    const loading = useChatStore.getState().loadEarlierMessages()
    const newMessage: Message = { id: 'new-reply', role: 'assistant', content: '新回复', timestamp: 3 }
    useChatStore.setState({ messages: [...messages, newMessage] })

    resolvePage(page([{ id: 'old', role: 'user', content: '旧消息', timestamp: 0 }], false, 1))
    await loading

    expect(useChatStore.getState().messages.map((message) => message.id)).toEqual([
      'old',
      'user-1',
      'assistant-1',
      'new-reply',
    ])
  })

  it('discards an earlier page after the conversation is cleared', async () => {
    let resolvePage!: (value: MessagePage) => void
    mocks.invoke.mockImplementation((command: string) =>
      command === 'get_messages'
        ? new Promise<MessagePage>((resolve) => (resolvePage = resolve))
        : Promise.resolve(undefined),
    )
    const loading = useChatStore.getState().loadEarlierMessages()
    await expect(useChatStore.getState().clearChat()).resolves.toBe(true)
    resolvePage(page([{ id: 'old', role: 'user', content: '旧消息', timestamp: 0 }]))
    await loading

    expect(useChatStore.getState().messages).toEqual([])
    expect(useChatStore.getState().isLoadingMore).toBe(false)
  })

  it('does not request a reply when the user message cannot be saved', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('database unavailable'))

    await useChatStore
      .getState()
      .sendMessage('新消息', { ...DEFAULT_PERSONA, id: 'persona-1' }, aiSettings, ttsSettings)

    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(mocks.invoke).toHaveBeenCalledWith('save_message', expect.any(Object))
    expect(useChatStore.getState().messages).toEqual(messages)
    expect(useChatStore.getState().userMsgCount).toBe(1)
    expect(useChatStore.getState().isTyping).toBe(false)
    expect(useChatStore.getState().error).toBe('消息保存失败，请重试')
  })

  it('accepts only one of two messages submitted synchronously', async () => {
    mocks.invoke.mockImplementation((command: string, args) => {
      if (command === 'send_message') {
        args.onChunk.onmessage({ content: '回复', thinking: '', done: false })
        args.onChunk.onmessage({ content: '', thinking: '', done: true })
      }
      return Promise.resolve(undefined)
    })
    const persona = { ...DEFAULT_PERSONA, id: 'persona-1' }
    const settings = { ...aiSettings, autoProgress: false, memoryEnabled: false }

    const first = useChatStore.getState().sendMessage('第一条', persona, settings, ttsSettings)
    const second = useChatStore.getState().sendMessage('第二条', persona, settings, ttsSettings)

    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(false)
    const savedUsers = mocks.invoke.mock.calls.filter(
      ([command, args]) => command === 'save_message' && args.message.role === 'user',
    )
    expect(savedUsers).toHaveLength(1)
    expect(savedUsers[0]?.[1].message.content).toBe('第一条')
    expect(useChatStore.getState().messages.some((message) => message.content === '第二条')).toBe(false)
  })

  it('does not revive a turn when the conversation is cleared immediately after sending', async () => {
    mocks.invoke.mockResolvedValue(undefined)
    const sending = useChatStore
      .getState()
      .sendMessage('旧消息', { ...DEFAULT_PERSONA, id: 'persona-1' }, aiSettings, ttsSettings)
    const clearing = useChatStore.getState().clearChat()

    await expect(sending).resolves.toBe(false)
    await expect(clearing).resolves.toBe(true)
    expect(useChatStore.getState()).toMatchObject({ messages: [], isTyping: false, requestId: null })
    expect(mocks.invoke.mock.calls.some(([command]) => command === 'save_message')).toBe(false)
  })

  it('does not revive a turn when the persona is switched immediately after sending', async () => {
    const otherMessages: Message[] = [{ id: 'other', role: 'user', content: '另一段历史', timestamp: 4 }]
    mocks.invoke.mockImplementation((command: string) =>
      Promise.resolve(command === 'get_messages' ? page(otherMessages) : undefined),
    )
    const sending = useChatStore
      .getState()
      .sendMessage('旧消息', { ...DEFAULT_PERSONA, id: 'persona-1' }, aiSettings, ttsSettings)
    const loading = useChatStore.getState().loadMessages('persona-2')

    await expect(sending).resolves.toBe(false)
    await loading
    expect(useChatStore.getState()).toMatchObject({
      messages: otherMessages,
      activePersonaId: 'persona-2',
      isTyping: false,
      requestId: null,
    })
    expect(mocks.invoke.mock.calls.some(([command]) => command === 'save_message')).toBe(false)
  })

  it('replaces the loaded window with history from a search result', async () => {
    const historical = [{ id: 'old', role: 'user' as const, content: '旧消息', timestamp: 0 }, ...messages]
    mocks.invoke.mockResolvedValueOnce(page(historical, true, 8))

    await expect(useChatStore.getState().revealMessage('old')).resolves.toBe(true)

    expect(mocks.invoke).toHaveBeenCalledWith('get_messages_from', {
      personaId: 'persona-1',
      messageId: 'old',
    })
    expect(useChatStore.getState().messages).toEqual(historical)
  })

  it('does not start a second regeneration while a turn is already running', async () => {
    useChatStore.setState({ isTyping: true, requestId: 'active-request' })

    await useChatStore
      .getState()
      .regenerate({ ...DEFAULT_PERSONA, id: 'persona-1' }, aiSettings, ttsSettings, 'assistant-1')

    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(useChatStore.getState().requestId).toBe('active-request')
  })

  it('preserves persona edits made while relationship evaluation is in flight', async () => {
    let resolveEvaluation: ((value: { stage: string; reason: string }) => void) | undefined
    mocks.invoke.mockImplementation((command: string) =>
      command === 'evaluate_relationship'
        ? new Promise<{ stage: string; reason: string }>((resolve) => {
            resolveEvaluation = resolve
          })
        : Promise.resolve(command === 'save_message_if_source_exists' ? true : undefined),
    )
    const originalPersona = {
      ...DEFAULT_PERSONA,
      id: 'persona-1',
      relationshipStage: '刚认识' as const,
      stageAppearance: { 朋友: { label: '知己', icon: '🤝' } },
    }
    useSettingsStore.setState({
      persona: originalPersona,
      personas: [originalPersona],
      activePersonaIndex: 0,
    })
    useChatStore.setState({
      activePersonaId: originalPersona.id,
      messages: [{ id: 'user-1', role: 'user', content: '你好', timestamp: 1 }],
      userMsgCount: 1,
    })

    const evaluation = evaluateRelationshipProgress(originalPersona, aiSettings)
    useSettingsStore.getState().setPersona({ ...originalPersona, name: '刚刚修改的新名字' })
    resolveEvaluation?.({ stage: '朋友', reason: '开始自然分享日常' })
    await evaluation

    expect(useSettingsStore.getState().persona).toMatchObject({
      id: originalPersona.id,
      name: '刚刚修改的新名字',
      relationshipStage: '朋友',
    })
    expect(useChatStore.getState().messages.some((message) => message.content.includes('🤝 关系升级：知己'))).toBe(true)
  })

  it.each(['clearChat', 'deleteFrom'] as const)('discards relationship evaluation after %s', async (operation) => {
    const result = deferred<{ stage: string; reason: string }>()
    const persona = { ...DEFAULT_PERSONA, id: 'persona-1', relationshipStage: '刚认识' as const }
    useSettingsStore.setState({ persona, personas: [persona], activePersonaIndex: 0 })
    mocks.invoke.mockImplementation((command: string) =>
      command === 'evaluate_relationship'
        ? result.promise
        : Promise.resolve(command === 'delete_messages_from' ? 1 : undefined),
    )
    const evaluation = evaluateRelationshipProgress(persona, aiSettings)
    await useChatStore.getState()[operation]('assistant-1')

    result.resolve({ stage: '朋友', reason: '旧对话的关系评估' })
    await evaluation

    expect(useSettingsStore.getState().persona.relationshipStage).toBe('刚认识')
    expect(mocks.invoke.mock.calls.some(([command]) => command === 'save_message_if_source_exists')).toBe(false)
    expect(useChatStore.getState().messages.some((message) => message.content.includes('旧对话'))).toBe(false)
  })

  it('discards a relationship notification when the conversation is cleared during its save', async () => {
    const saved = deferred<boolean>()
    const persona = { ...DEFAULT_PERSONA, id: 'persona-1', relationshipStage: '刚认识' as const }
    useSettingsStore.setState({ persona, personas: [persona], activePersonaIndex: 0 })
    mocks.invoke.mockImplementation((command: string) => {
      if (command === 'evaluate_relationship') return Promise.resolve({ stage: '朋友', reason: '旧通知' })
      if (command === 'save_message_if_source_exists') return saved.promise
      return Promise.resolve(undefined)
    })
    const evaluation = evaluateRelationshipProgress(persona, aiSettings)
    await Promise.resolve()
    await useChatStore.getState().clearChat()

    saved.resolve(false)
    await evaluation

    expect(useSettingsStore.getState().persona.relationshipStage).toBe('刚认识')
    expect(useChatStore.getState().messages).toEqual([])
  })

  it('keeps the relationship unchanged when the native transaction rejects an obsolete source', async () => {
    const persona = { ...DEFAULT_PERSONA, id: 'persona-1', relationshipStage: '刚认识' as const }
    useSettingsStore.setState({ persona, personas: [persona], activePersonaIndex: 0 })
    mocks.invoke.mockImplementation((command: string) => {
      if (command === 'evaluate_relationship') return Promise.resolve({ stage: '朋友', reason: '旧通知' })
      if (command === 'save_message_if_source_exists') return Promise.resolve(false)
      throw new Error(`unexpected command: ${command}`)
    })

    await evaluateRelationshipProgress(persona, aiSettings)

    expect(mocks.invoke).toHaveBeenCalledWith('save_message_if_source_exists', {
      personaId: persona.id,
      sourceMessageId: 'assistant-1',
      message: expect.objectContaining({ role: 'assistant', content: expect.stringContaining('旧通知') }),
    })
    expect(useSettingsStore.getState().persona.relationshipStage).toBe('刚认识')
    expect(useChatStore.getState().messages).toEqual(messages)
  })
})
