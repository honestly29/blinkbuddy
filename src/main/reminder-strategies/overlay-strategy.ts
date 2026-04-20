import type { ReminderStrategy } from './types'

/**
 * Flag-based strategy: just tracks whether the reminder is currently active.
 *
 * The actual overlay UI is drawn by the renderer. The Session Manager reads
 * `active` and passes it to the renderer as `shouldShowReminder` in each
 * StateUpdate message. That means this strategy does not own a BrowserWindow
 * and has nothing to reconfigure at runtime.
 */
export class OverlayReminderStrategy implements ReminderStrategy {
  readonly id = 'overlay'
  private _active = false

  /** Whether the overlay should currently be visible in the renderer. */
  get active(): boolean {
    return this._active
  }

  onReminderStart(): void {
    this._active = true
  }

  onReminderEnd(): void {
    this._active = false
  }

  configure(_options: Record<string, unknown>): void {
    // No configurable settings beyond enable/disable (which is handled by the dispatcher)
  }

  dispose(): void {
    this._active = false
  }
}