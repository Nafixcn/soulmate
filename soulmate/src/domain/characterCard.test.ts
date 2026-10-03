import { describe, expect, it } from 'vitest'
import { DEFAULT_PERSONA } from '../types'
import { exportCharacterCard, importCharacterCard } from './characterCard'

describe('Character Card V2 compatibility', () => {
  it('round-trips advanced persona fields and lorebook entries', () => {
    const persona = {
      ...DEFAULT_PERSONA,
      id: 'persona-a',
      name: '小岚',
      description: '住在海边的插画师',
      scenario: '雨天的咖啡馆',
      firstMessage: '你终于来啦。',
      exampleDialogue: '<START>\n{{char}}: 要喝热可可吗？',
      systemPrompt: '说话简洁自然',
      creator: 'SoulMate',
      tags: ['治愈', '日常'],
      stageAppearance: { 朋友: { label: '知己', icon: '🤝' } },
      lorebook: [
        {
          id: 'lore-a',
          name: '海边小屋',
          keywords: ['小屋', '海边'],
          content: '小屋窗外可以看到灯塔。',
          enabled: true,
          priority: 120,
        },
      ],
    }

    const imported = importCharacterCard(exportCharacterCard(persona))

    expect(imported).toMatchObject({
      name: '小岚',
      description: '住在海边的插画师',
      scenario: '雨天的咖啡馆',
      creator: 'SoulMate',
      tags: ['治愈', '日常'],
      stageAppearance: { 朋友: { label: '知己', icon: '🤝' } },
    })
    expect(imported.lorebook[0]).toMatchObject({
      name: '海边小屋',
      keywords: ['小屋', '海边'],
      content: '小屋窗外可以看到灯塔。',
      enabled: true,
      priority: 120,
    })
  })

  it('accepts legacy cards whose fields live at the root', () => {
    const imported = importCharacterCard({ name: '旧角色', personality: '安静', first_mes: '你好。' })

    expect(imported.name).toBe('旧角色')
    expect(imported.personality).toBe('安静')
    expect(imported.firstMessage).toBe('你好。')
  })
})
