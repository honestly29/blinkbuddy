/**
 * Tracks when the last blink occurred and decides whether the user is
 * overdue. The reminder system uses isOverdue() to decide
 * when to fire a reminder. All timestamps are milliseconds.
 */


// The window has to be sensible range. 3 seconds is the floor because 
// anything shorter would fire reminders during normal use. 60 seconds 
// is the ceiling because longer than that is effectively 
// no monitoring at all.
const MIN_WINDOW_SECONDS = 3
const MAX_WINDOW_SECONDS = 60

export class BlinkWindow {
  private lastBlinkTime: number
  private windowMs: number
  private started: boolean


  constructor(windowSeconds: number = 8) {
    this.windowMs = clampWindow(windowSeconds) * 1000
    this.lastBlinkTime = 0
    this.started = false
  }

  /**
   * Record a detected blink at this timestamp. Has the same effect as
   * reset(); the two are kept separate so call sites read clearly (a real
   * blink vs. starting the window fresh).
   */
  recordBlink(timestamp: number): void {
    this.lastBlinkTime = timestamp
    this.started = true
  }

  /**
   * Returns true if the user has gone longer than the window without blinking.
   * This is the signal the reminder system uses to decide whether to show a reminder.
   */
  isOverdue(now: number): boolean {
    if (!this.started) return false
    return (now - this.lastBlinkTime) >= this.windowMs
  }

  /** 
   * True once a blink or reset has set a real reference time. Without this 
   * flag, isOverdue would return true at startup because lastBlinkTime 
   * defaults to 0 and (now - 0) is bigger than any window.
   */
  isStarted(): boolean {
    return this.started
  }

  /** Update the blink window duration. Clamped to 3-60 seconds. */
  setWindowSeconds(t: number): void {
    this.windowMs = clampWindow(t) * 1000
  }

  /** Get the current window in seconds. */
  getWindowSeconds(): number {
    return this.windowMs / 1000
  }

  /**
   * Restart the overdue window from "now". Called at session startup and
   * on tracking-status changes. Has the same effect as recordBlink().
   */
  reset(now: number): void {
    this.lastBlinkTime = now
    this.started = true
  }
}

function clampWindow(seconds: number): number {
  return Math.max(MIN_WINDOW_SECONDS, Math.min(MAX_WINDOW_SECONDS, seconds))
}