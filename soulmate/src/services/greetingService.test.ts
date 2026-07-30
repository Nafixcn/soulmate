import { describe, expect, it } from 'vitest'
import { buildGroundedGreeting } from './greetingService'

describe('buildGroundedGreeting', () => {
  it('references a real previous topic without inventing an activity', () => {
    expect(
      buildGroundedGreeting({
        preferredAddress: '阿航',
        interests: '',
        lastUserMessage: '我明天要去参加第一次爵士乐演出',
        hour: 10,
      }),
    ).toBe('阿航，你上次提到“我明天要去参加第一次爵士乐演出”，后来怎么样了？')
  })

  it('falls back to user profile and time-aware neutral prompts', () => {
    expect(buildGroundedGreeting({ preferredAddress: '小航', interests: '音乐、电影', hour: 14 })).toBe(
      '小航，今天想聊聊音乐吗？',
    )
    expect(buildGroundedGreeting({ preferredAddress: '小航', interests: '', hour: 21 })).toBe(
      '晚上好，小航。今天有什么想和我说的吗？',
    )
  })
})
