import { describe, it, expect } from 'vitest'
import { isReminderStrategyId } from '../../src/shared/reminder-strategies'

describe('isReminderStrategyId', () => {
  it('returns true for a known strategy ID', () => {
    expect(isReminderStrategyId('overlay')).toBe(true)
  })

  it('returns false for an unrecognised string', () => {
    expect(isReminderStrategyId('not-a-strategy')).toBe(false)
  })

  it('returns false for a non-string value', () => {
    expect(isReminderStrategyId(42)).toBe(false)
  })
})