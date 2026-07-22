import { describe, expect, it } from 'vitest'
import { normalizePersonas } from './persona'

describe('normalizePersonas', () => {
  it('assigns legacy conversation history to the active persona', () => {
    const ids = ['generated-1', 'generated-2']
    const result = normalizePersonas([{ name: '甲' }, { name: '乙' }], 1, () => ids.shift() || 'fallback')

    expect(result.activeIndex).toBe(1)
    expect(result.personas[0].id).toBe('generated-1')
    expect(result.personas[1].id).toBe('default')
  })

  it('preserves valid IDs and replaces duplicates', () => {
    const result = normalizePersonas([{ id: 'stable' }, { id: 'stable' }], 0, () => 'replacement')

    expect(result.personas.map((persona) => persona.id)).toEqual(['stable', 'replacement'])
  })

  it('clamps an invalid active index', () => {
    const result = normalizePersonas([{ id: 'stable' }], 99)

    expect(result.activeIndex).toBe(0)
  })
})
