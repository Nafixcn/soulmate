import { DEFAULT_PERSONA, type LorebookEntry, type Persona } from '../types'
import { DEFAULT_STAGE_APPEARANCE, STAGE_ORDER } from './relationshipStage'

interface CharacterCardV2 {
  spec: 'chara_card_v2'
  spec_version: '2.0'
  data: {
    name: string
    description: string
    personality: string
    scenario: string
    first_mes: string
    mes_example: string
    creator_notes: string
    system_prompt: string
    post_history_instructions: string
    alternate_greetings: string[]
    character_book?: {
      name?: string
      entries: Array<{
        id?: number
        keys: string[]
        content: string
        enabled: boolean
        insertion_order?: number
        comment?: string
      }>
    }
    tags: string[]
    creator: string
    character_version: string
    extensions: Record<string, unknown>
  }
}

export function exportCharacterCard(persona: Persona): CharacterCardV2 {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: persona.name,
      description: persona.description,
      personality: persona.personality,
      scenario: persona.scenario,
      first_mes: persona.firstMessage,
      mes_example: persona.exampleDialogue,
      creator_notes: '',
      system_prompt: persona.systemPrompt,
      post_history_instructions: '',
      alternate_greetings: [],
      character_book: {
        name: `${persona.name}的世界书`,
        entries: persona.lorebook.map((entry, index) => ({
          id: index,
          keys: entry.keywords,
          content: entry.content,
          enabled: entry.enabled,
          insertion_order: entry.priority,
          comment: entry.name,
        })),
      },
      tags: persona.tags,
      creator: persona.creator,
      character_version: '1.0',
      extensions: {
        soulmate: {
          age: persona.age,
          nickname: persona.nickname,
          speakingStyle: persona.speakingStyle,
          relationshipStage: persona.relationshipStage,
          stageAppearance: persona.stageAppearance,
          emoji: persona.emoji,
        },
      },
    },
  }
}

export function importCharacterCard(input: unknown): Persona {
  if (!input || typeof input !== 'object') throw new Error('角色卡不是有效的 JSON 对象')
  const root = input as Record<string, unknown>
  const data = (root.spec === 'chara_card_v2' ? root.data : root) as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') throw new Error('角色卡缺少 data')

  const name = text(data.name).trim()
  if (!name) throw new Error('角色卡缺少角色名称')
  const extensions = object(data.extensions)
  const soulmate = object(extensions.soulmate)
  const characterBook = object(data.character_book)
  const entries = Array.isArray(characterBook.entries) ? characterBook.entries : []

  const lorebook: LorebookEntry[] = entries.flatMap((raw, index) => {
    const entry = object(raw)
    const content = text(entry.content).trim()
    if (!content) return []
    return [
      {
        id: crypto.randomUUID(),
        name: text(entry.comment).trim() || `条目 ${index + 1}`,
        keywords: Array.isArray(entry.keys)
          ? entry.keys
              .map(text)
              .map((key) => key.trim())
              .filter(Boolean)
          : [],
        content,
        enabled: entry.enabled !== false,
        priority: number(entry.insertion_order, 100),
      },
    ]
  })

  return {
    ...DEFAULT_PERSONA,
    id: crypto.randomUUID(),
    name: name.slice(0, 32),
    age: number(soulmate.age, DEFAULT_PERSONA.age),
    personality: text(data.personality).trim() || DEFAULT_PERSONA.personality,
    nickname: text(soulmate.nickname).trim() || DEFAULT_PERSONA.nickname,
    speakingStyle: text(soulmate.speakingStyle).trim() || DEFAULT_PERSONA.speakingStyle,
    relationshipStage: relationshipStage(soulmate.relationshipStage),
    stageAppearance: stageAppearance(soulmate.stageAppearance),
    emoji: text(soulmate.emoji).trim() || DEFAULT_PERSONA.emoji,
    description: text(data.description),
    scenario: text(data.scenario),
    firstMessage: text(data.first_mes),
    exampleDialogue: text(data.mes_example),
    systemPrompt: text(data.system_prompt),
    creator: text(data.creator),
    tags: Array.isArray(data.tags)
      ? data.tags
          .map(text)
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [],
    lorebook,
  }
}

export function downloadCharacterCard(persona: Persona): void {
  const json = JSON.stringify(exportCharacterCard(persona), null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${safeFilename(persona.name)}.character.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function relationshipStage(value: unknown): Persona['relationshipStage'] {
  const stage = text(value)
  return STAGE_ORDER.some((candidate) => candidate === stage)
    ? (stage as Persona['relationshipStage'])
    : DEFAULT_PERSONA.relationshipStage
}

function stageAppearance(value: unknown): Persona['stageAppearance'] {
  const source = object(value)
  const result: NonNullable<Persona['stageAppearance']> = {}
  for (const stage of STAGE_ORDER) {
    const appearance = object(source[stage])
    if (!Object.keys(appearance).length) continue
    result[stage] = {
      label: text(appearance.label).trim().slice(0, 12) || DEFAULT_STAGE_APPEARANCE[stage].label,
      icon: text(appearance.icon).trim().slice(0, 12) || DEFAULT_STAGE_APPEARANCE[stage].icon,
    }
  }
  return Object.keys(result).length ? result : undefined
}

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'character'
}
