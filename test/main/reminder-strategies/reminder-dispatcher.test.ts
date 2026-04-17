import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReminderDispatcher } from '../../../src/main/reminder-strategies/reminder-dispatcher'
import type { ReminderStrategy } from '../../../src/main/reminder-strategies/types'

function mockStrategy(id: string): ReminderStrategy & {
  onReminderStart: ReturnType<typeof vi.fn>
  onReminderEnd: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
} {
  return {
    id,
    onReminderStart: vi.fn(),
    onReminderEnd: vi.fn(),
    dispose: vi.fn(),
  }
}


describe('ReminderDispatcher', () => {
  let strategyA: ReturnType<typeof mockStrategy>
  let strategyB: ReturnType<typeof mockStrategy>
  let dispatcher: ReminderDispatcher

  beforeEach(() => {
    strategyA = mockStrategy('a')
    strategyB = mockStrategy('b')
    dispatcher = new ReminderDispatcher([strategyA, strategyB])
  })

  // -- Edge detection tests --
  // The dispatcher should only fire events on state TRANSITIONS,
  // not on repeated calls with the same value.

  it('fires onReminderStart once on first active update', () => {
    // Three consecutive true updates: should only fire start ONCE
    dispatcher.update(true)
    dispatcher.update(true)
    dispatcher.update(true)

    expect(strategyA.onReminderStart).toHaveBeenCalledTimes(1)
    expect(strategyB.onReminderStart).toHaveBeenCalledTimes(1)
    expect(strategyA.onReminderEnd).not.toHaveBeenCalled()
  })

  it('fires onReminderEnd once on transition to inactive', () => {
    dispatcher.update(true)   // Start
    dispatcher.update(false)  // End

    expect(strategyA.onReminderEnd).toHaveBeenCalledTimes(1)
    expect(strategyB.onReminderEnd).toHaveBeenCalledTimes(1)
  })

  it('does not fire onReminderEnd when already inactive', () => {
    // Two consecutive false updates: nothing should fire at all
    dispatcher.update(false)
    dispatcher.update(false)

    expect(strategyA.onReminderEnd).not.toHaveBeenCalled()
    expect(strategyA.onReminderStart).not.toHaveBeenCalled()
  })

  it('fires start and end on full cycle', () => {
    // Two complete cycles: start -> end -> start -> end
    dispatcher.update(true)
    dispatcher.update(false)
    dispatcher.update(true)
    dispatcher.update(false)

    expect(strategyA.onReminderStart).toHaveBeenCalledTimes(2)
    expect(strategyA.onReminderEnd).toHaveBeenCalledTimes(2)
  })

  // -- deactivate() tests --

  it('deactivate calls onReminderEnd when active', () => {
    dispatcher.update(true)
    strategyA.onReminderEnd.mockClear()
    strategyB.onReminderEnd.mockClear()

    dispatcher.deactivate()

    // Should fire end on all strategies to clean up active reminders
    expect(strategyA.onReminderEnd).toHaveBeenCalledTimes(1)
    expect(strategyB.onReminderEnd).toHaveBeenCalledTimes(1)
  })

  it('deactivate is a no-op when inactive', () => {
    // Nothing active, nothing to deactivate
    dispatcher.deactivate()

    expect(strategyA.onReminderEnd).not.toHaveBeenCalled()
  })

  it('after deactivate, update(true) fires onReminderStart again', () => {
    dispatcher.update(true)
    dispatcher.deactivate()
    strategyA.onReminderStart.mockClear()

    dispatcher.update(true)

    expect(strategyA.onReminderStart).toHaveBeenCalledTimes(1)
  })

  // -- dispose() tests --

  it('dispose calls onReminderEnd then dispose when active', () => {
    dispatcher.update(true)
    strategyA.onReminderEnd.mockClear()

    dispatcher.dispose()

    // Should deactivate first (end), then dispose
    expect(strategyA.onReminderEnd).toHaveBeenCalledTimes(1)
    expect(strategyA.dispose).toHaveBeenCalledTimes(1)
    expect(strategyB.dispose).toHaveBeenCalledTimes(1)
  })

  it('dispose only calls dispose (not onReminderEnd) when inactive', () => {
    // Nothing active, so only dispose should fire (no end needed)
    dispatcher.dispose()

    expect(strategyA.onReminderEnd).not.toHaveBeenCalled()
    expect(strategyA.dispose).toHaveBeenCalledTimes(1)
    expect(strategyB.dispose).toHaveBeenCalledTimes(1)
  })

  // -- getStrategy() tests --

  it('getStrategy returns the correct strategy by id', () => {
    expect(dispatcher.getStrategy('a')).toBe(strategyA)
    expect(dispatcher.getStrategy('b')).toBe(strategyB)
  })

  it('getStrategy returns undefined for unknown id', () => {
    expect(dispatcher.getStrategy('unknown')).toBeUndefined()
  })

  // -- Edge case --

  it('handles empty strategies array without errors', () => {
    // A dispatcher with no strategies should not crash on any operation
    const empty = new ReminderDispatcher([])
    expect(() => {
      empty.update(true)
      empty.update(false)
      empty.deactivate()
      empty.dispose()
    }).not.toThrow()
  })
})