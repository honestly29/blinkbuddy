import { describe, it, expect, beforeEach } from 'vitest'
import { TwentyTwentyTimer } from '../../src/domain/twenty-twenty'

const TWENTY_MINUTES_MS = 20 * 60 * 1000
const TWENTY_SECONDS_MS = 20 * 1000

describe('TwentyTwentyTimer', () => {
  let timer: TwentyTwentyTimer

  beforeEach(() => {
    timer = new TwentyTwentyTimer()
  })

 

  it('starts in idle phase', () => {
    expect(timer.getPhase()).toBe('idle')
  })

  it('tick in idle returns idle state', () => {
    const state = timer.tick(1_000)
    expect(state.phase).toBe('idle')
    expect(state.timeUntilBreakMs).toBe(0)
    expect(state.breakTimeRemainingMs).toBe(0)
  })

  

  it('start sets phase to waiting', () => {
    timer.start(0)
    expect(timer.getPhase()).toBe('waiting')
  })

  it('tick during waiting returns correct countdown', () => {
    timer.start(0)
    const state = timer.tick(5 * 60 * 1000) // 5 minutes in
    expect(state.phase).toBe('waiting')
    expect(state.timeUntilBreakMs).toBe(15 * 60 * 1000) // 15 minutes left
    expect(state.breakTimeRemainingMs).toBe(0)
  })



  it('transitions to break_active after 20 minutes', () => {
    timer.start(0)
    const state = timer.tick(TWENTY_MINUTES_MS)
    expect(state.phase).toBe('break_active')
    expect(state.breakTimeRemainingMs).toBe(TWENTY_SECONDS_MS)
    expect(state.timeUntilBreakMs).toBe(0)
  })

  it('tick during break_active returns correct remaining time', () => {
    timer.start(0)
    timer.tick(TWENTY_MINUTES_MS) // trigger transition to break
    const state = timer.tick(TWENTY_MINUTES_MS + 10_000) // 10s into break
    expect(state.phase).toBe('break_active')
    expect(state.breakTimeRemainingMs).toBe(10_000) // 10s remaining
  })



  it('auto-resets to waiting after 20-second break completes', () => {
    timer.start(0)
    timer.tick(TWENTY_MINUTES_MS) // trigger break
    const state = timer.tick(TWENTY_MINUTES_MS + TWENTY_SECONDS_MS) // break done
    expect(state.phase).toBe('waiting')
    expect(state.timeUntilBreakMs).toBe(TWENTY_MINUTES_MS) // fresh 20-min cycle
    expect(state.breakTimeRemainingMs).toBe(0)
  })

 

  it('getTimeUntilBreak returns correct countdown in seconds', () => {
    timer.start(0)
    // 5 minutes elapsed
    expect(timer.getTimeUntilBreak(5 * 60 * 1000)).toBe(15 * 60) // 900 seconds
  })

  it('getTimeUntilBreak returns 0 when not in waiting phase', () => {
    expect(timer.getTimeUntilBreak(0)).toBe(0) // idle
  })

  it('getTimeUntilBreak returns 0 during break', () => {
    timer.start(0)
    timer.tick(TWENTY_MINUTES_MS) // trigger break
    expect(timer.getTimeUntilBreak(TWENTY_MINUTES_MS + 5_000)).toBe(0)
  })

  it('getBreakTimeRemaining returns correct countdown in seconds during break', () => {
    timer.start(0)
    timer.tick(TWENTY_MINUTES_MS) // trigger break
    expect(timer.getBreakTimeRemaining(TWENTY_MINUTES_MS + 5_000)).toBe(15) // 15 seconds
  })

  it('getBreakTimeRemaining returns 0 when not in break', () => {
    timer.start(0)
    expect(timer.getBreakTimeRemaining(5_000)).toBe(0)
  })

  it('getBreakTimeRemaining returns 0 when idle', () => {
    expect(timer.getBreakTimeRemaining(0)).toBe(0)
  })



  it('stop returns to idle', () => {
    timer.start(0)
    timer.stop()
    expect(timer.getPhase()).toBe('idle')
  })

  it('timer does not run when stopped', () => {
    timer.start(0)
    timer.stop()

    const state = timer.tick(TWENTY_MINUTES_MS + 1_000)
    expect(state.phase).toBe('idle')
    expect(state.timeUntilBreakMs).toBe(0)
  })

  it('stop during break returns to idle', () => {
    timer.start(0)
    timer.tick(TWENTY_MINUTES_MS) // trigger break
    timer.stop()
    expect(timer.getPhase()).toBe('idle')
  })

  

  it('runs multiple 20-minute cycles correctly', () => {
    timer.start(0)

    // First cycle: wait 20 min, break 20s
    let state = timer.tick(TWENTY_MINUTES_MS)
    expect(state.phase).toBe('break_active')

    state = timer.tick(TWENTY_MINUTES_MS + TWENTY_SECONDS_MS)
    expect(state.phase).toBe('waiting')

    // Second cycle starts from the auto-reset point
    const secondCycleStart = TWENTY_MINUTES_MS + TWENTY_SECONDS_MS
    state = timer.tick(secondCycleStart + TWENTY_MINUTES_MS)
    expect(state.phase).toBe('break_active')
  })
})