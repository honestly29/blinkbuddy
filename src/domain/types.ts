/**
 * Pure domain type definitions for business logic.
 *
 * All timestamps are in milliseconds (consistent with Date.now()).
 */

// ---------------------------------------------------------------------------
// Reminder state machine
// ---------------------------------------------------------------------------

export type ReminderState = 'idle' | 'overdue' | 'suppressed'

// ---------------------------------------------------------------------------
// 20-20-20 rule
// ---------------------------------------------------------------------------

export type TwentyTwentyPhase = 'idle' | 'waiting' | 'break_active'

export interface TwentyTwentyState {
  phase: TwentyTwentyPhase
  timeUntilBreakMs: number
  breakTimeRemainingMs: number
}

// ---------------------------------------------------------------------------
// Blink statistics snapshot
// ---------------------------------------------------------------------------

export interface BlinkStatsSnapshot {
  blinksPerMinute: number
  totalBlinks: number
  interBlinkIntervals: number[]
}

// ---------------------------------------------------------------------------
// Domain event inputs (used by the reminder state machine)
// ---------------------------------------------------------------------------

export interface BlinkDetectedEvent {
  type: 'blink_detected'
  timestamp: number
}

export interface TrackingUpdateEvent {
  type: 'tracking_update'
  faceDetected: boolean
  timestamp: number
}

export interface TimerTickEvent {
  type: 'timer_tick'
  timestamp: number
}

export type DomainEvent = BlinkDetectedEvent | TrackingUpdateEvent | TimerTickEvent

// ---------------------------------------------------------------------------
// State machine transition result
// ---------------------------------------------------------------------------

export interface ReminderTransitionResult {
  state: ReminderState
  shouldShowReminder: boolean
  shouldResetTimer: boolean
}