import { describe, it, expect } from 'vitest'
import { OverlayReminderStrategy } from '../../../src/main/reminder-strategies/overlay-strategy'

describe('OverlayReminderStrategy', () => {
  it('has id "overlay"', () => {
    const strategy = new OverlayReminderStrategy()
    expect(strategy.id).toBe('overlay')
  })

  it('is initially inactive', () => {
    // Before any reminder fires, the overlay should not be showing
    const strategy = new OverlayReminderStrategy()
    expect(strategy.active).toBe(false)
  })

  it('becomes active after onReminderStart', () => {
    const strategy = new OverlayReminderStrategy()
    strategy.onReminderStart()
    expect(strategy.active).toBe(true)
  })

  it('becomes inactive after onReminderEnd', () => {
    const strategy = new OverlayReminderStrategy()
    strategy.onReminderStart()
    strategy.onReminderEnd()
    expect(strategy.active).toBe(false)
  })

  it('becomes inactive after dispose', () => {
    // dispose() should also clear the active flag
    const strategy = new OverlayReminderStrategy()
    strategy.onReminderStart()
    strategy.dispose()
    expect(strategy.active).toBe(false)
  })

  it('supports full start/end/start cycle', () => {
    // Verify the strategy can be reused across multiple reminder cycles
    const strategy = new OverlayReminderStrategy()
    strategy.onReminderStart()
    expect(strategy.active).toBe(true)
    strategy.onReminderEnd()
    expect(strategy.active).toBe(false)
    strategy.onReminderStart()
    expect(strategy.active).toBe(true)
  })

  it('configure is a no-op', () => {
    const strategy = new OverlayReminderStrategy()
    expect(() => strategy.configure({ anything: 'ignored' })).not.toThrow()
    expect(strategy.active).toBe(false)
  })
})