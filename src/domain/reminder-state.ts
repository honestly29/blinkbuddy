/**
 * Reminder state machine with three states. 
 * 
 * IDLE is the healthy running state: monitoring is active, face tracking 
 * is working, and the user has blinked recently enough that no reminder is 
 * shown. 
 * 
 * OVERDUE means the blink window has expired and a reminder is visible 
 * until the user blinks.
 * 
 * SUPPRESSED means face tracking has dropped, so reminders are paused
 * until tracking comes back. 
 * 
 * SUPPRESSED can be entered from either IDLE or OVERDUE, and always 
 * returns to IDLE, resetting the blink window since the user may have 
 * stepped away during the gap.
 */

import type { ReminderState, DomainEvent, ReminderTransitionResult } from './types'
import type { BlinkWindow } from './blink-window'

/**
 * Decide what should happen given the current state and an incoming event 
 * (a blink, a timer tick, or a tracking-status change).
 * Returns the new state plus two flags: whether the caller should show a
 * reminder, and whether the caller should reset the blink window. This
 * function only computes the result; acting on the flags is the caller's job.
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

  // All other events stay in IDLE.
  return { state: 'idle', shouldShowReminder: false, shouldResetTimer: false }
}

function transitionFromOverdue(event: DomainEvent): ReminderTransitionResult {
  
  if (event.type === 'blink_detected') {
    return { state: 'idle', shouldShowReminder: false, shouldResetTimer: true }
  }

  if (event.type === 'tracking_update' && !event.faceDetected) {
    return { state: 'suppressed', shouldShowReminder: false, shouldResetTimer: false }
  }

  // All other events stay in OVERDUE with the reminder visible. The reminder
  // persists across timer ticks until the user actually blinks.
  return { state: 'overdue', shouldShowReminder: true, shouldResetTimer: false }
}

function transitionFromSuppressed(event: DomainEvent): ReminderTransitionResult {
  // Reset the blink timer when tracking comes back.
  // The user was likely away or moved, so resuming the old window would
  // pretend no time had passed and could trigger a stale reminder.
  if (event.type === 'tracking_update' && event.faceDetected) {
    return { state: 'idle', shouldShowReminder: false, shouldResetTimer: true }
  }

  // All other events stay in SUPPRESSED.
  return { state: 'suppressed', shouldShowReminder: false, shouldResetTimer: false }
}