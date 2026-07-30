import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AISettings } from '../types'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  Channel: class {
    onmessage = () => undefined
  },
}))

import { conversationGateway } from './conversationGateway'

const settings: AISettings = {
  endpoint: 'https://provider.example/v1/chat',
  model: 'test-model',
  temperature: 0.6,
  maxTokens: 512,
  autoProgress: false,
  evalInterval: 20,
  useWebSearch: false,
}

describe('conversation gateway streaming lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('completes when the native command resolves without a final channel event', async () => {
    mocks.invoke.mockResolvedValueOnce(undefined)

    await expect(
      conversationGateway.streamCompletion({
        messages: [{ role: 'user', content: '你好' }],
        settings,
        requestId: 'request-1',
        signal: new AbortController().signal,
        isCurrent: () => true,
        onChunk: vi.fn(),
      }),
    ).resolves.toEqual({ content: '', thinking: '' })
  })
})
