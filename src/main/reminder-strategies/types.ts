/**
 * Interface for reminder presentation strategies.
 *
 * The domain layer decides WHEN to remind (via the reminder state machine).
 * Strategies decide HOW to remind (overlay, glow, sound, notification, etc.).
 *
 * onReminderStart() is called once when the reminder becomes active, and
 * onReminderEnd() is called once when it becomes inactive. The dispatcher
 * handles the transition detection, so strategies don't need to check
 * whether they're already showing.
 */
export interface ReminderStrategy {
  /** Unique identifier for this strategy (used for enable/disable config). */
  readonly id: string

  /** Called once when the reminder transitions to active (overdue). */
  onReminderStart(): void

  /** Called once when the reminder transitions to inactive (idle or suppressed). */
  onReminderEnd(): void

  /** Called when the app is quitting. Clean up OSresources. */
  dispose(): void
}