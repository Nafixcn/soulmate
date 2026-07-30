import { describe, expect, it } from 'vitest'
import { getTabDestination } from './dialogFocus'

describe('dialog focus trap', () => {
  it('wraps forward focus from the last item to the first', () => {
    expect(getTabDestination(2, 3, false)).toBe(0)
  })

  it('wraps reverse focus from the first item to the last', () => {
    expect(getTabDestination(0, 3, true)).toBe(2)
  })

  it('moves focus into the dialog when focus is outside', () => {
    expect(getTabDestination(-1, 3, false)).toBe(0)
    expect(getTabDestination(-1, 3, true)).toBe(2)
  })

  it('leaves native focus movement alone between boundaries', () => {
    expect(getTabDestination(1, 3, false)).toBeNull()
    expect(getTabDestination(1, 3, true)).toBeNull()
  })
})
