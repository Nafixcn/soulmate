import { describe, expect, it } from 'vitest'
import { isRetryableError, toUserMessage } from './appError'

describe('app errors', () => {
  it('turns provider errors into actionable messages', () => {
    expect(toUserMessage('API request failed: 401 Unauthorized')).toContain('API Key')
    expect(toUserMessage('request timed out')).toContain('超时')
  })

  it('honors structured retry guidance and avoids retrying authentication failures', () => {
    expect(isRetryableError({ retryable: false })).toBe(false)
    expect(isRetryableError('401 Unauthorized')).toBe(false)
    expect(isRetryableError('503 Service Unavailable')).toBe(true)
  })
})
