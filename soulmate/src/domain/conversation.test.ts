import { describe, expect, it } from 'vitest'
import { DEFAULT_PERSONA, type Memory, type Message, type Persona } from '../types'
import {
  buildConversationMessages,
  detectExpression,
  findRegenerationTurn,
  selectRelevantMemories,
  shouldRetrieveKnowledge,
} from './conversation'

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

const messages: Message[] = [
  { id: 'u1', role: 'user', content: '第一问', timestamp: 1 },
  { id: 'a1', role: 'assistant', content: '第一答', timestamp: 2 },
  { id: 'u2', role: 'user', content: '第二问', timestamp: 3 },
  { id: 'a2', role: 'assistant', content: '第二答', timestamp: 4 },
]

describe('findRegenerationTurn', () => {
  it('finds the user message that triggered a selected assistant message', () => {
    const turn = findRegenerationTurn(messages, 'a1')

    expect(turn?.userMessage.id).toBe('u1')
    expect(turn?.assistantMessage.id).toBe('a1')
  })

  it('defaults to the latest assistant message', () => {
    expect(findRegenerationTurn(messages)?.userMessage.id).toBe('u2')
  })

  it('returns null for an unknown assistant message', () => {
    expect(findRegenerationTurn(messages, 'missing')).toBeNull()
  })
})

describe('buildConversationMessages', () => {
  it('limits history to the latest 30 messages', () => {
    const history = Array.from({ length: 35 }, (_, index): Message => ({
      id: String(index),
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: String(index),
      timestamp: index,
    }))

    const request = buildConversationMessages(history, persona)

    expect(request).toHaveLength(31)
    expect(request[1].content).toBe('5')
    expect(request[request.length - 1].content).toBe('34')
  })

  it('adds retrieved knowledge to the system prompt', () => {
    const request = buildConversationMessages(messages, persona, [
      { title: '资料', snippet: '可信内容', url: 'https://example.com' },
    ])

    expect(request[0].content).toContain('外部知识检索结果')
    expect(request[0].content).toContain('资料：可信内容')
  })

  it('injects only lorebook entries whose keywords were recently mentioned', () => {
    const request = buildConversationMessages(
      [{ id: 'u-lore', role: 'user', content: '我们去海边小屋吧', timestamp: 1 }],
      {
        ...persona,
        lorebook: [
          { id: 'hit', name: '小屋', keywords: ['海边'], content: '窗外能看到灯塔', enabled: true, priority: 100 },
          { id: 'miss', name: '学校', keywords: ['学校'], content: '学校在山顶', enabled: true, priority: 100 },
        ],
      },
    )

    expect(request[0].content).toContain('当前触发的世界设定')
    expect(request[0].content).toContain('窗外能看到灯塔')
    expect(request[0].content).not.toContain('学校在山顶')
  })

  it('grounds the prompt in user-controlled profile and memories', () => {
    const request = buildConversationMessages(
      messages,
      persona,
      [],
      [
        {
          id: 'memory-1',
          personaId: persona.id,
          category: 'preference',
          content: '用户喜欢爵士乐',
          confidence: 0.9,
          pinned: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        name: '小航',
        preferredAddress: '阿航',
        relationshipLabel: '伴侣',
        interests: '音乐',
        boundaries: '不要催促回复',
      },
    )

    expect(request[0].content).toContain('对方叫小航')
    expect(request[0].content).toContain('称呼对方为“阿航”')
    expect(request[0].content).toContain('用户喜欢爵士乐')
    expect(request[0].content).toContain('不要催促回复')
  })
})

describe('conversation rules', () => {
  it('only retrieves knowledge for question-like messages', () => {
    expect(shouldRetrieveKnowledge('这是什么？')).toBe(true)
    expect(shouldRetrieveKnowledge('你好呀')).toBe(false)
  })

  it('detects the displayed expression', () => {
    expect(detectExpression('今天真开心')).toBe('happy')
    expect(detectExpression('普通回复')).toBe('neutral')
  })
})

describe('selectRelevantMemories', () => {
  const memory = (input: Partial<Memory> & Pick<Memory, 'id' | 'content'>): Memory => ({
    personaId: persona.id,
    category: 'preference',
    confidence: 0.8,
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    ...input,
  })

  it('keeps pinned memories and ranks memories related to the current message', () => {
    const selected = selectRelevantMemories(
      [
        memory({ id: 'pinned', content: '用户希望被称呼为小航', pinned: true }),
        memory({ id: 'related', content: '用户喜欢爵士音乐和钢琴' }),
        memory({ id: 'unrelated', content: '用户不喜欢吃香菜' }),
      ],
      '今晚想听一点爵士音乐',
      2,
    )

    expect(selected.map((item) => item.id)).toEqual(['pinned', 'related'])
  })

  it('uses recent user context and excludes disabled memories', () => {
    const selected = selectRelevantMemories(
      [
        memory({ id: 'event', category: 'event', content: '周六去看了电影' }),
        memory({ id: 'disabled', content: '喜欢爵士音乐', pinned: true, enabled: false }),
        memory({ id: 'other', content: '不喜欢香菜' }),
      ],
      '后来怎么样了？',
      6,
      ['我们周六去看了电影'],
    )

    expect(selected.map((item) => item.id)).toEqual(['event'])
  })

  it('keeps active boundaries in context even without matching words', () => {
    const selected = selectRelevantMemories(
      [memory({ id: 'boundary', category: 'boundary', content: '不要催促回复' })],
      '晚上好',
    )

    expect(selected.map((item) => item.id)).toEqual(['boundary'])
  })
})
