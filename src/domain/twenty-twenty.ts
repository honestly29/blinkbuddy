/**
 * 20-20-20 rule timer.
 *
 * Every 20 minutes, prompts the user to look at something 20 feet away for 20 seconds. 
 * Auto-resets after each break completes.
 *
 * All timestamps in milliseconds.
 */

import type { TwentyTwentyPhase, TwentyTwentyState } from './types'

const CYCLE_MS = 20 * 60 * 1000  // 20 minutes
//const CYCLE_MS = 15 * 1000  // 15 seconds (for testing)
const BREAK_MS = 20 * 1000       // 20 seconds

export class TwentyTwentyTimer {
  private phase: TwentyTwentyPhase = 'idle'
  private cycleStartTime = 0
  private breakStartTime = 0

  /** Begin the 20-minute cycle. */
  start(now: number): void {
    this.phase = 'waiting'
    this.cycleStartTime = now
    this.breakStartTime = 0
  }

  /**
   * Evaluate the current state based on elapsed time.
   * Call this on every tick (e.g. once per second).
   */
  tick(now: number): TwentyTwentyState {
    if (this.phase === 'idle') {
      return { phase: 'idle', timeUntilBreakMs: 0, breakTimeRemainingMs: 0 }
    }

    if (this.phase === 'waiting') {
      const elapsed = now - this.cycleStartTime
      if (elapsed >= CYCLE_MS) {
        // Transition to break
        this.phase = 'break_active'
        this.breakStartTime = now
        return {
          phase: 'break_active',
          timeUntilBreakMs: 0,
          breakTimeRemainingMs: BREAK_MS,
        }
      }
      return {
        phase: 'waiting',
        timeUntilBreakMs: CYCLE_MS - elapsed,
        breakTimeRemainingMs: 0,
      }
    }

    // phase === 'break_active'
    const breakElapsed = now - this.breakStartTime
    if (breakElapsed >= BREAK_MS) {
      // Break complete — auto-reset to waiting
      this.phase = 'waiting'
      this.cycleStartTime = now
      this.breakStartTime = 0
      return {
        phase: 'waiting',
        timeUntilBreakMs: CYCLE_MS,
        breakTimeRemainingMs: 0,
      }
    }
    return {
      phase: 'break_active',
      timeUntilBreakMs: 0,
      breakTimeRemainingMs: BREAK_MS - breakElapsed,
    }
  }

  /** Seconds remaining until the next break. */
  getTimeUntilBreak(now: number): number {
    if (this.phase !== 'waiting') return 0
    const remaining = CYCLE_MS - (now - this.cycleStartTime)
    return Math.max(0, remaining) / 1000
  }

  /** Seconds remaining in the current break (0 if not in break). */
  getBreakTimeRemaining(now: number): number {
    if (this.phase !== 'break_active') return 0
    const remaining = BREAK_MS - (now - this.breakStartTime)
    return Math.max(0, remaining) / 1000
  }

  /** Stop the timer. Returns to idle. */
  stop(): void {
    this.phase = 'idle'
    this.cycleStartTime = 0
    this.breakStartTime = 0
  }

  /** Get the current phase. */
  getPhase(): TwentyTwentyPhase {
    return this.phase
  }
}