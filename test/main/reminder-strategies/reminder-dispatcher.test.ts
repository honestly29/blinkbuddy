import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReminderDispatcher } from '../../../src/main/reminder-strategies/reminder-dispatcher'
import type { ReminderStrategy } from '../../../src/main/reminder-strategies/types'

function mockStrategy(id: string): ReminderStrategy & {
  onReminderStart: ReturnType<typeof vi.fn>
  onReminderEnd: ReturnType<typeof vi.fn>
  configure: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
} {
  return {
    id,
    onReminderStart: vi.fn(),
    onReminderEnd: vi.fn(),
    configure: vi.fn(),
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

  // -------------------------------------------------------------------------
  // isActive
  // -------------------------------------------------------------------------

  it('isActive is false initially', () => {
    expect(dispatcher.isActive).toBe(false)
  })

  it('isActive is true after update(true)', () => {
    dispatcher.update(true)
    expect(dispatcher.isActive).toBe(true)
  })

  it('isActive is false after update(false)', () => {
    dispatcher.update(true)
    dispatcher.update(false)
    expect(dispatcher.isActive).toBe(false)
  })

  // -------------------------------------------------------------------------
  // strategyCount
  // -------------------------------------------------------------------------

  it('strategyCount reflects constructor strategies', () => {
    expect(dispatcher.strategyCount).toBe(2)
  })

  it('strategyCount is 0 for empty dispatcher', () => {
    expect(new ReminderDispatcher([]).strategyCount).toBe(0)
  })

  // -------------------------------------------------------------------------
  // addStrategy()
  // -------------------------------------------------------------------------

  it('addStrategy registers a new strategy', () => {
    const strategyC = mockStrategy('c')
    dispatcher.addStrategy(strategyC)

    expect(dispatcher.strategyCount).toBe(3)
    expect(dispatcher.getStrategy('c')).toBe(strategyC)
  })

  it('addStrategy calls onReminderStart immediately when dispatcher is active', () => {
    dispatcher.update(true)

    const strategyC = mockStrategy('c')
    dispatcher.addStrategy(strategyC)

    expect(strategyC.onReminderStart).toHaveBeenCalledTimes(1)
  })

  it('addStrategy does not call onReminderStart when dispatcher is inactive', () => {
    const strategyC = mockStrategy('c')
    dispatcher.addStrategy(strategyC)

    expect(strategyC.onReminderStart).not.toHaveBeenCalled()
  })

  it('added strategy receives future update events', () => {
    const strategyC = mockStrategy('c')
    dispatcher.addStrategy(strategyC)

    dispatcher.update(true)

    expect(strategyC.onReminderStart).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // removeStrategy()
  // -------------------------------------------------------------------------

  it('removeStrategy unregisters and disposes a strategy', () => {
    const result = dispatcher.removeStrategy('a')

    expect(result).toBe(true)
    expect(dispatcher.strategyCount).toBe(1)
    expect(dispatcher.getStrategy('a')).toBeUndefined()
    expect(strategyA.dispose).toHaveBeenCalledTimes(1)
  })

  it('removeStrategy calls onReminderEnd before dispose when active', () => {
    dispatcher.update(true)
    strategyA.onReminderEnd.mockClear()

    dispatcher.removeStrategy('a')

    expect(strategyA.onReminderEnd).toHaveBeenCalledTimes(1)
    expect(strategyA.dispose).toHaveBeenCalledTimes(1)
    // Verify order: end before dispose
    const endOrder = strategyA.onReminderEnd.mock.invocationCallOrder[0]
    const disposeOrder = strategyA.dispose.mock.invocationCallOrder[0]
    expect(endOrder).toBeLessThan(disposeOrder)
  })

  it('removeStrategy does not call onReminderEnd when inactive', () => {
    dispatcher.removeStrategy('a')

    expect(strategyA.onReminderEnd).not.toHaveBeenCalled()
    expect(strategyA.dispose).toHaveBeenCalledTimes(1)
  })

  it('removeStrategy returns false for unknown id', () => {
    expect(dispatcher.removeStrategy('unknown')).toBe(false)
  })

  it('removed strategy no longer receives update events', () => {
    dispatcher.removeStrategy('a')
    strategyA.onReminderStart.mockClear()

    dispatcher.update(true)

    expect(strategyA.onReminderStart).not.toHaveBeenCalled()
    expect(strategyB.onReminderStart).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Empty strategies
  // -------------------------------------------------------------------------

  it('handles empty strategies array without errors', () => {
    const empty = new ReminderDispatcher([])
    expect(() => {
      empty.update(true)
      empty.update(false)
      empty.deactivate()
      empty.dispose()
    }).not.toThrow()
  })
})