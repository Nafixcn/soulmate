import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PERSONA, DEFAULT_USER_PROFILE, type Memory } from '../types'

const mocks = vi.hoisted(() => ({
  listMemories: vi.fn(),
  searchKnowledge: vi.fn(),
}))

vi.mock('./memoryService', () => ({
  memoryService: { list: mocks.listMemories },
}))
vi.mock('./conversationGateway', () => ({
  conversationGateway: { searchKnowledge: mocks.searchKnowledge },
}))

import { prepareConversation } from './conversationService'

const memory = (id: string, content: string): Memory => ({
  id,
  personaId: DEFAULT_PERSONA.id,
  category: 'preference',
  content,
  confidence: 0.9,
  pinned: false,
  createdAt: 1,
  updatedAt: 1,
})

describe('prepareConversation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds only memories relevant to the current message', async () => {
    mocks.listMemories.mockResolvedValue([
      memory('music', '用户喜欢爵士音乐和钢琴'),
      memory('food', '用户不喜欢吃香菜'),
    ])

    const messages = await prepareConversation({
      messages: [],
      persona: DEFAULT_PERSONA,
      query: '今晚想听一点爵士音乐',
      useKnowledgeRetrieval: false,
      useMemory: true,
      userProfile: DEFAULT_USER_PROFILE,
    })

    expect(messages[0].content).toContain('用户喜欢爵士音乐和钢琴')
    expect(messages[0].content).not.toContain('用户不喜欢吃香菜')
  })

  it('keeps chat available when local memory retrieval fails', async () => {
    mocks.listMemories.mockRejectedValue(new Error('database unavailable'))

    await expect(
      prepareConversation({
        messages: [],
        persona: DEFAULT_PERSONA,
        query: '你好',
        useKnowledgeRetrieval: false,
        useMemory: true,
        userProfile: DEFAULT_USER_PROFILE,
      }),
    ).resolves.toHaveLength(1)
  })
})
