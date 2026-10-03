import type { Persona, RelationshipStage, StageAppearance } from '../types'

export const STAGE_ORDER: RelationshipStage[] = ['刚认识', '朋友', '暧昧', '热恋', '老夫老妻']

export const DEFAULT_STAGE_APPEARANCE: Record<RelationshipStage, StageAppearance> = {
  刚认识: { label: '刚认识', icon: '💬' },
  朋友: { label: '朋友', icon: '✨' },
  暧昧: { label: '暧昧', icon: '💗' },
  热恋: { label: '热恋', icon: '❤️' },
  老夫老妻: { label: '老夫老妻', icon: '🏠' },
}

export function getStageAppearance(persona: Persona, stage = persona.relationshipStage): StageAppearance {
  const fallback = DEFAULT_STAGE_APPEARANCE[stage]
  const custom = persona.stageAppearance?.[stage]
  return {
    label: typeof custom?.label === 'string' ? custom.label.trim() || fallback.label : fallback.label,
    icon: typeof custom?.icon === 'string' ? custom.icon.trim() || fallback.icon : fallback.icon,
  }
}
