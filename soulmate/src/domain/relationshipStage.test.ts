import { describe, expect, it } from 'vitest'
import { DEFAULT_PERSONA } from '../types'
import { getStageAppearance } from './relationshipStage'

describe('relationship stage appearance', () => {
  it('uses defaults for older personas and custom values for edited stages', () => {
    expect(getStageAppearance(DEFAULT_PERSONA, '朋友')).toEqual({ label: '朋友', icon: '✨' })

    const persona = {
      ...DEFAULT_PERSONA,
      stageAppearance: { 朋友: { label: '知己', icon: '🤝' } },
    }
    expect(getStageAppearance(persona, '朋友')).toEqual({ label: '知己', icon: '🤝' })
    expect(getStageAppearance(persona, '热恋')).toEqual({ label: '热恋', icon: '❤️' })
  })
})
