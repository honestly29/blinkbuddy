import type { ReminderStrategyId } from '../../shared/reminder-strategies'

/**
 * Interface for reminder presentation strategies.
 *
 * The domain layer decides WHEN to remind (via the reminder state machine).
 * Strategies decide HOW to remind (overlay, glow, sound, etc.).
 *
 * onReminderStart() is called once when the reminder becomes active, and
 * onReminderEnd() is called once when it becomes inactive. The dispatcher 
 * detects the transitions, so strategies are called only on edges, not 
 * repeatedly while the reminder is on or off.
 */
export interface ReminderStrategy {
  /** Unique identifier for this strategy. Used to route preference updates,
  * match factory entries, and label test buttons in the settings panel. */
  readonly id: ReminderStrategyId

  /** Called once when the reminder transitions to active (overdue). */
  onReminderStart(): void

  /** Called once when the reminder transitions to inactive (idle or suppressed). */
  onReminderEnd(): void

  /**
  * Optional. Called when the reminder is cancelled by user action
  * rather than reaching its natural end. Strategies should clean up
  * visual state but suppress any audible "end" feedback.*/
  onReminderCancel?(): void

  /** Apply runtime configuration (colour, volume, corner, etc.). */
  configure(options: Record<string, unknown>): void

  /** Called when the app is quitting. Clean up OS resources. */
  dispose(): void
}