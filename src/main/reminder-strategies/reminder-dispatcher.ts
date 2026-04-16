import type { ReminderStrategy } from './types'

/**
 * Dispatches reminder lifecycle events to registered strategies.
 *
 * The session manager calls update() on every state change, which means
 * update(true) is called repeatedly while the user is overdue. This class
 * detects the actual transitions (false -> true and true -> false) and only
 * calls onReminderStart/onReminderEnd on strategies when the state changes,
 * so strategies don't need to track this themselves.
 */
export class ReminderDispatcher {
  private strategies: ReminderStrategy[]
  private wasActive = false

  constructor(strategies: ReminderStrategy[] = []) {
    this.strategies = strategies
  }

  /**
   * Called by SessionManager after each state transition.
   * Compares the new `active` value with the previous one to detect edges:
   *   - false -> true: fire onReminderStart() on all strategies
   *   - true -> false: fire onReminderEnd() on all strategies
   *   - true -> true or false -> false: no-op (no edge, no event)
   */
  update(active: boolean): void {
    if (active && !this.wasActive) {
      // Edge: inactive -> active (reminder just became overdue)
      this.wasActive = true
      for (const s of this.strategies) {
        s.onReminderStart()
      }
    } else if (!active && this.wasActive) {
      // Edge: active -> inactive (user blinked or face lost)
      this.wasActive = false
      for (const s of this.strategies) {
        s.onReminderEnd()
      }
    }
  }

  /** Returns a registered strategy by id, or undefined if not found. */
  getStrategy<T extends ReminderStrategy>(id: string): T | undefined {
    return this.strategies.find((s) => s.id === id) as T | undefined
  }

  /**
   * If currently active, calls onReminderEnd() on all strategies and
   * resets edge state. Strategies remain registered and reusable.
   * Used on session start/stop/teardown to ensure no reminder is left
   * showing when the session ends.
   */
  deactivate(): void {
    if (this.wasActive) {
      this.wasActive = false
      for (const s of this.strategies) {
        s.onReminderEnd()
      }
    }
  }

  /**
   * Deactivates (hides any active reminders), then permanently disposes
   * all strategies. Used on app quit.
   */
  dispose(): void {
    this.deactivate()
    for (const s of this.strategies) {
      s.dispose()
    }
  }
}