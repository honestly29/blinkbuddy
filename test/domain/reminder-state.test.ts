import { describe, it, expect, beforeEach } from 'vitest'
import { transition } from '../../src/domain/reminder-state'
import { BlinkWindow } from '../../src/domain/blink-window'
import type { ReminderState, DomainEvent } from '../../src/domain/types'

describe('Reminder state machine', () => {
  let blinkWindow: BlinkWindow

  beforeEach(() => {
    blinkWindow = new BlinkWindow(10) // 10-second window for easier testing
  })

  // -----------------------------------------------------------------------
  // IDLE → OVERDUE → IDLE (full cycle)
  // -----------------------------------------------------------------------

  describe('IDLE → OVERDUE → IDLE', () => {
    it('transitions to OVERDUE when timer tick fires and blink is overdue', () => {
      blinkWindow.reset(0)
      const tick: DomainEvent = { type: 'timer_tick', timestamp: 10_000 }
      const result = transition('idle', tick, blinkWindow)

      expect(result.state).toBe('overdue')
      expect(result.shouldShowReminder).toBe(true)
      expect(result.shouldResetTimer).toBe(false)
    })

    it('transitions back to IDLE on blink_detected', () => {
      const blink: DomainEvent = { type: 'blink_detected', timestamp: 11_000 }
      const result = transition('overdue', blink, blinkWindow)

      expect(result.state).toBe('idle')
      expect(result.shouldShowReminder).toBe(false)
      expect(result.shouldResetTimer).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // IDLE → SUPPRESSED → IDLE (with timer reset)
  // -----------------------------------------------------------------------

  describe('IDLE → SUPPRESSED → IDLE', () => {
    it('transitions to SUPPRESSED when face is lost', () => {
      const trackingLost: DomainEvent = {
        type: 'tracking_update',
        faceDetected: false,
        timestamp: 5_000,
      }
      const result = transition('idle', trackingLost, blinkWindow)

      expect(result.state).toBe('suppressed')
      expect(result.shouldShowReminder).toBe(false)
    })

    it('transitions back to IDLE when face is restored (resets timer)', () => {
      const trackingRestored: DomainEvent = {
        type: 'tracking_update',
        faceDetected: true,
        timestamp: 15_000,
      }
      const result = transition('suppressed', trackingRestored, blinkWindow)

      expect(result.state).toBe('idle')
      expect(result.shouldShowReminder).toBe(false)
      expect(result.shouldResetTimer).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // OVERDUE → SUPPRESSED → IDLE
  // -----------------------------------------------------------------------

  describe('OVERDUE → SUPPRESSED → IDLE', () => {
    it('transitions from OVERDUE to SUPPRESSED when face is lost', () => {
      const trackingLost: DomainEvent = {
        type: 'tracking_update',
        faceDetected: false,
        timestamp: 12_000,
      }
      const result = transition('overdue', trackingLost, blinkWindow)

      expect(result.state).toBe('suppressed')
      expect(result.shouldShowReminder).toBe(false)
    })

    it('transitions from SUPPRESSED to IDLE when face is restored', () => {
      const trackingRestored: DomainEvent = {
        type: 'tracking_update',
        faceDetected: true,
        timestamp: 20_000,
      }
      const result = transition('suppressed', trackingRestored, blinkWindow)

      expect(result.state).toBe('idle')
      expect(result.shouldResetTimer).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // No-op transitions
  // -----------------------------------------------------------------------

  describe('no-op transitions', () => {
    it('IDLE stays IDLE when timer tick and NOT overdue', () => {
      blinkWindow.reset(0)
      const tick: DomainEvent = { type: 'timer_tick', timestamp: 5_000 }
      const result = transition('idle', tick, blinkWindow)

      expect(result.state).toBe('idle')
      expect(result.shouldShowReminder).toBe(false)
    })

    it('blink_detected in IDLE is a no-op (stays IDLE)', () => {
      const blink: DomainEvent = { type: 'blink_detected', timestamp: 3_000 }
      const result = transition('idle', blink, blinkWindow)

      expect(result.state).toBe('idle')
      expect(result.shouldShowReminder).toBe(false)
      expect(result.shouldResetTimer).toBe(false)
    })

    it('blink_detected in SUPPRESSED is a no-op (stays SUPPRESSED)', () => {
      const blink: DomainEvent = { type: 'blink_detected', timestamp: 8_000 }
      const result = transition('suppressed', blink, blinkWindow)

      expect(result.state).toBe('suppressed')
      expect(result.shouldShowReminder).toBe(false)
    })

    it('tracking_update with face detected in IDLE is a no-op', () => {
      const tracking: DomainEvent = {
        type: 'tracking_update',
        faceDetected: true,
        timestamp: 2_000,
      }
      const result = transition('idle', tracking, blinkWindow)

      expect(result.state).toBe('idle')
    })

    it('tracking_update with face still lost in SUPPRESSED is a no-op', () => {
      const tracking: DomainEvent = {
        type: 'tracking_update',
        faceDetected: false,
        timestamp: 10_000,
      }
      const result = transition('suppressed', tracking, blinkWindow)

      expect(result.state).toBe('suppressed')
    })

    it('timer_tick in OVERDUE stays OVERDUE (reminder still shown)', () => {
      const tick: DomainEvent = { type: 'timer_tick', timestamp: 15_000 }
      const result = transition('overdue', tick, blinkWindow)

      expect(result.state).toBe('overdue')
      expect(result.shouldShowReminder).toBe(true)
    })

    it('timer_tick in SUPPRESSED is a no-op', () => {
      const tick: DomainEvent = { type: 'timer_tick', timestamp: 20_000 }
      const result = transition('suppressed', tick, blinkWindow)

      expect(result.state).toBe('suppressed')
      expect(result.shouldShowReminder).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // Key invariants
  // -----------------------------------------------------------------------

  describe('key invariants', () => {
    it('shouldShowReminder is true ONLY in OVERDUE state', () => {
      const states: ReminderState[] = ['idle', 'overdue', 'suppressed']
      const tick: DomainEvent = { type: 'timer_tick', timestamp: 100_000 }
      blinkWindow.reset(0) // Make it overdue for any tick

      for (const state of states) {
        const result = transition(state, tick, blinkWindow)
        if (result.state === 'overdue') {
          expect(result.shouldShowReminder).toBe(true)
        } else {
          expect(result.shouldShowReminder).toBe(false)
        }
      }
    })
  })
})