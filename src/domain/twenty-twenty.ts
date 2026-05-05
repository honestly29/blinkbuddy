/**
 * 20-20-20 rule timer.
 *
 * Every 20 minutes, prompts the user to look at something 20 feet away
 * for 20 seconds. Auto-resets after each break completes.
 *
 * All timestamps are Unix timestamps in milliseconds.
 */

import type { TwentyTwentyPhase, TwentyTwentyState } from './types'

const CYCLE_MS = 20 * 60 * 1000  // 20 minutes
//const CYCLE_MS = 15 * 1000     // 15 seconds (for testing)
const BREAK_MS = 20 * 1000       // 20 seconds

export class TwentyTwentyTimer {
  private phase: TwentyTwentyPhase = 'idle'
  /** Timestamp the current 20-minute cycle started. 0 when idle. */
  private cycleStartTime = 0
  /** Timestamp the current break started. 0 when not in a break. */
  private breakStartTime = 0

  /** Begin the 20-minute cycle. */
  start(now: number): void {
    this.phase = 'waiting'
    this.cycleStartTime = now
    this.breakStartTime = 0
  }

  /**
   * Evaluate the current state based on elapsed time. Call this on
   * every tick.
   *
   * Drives all phase transitions:
   * - idle: stays idle until start() is called.
   * - waiting: transitions to break_active once 20 minutes have elapsed.
   * - break_active: transitions back to waiting once the 20-second break
   *   has elapsed, restarting the cycle automatically.
   */
  tick(now: number): TwentyTwentyState {
    if (this.phase === 'idle') {
      return { phase: 'idle', timeUntilBreakMs: 0, breakTimeRemainingMs: 0 }
    }

    if (this.phase === 'waiting') {
      const elapsed = now - this.cycleStartTime
      if (elapsed >= CYCLE_MS) {
        // 20 minutes elapsed: start the break.
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

    // Only break_active is left after the two checks above.
    const breakElapsed = now - this.breakStartTime
    if (breakElapsed >= BREAK_MS) {
      // 20-second break is over: auto-restart the cycle.
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

  /** Seconds remaining until the next break. Returns 0 when not waiting. */
  getTimeUntilBreak(now: number): number {
    if (this.phase !== 'waiting') return 0
    const remaining = CYCLE_MS - (now - this.cycleStartTime)
    return Math.max(0, remaining) / 1000
  }

  /** Seconds remaining in the current break. Returns 0 when not on a break. */
  getBreakTimeRemaining(now: number): number {
    if (this.phase !== 'break_active') return 0
    const remaining = BREAK_MS - (now - this.breakStartTime)
    return Math.max(0, remaining) / 1000
  }

  /** Stop the timer and return to idle. */
  stop(): void {
    this.phase = 'idle'
    this.cycleStartTime = 0
    this.breakStartTime = 0
  }

  /**
   * Returns the current phase. Used by SessionManager for blink-reminder
   * suppression during breaks, break counting, and toggle guards.
   */
  getPhase(): TwentyTwentyPhase {
    return this.phase
  }
}