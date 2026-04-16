import type { ReminderStrategy } from './types'

/**
 * Strategy that controls the renderer's amber blink-reminder overlay.
 *
 * Tracks an `active` flag that the SessionManager reads when building
 * the StateUpdate sent to the renderer. The renderer's <ReminderOverlay>
 * component shows or hides the amber banner based on this value.
 *
 * This strategy doesn't render anything itself - it just acts as a
 * bridge between the dispatcher's start/end events and the existing
 * overlay component in the UI.
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

  dispose(): void {
    this._active = false
  }
}