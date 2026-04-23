/**
 * Tracks when the last blink occurred and determines if the user is overdue.
 *
 * All timestamps in milliseconds.
 */

const MIN_WINDOW_SECONDS = 5
const MAX_WINDOW_SECONDS = 300

export class BlinkWindow {
  private lastBlinkTime: number
  private windowMs: number
  private started: boolean

  constructor(windowSeconds: number = 20) {
    this.windowMs = clampWindow(windowSeconds) * 1000
    this.lastBlinkTime = 0
    this.started = false
  }

  /** Record a blink at the given timestamp. Resets the overdue timer. */
  recordBlink(timestamp: number): void {
    this.lastBlinkTime = timestamp
    this.started = true
  }

  /** Returns true if (now - lastBlinkTime) >= window. */
  isOverdue(now: number): boolean {
    if (!this.started) return false
    return (now - this.lastBlinkTime) >= this.windowMs
  }

  /** True once `reset()` or `recordBlink()` has established a real clock. */
  isStarted(): boolean {
    return this.started
  }

  /** Update the blink window duration. Clamped to 5–300 seconds. */
  setWindowSeconds(t: number): void {
    this.windowMs = clampWindow(t) * 1000
  }

  /** Get the current window in seconds. */
  getWindowSeconds(): number {
    return this.windowMs / 1000
  }

  /** Reset the last blink time to now. */
  reset(now: number): void {
    this.lastBlinkTime = now
    this.started = true
  }
}

function clampWindow(seconds: number): number {
  return Math.max(MIN_WINDOW_SECONDS, Math.min(MAX_WINDOW_SECONDS, seconds))
}