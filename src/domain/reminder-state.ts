/**
 * Three-state reminder machine: IDLE -> OVERDUE -> SUPPRESSED.
 *
 * Reminders are ONLY shown in the OVERDUE state.
 * SUPPRESSED hides reminders when face tracking is unavailable.
 * Returning from SUPPRESSED always resets the blink timer.
 *
 */

import type { ReminderState, DomainEvent, ReminderTransitionResult } from './types'
import type { BlinkWindow } from './blink-window'

/**
 * Evaluate a state transition given the current state, a domain event,
 * and the blink window (for overdue checks).
 *
 * Returns the new state plus side-effect flags.
 */
export function transition(
  currentState: ReminderState,
  event: DomainEvent,
  blinkWindow: BlinkWindow,
): ReminderTransitionResult {
  switch (currentState) {
    case 'idle':
      return transitionFromIdle(event, blinkWindow)
    case 'overdue':
      return transitionFromOverdue(event)
    case 'suppressed':
      return transitionFromSuppressed(event)
  }
}

function transitionFromIdle(
  event: DomainEvent,
  blinkWindow: BlinkWindow,
): ReminderTransitionResult {
  if (event.type === 'tracking_update' && !event.faceDetected) {
    return { state: 'suppressed', shouldShowReminder: false, shouldResetTimer: false }
  }

  if (event.type === 'timer_tick' && blinkWindow.isOverdue(event.timestamp)) {
    return { state: 'overdue', shouldShowReminder: true, shouldResetTimer: false }
  }

  // blink_detected in IDLE is a no-op (already idle)
  // timer_tick when not overdue is a no-op
  // tracking_update with face detected is a no-op
  return { state: 'idle', shouldShowReminder: false, shouldResetTimer: false }
}

function transitionFromOverdue(event: DomainEvent): ReminderTransitionResult {
  if (event.type === 'blink_detected') {
    return { state: 'idle', shouldShowReminder: false, shouldResetTimer: true }
  }

  if (event.type === 'tracking_update' && !event.faceDetected) {
    return { state: 'suppressed', shouldShowReminder: false, shouldResetTimer: false }
  }

  // Stay overdue
  return { state: 'overdue', shouldShowReminder: true, shouldResetTimer: false }
}

function transitionFromSuppressed(event: DomainEvent): ReminderTransitionResult {
  if (event.type === 'tracking_update' && event.faceDetected) {
    return { state: 'idle', shouldShowReminder: false, shouldResetTimer: true }
  }

  // blink_detected in SUPPRESSED is a no-op
  // timer_tick in SUPPRESSED is a no-op
  // tracking_update with face still lost is a no-op
  return { state: 'suppressed', shouldShowReminder: false, shouldResetTimer: false }
}