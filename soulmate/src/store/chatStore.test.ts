import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message, MessagePage } from '../types'

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

import { useChatStore } from './chatStore'

const messages: Message[] = [
  { id: 'user-1', role: 'user', content: '你好', timestamp: 1 },
  { id: 'assistant-1', role: 'assistant', content: '你好呀', timestamp: 2 },
]

function page(items: Message[], hasMore = false, userMessageCount = 1): MessagePage {
  return { messages: items, hasMore, userMessageCount }
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

  it('loads a stable backend page and its total user count', async () => {
    mocks.invoke.mockResolvedValueOnce(page(messages, true, 52))

    await useChatStore.getState().loadMessages('persona-1')

    expect(mocks.invoke).toHaveBeenCalledWith('get_messages', { personaId: 'persona-1', limit: 100 })
    expect(useChatStore.getState().hasMore).toBe(true)
    expect(useChatStore.getState().userMsgCount).toBe(52)
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
})
