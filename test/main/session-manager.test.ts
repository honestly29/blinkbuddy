import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SessionManager, type BridgePort, type SessionConfig } from '../../src/main/session-manager'
import { ReminderDispatcher } from '../../src/main/reminder-strategies/reminder-dispatcher'
import type { ReminderStrategy } from '../../src/main/reminder-strategies/types'
import type { PythonEvent } from '../../src/shared/protocol'
import type { StateUpdate } from '../../src/shared/ipc-messages'

// ---------------------------------------------------------------------------
// Mock PythonBridge (manual EventEmitter to avoid node:events import
// which is intercepted by vite-plugin-electron-renderer)
// ---------------------------------------------------------------------------

type Listener = (...args: any[]) => void

class MockBridge implements BridgePort {
  private listeners = new Map<string, Set<Listener>>()
  send = vi.fn()

  on(event: string, listener: Listener): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
    return this
  }

  removeListener(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener)
    return this
  }

  emit(event: string, ...args: any[]): boolean {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return false
    for (const fn of set) {
      fn(...args)
    }
    return true
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: SessionConfig = {
  cameraIndex: 0,
  previewEnabled: false,
  blinkWindowSeconds: 10, 
  twentyTwentyEnabled: false,
}

function blinkEvent(timestamp: number): PythonEvent {
  return { type: 'blink_event', timestamp, duration_ms: null, ear_value: 0.18 }
}

function trackingEvent(faceDetected: boolean, timestamp: number): PythonEvent {
  return { type: 'tracking_status', face_detected: faceDetected, quality: 0.9, fps: 30, timestamp }
}

/** Extract the most recent StateUpdate sent to the renderer. */
function lastUpdate(sendToRenderer: ReturnType<typeof vi.fn>): StateUpdate {
  const calls = sendToRenderer.mock.calls
  return calls[calls.length - 1][1] as StateUpdate
}

/** Start and confirm running (clears startup timeout). */
function startWithConfirm(manager: SessionManager, config: SessionConfig, bridge: MockBridge): void {
  manager.start(config)
  // Simulate Python confirming successful startup
  bridge.emit('event', { type: 'status', state: 'running' } as PythonEvent)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionManager', () => {
  let bridge: MockBridge
  let sendToRenderer: ReturnType<typeof vi.fn>
  let manager: SessionManager

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    bridge = new MockBridge()
    sendToRenderer = vi.fn()
    manager = new SessionManager({ bridge, sendToRenderer, throttleMs: 0 })
  })

  afterEach(() => {
    // Stop any running session to clear intervals
    if (manager.isRunning()) {
      manager.stop()
    }
    vi.useRealTimers()
  })

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('lifecycle', () => {
    it('sends start command to Python bridge', () => {
      manager.start(DEFAULT_CONFIG)

      expect(bridge.send).toHaveBeenCalledWith({
        type: 'start',
        camera_index: 0,
        preview_enabled: false,
      })
    })

    it('passes camera config to start command', () => {
      manager.start({ ...DEFAULT_CONFIG, cameraIndex: 2, previewEnabled: true })

      expect(bridge.send).toHaveBeenCalledWith({
        type: 'start',
        camera_index: 2,
        preview_enabled: true,
      })
    })

    it('pushes initial state update on start', () => {
      manager.start(DEFAULT_CONFIG)

      expect(sendToRenderer).toHaveBeenCalledTimes(1)
      const update = lastUpdate(sendToRenderer)
      expect(update.type).toBe('state_update')
      expect(update.running).toBe(true)
      expect(update.reminderState).toBe('idle')
      expect(update.shouldShowReminder).toBe(false)
      expect(update.totalBlinks).toBe(0)
      expect(update.blinksPerMinute).toBe(0)
      expect(update.faceDetected).toBe(false)
      expect(update.remindersTriggered).toBe(0)
    })

    it('is a no-op when already running', () => {
      manager.start(DEFAULT_CONFIG)
      bridge.send.mockClear()
      sendToRenderer.mockClear()

      manager.start(DEFAULT_CONFIG)

      expect(bridge.send).not.toHaveBeenCalled()
      expect(sendToRenderer).not.toHaveBeenCalled()
    })

    it('reports running state correctly', () => {
      expect(manager.isRunning()).toBe(false)
      manager.start(DEFAULT_CONFIG)
      expect(manager.isRunning()).toBe(true)
      manager.stop()
      expect(manager.isRunning()).toBe(false)
    })

    it('sends stop command on stop', () => {
      manager.start(DEFAULT_CONFIG)
      bridge.send.mockClear()

      manager.stop()

      expect(bridge.send).toHaveBeenCalledWith({ type: 'stop' })
    })

    it('pushes final state update on stop', () => {
      manager.start(DEFAULT_CONFIG)
      sendToRenderer.mockClear()

      manager.stop()

      expect(sendToRenderer).toHaveBeenCalledTimes(1)
      const update = lastUpdate(sendToRenderer)
      expect(update.running).toBe(false)
      expect(update.reminderState).toBe('idle')
    })

    it('clears tick interval on stop', () => {
      manager.start(DEFAULT_CONFIG)
      manager.stop()
      sendToRenderer.mockClear()

      // Advance time - no more ticks should fire
      vi.advanceTimersByTime(5000)

      expect(sendToRenderer).not.toHaveBeenCalled()
    })

    it('is a no-op when stopping while not running', () => {
      manager.stop()

      expect(bridge.send).not.toHaveBeenCalled()
      expect(sendToRenderer).not.toHaveBeenCalled()
    })

    it('can restart after stopping', () => {
      manager.start(DEFAULT_CONFIG)
      manager.stop()
      bridge.send.mockClear()
      sendToRenderer.mockClear()

      manager.start(DEFAULT_CONFIG)

      expect(manager.isRunning()).toBe(true)
      expect(bridge.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'start' }),
      )
      expect(sendToRenderer).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------
  // Blink event handling
  // -----------------------------------------------------------------------

  describe('blink event handling', () => {
    it('records blink in stats', () => {
      manager.start(DEFAULT_CONFIG)
      sendToRenderer.mockClear()

      bridge.emit('event', blinkEvent(1000))

      const update = lastUpdate(sendToRenderer)
      expect(update.totalBlinks).toBe(1)
    })

    it('accumulates blink count', () => {
      manager.start(DEFAULT_CONFIG)

      bridge.emit('event', blinkEvent(1000))
      bridge.emit('event', blinkEvent(2000))
      bridge.emit('event', blinkEvent(3000))

      const update = lastUpdate(sendToRenderer)
      expect(update.totalBlinks).toBe(3)
    })

    it('pushes state update on each blink', () => {
      manager.start(DEFAULT_CONFIG)
      sendToRenderer.mockClear()

      bridge.emit('event', blinkEvent(1000))

      expect(sendToRenderer).toHaveBeenCalledTimes(1)
      expect(sendToRenderer).toHaveBeenCalledWith(
        'blink:state-update',
        expect.objectContaining({ type: 'state_update' }),
      )
    })

    it('transitions OVERDUE -> IDLE on blink', () => {
      startWithConfirm(manager, DEFAULT_CONFIG, bridge)

      // Advance past the 10-second window to become overdue
      vi.advanceTimersByTime(10_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('overdue')

      // Blink should clear the overdue state
      vi.setSystemTime(10_500)
      bridge.emit('event', blinkEvent(10_500))

      const update = lastUpdate(sendToRenderer)
      expect(update.reminderState).toBe('idle')
      expect(update.shouldShowReminder).toBe(false)
    })

    it('ignores blink events when not running', () => {
      manager.start(DEFAULT_CONFIG)
      manager.stop()
      sendToRenderer.mockClear()

      bridge.emit('event', blinkEvent(5000))

      // No update because listener was removed on stop
      expect(sendToRenderer).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // Timer tick
  // -----------------------------------------------------------------------

  describe('timer tick', () => {
    it('transitions IDLE -> OVERDUE when blink window expires', () => {
      startWithConfirm(manager, DEFAULT_CONFIG, bridge)

      // Advance exactly to the window boundary (10 seconds)
      vi.advanceTimersByTime(10_000)

      const update = lastUpdate(sendToRenderer)
      expect(update.reminderState).toBe('overdue')
      expect(update.shouldShowReminder).toBe(true)
    })

    it('stays IDLE before the window expires', () => {
      startWithConfirm(manager, DEFAULT_CONFIG, bridge)

      // Advance 9 seconds - not yet overdue
      vi.advanceTimersByTime(9000)

      const update = lastUpdate(sendToRenderer)
      expect(update.reminderState).toBe('idle')
      expect(update.shouldShowReminder).toBe(false)
    })

    it('increments remindersTriggered on transition to OVERDUE', () => {
      startWithConfirm(manager, DEFAULT_CONFIG, bridge)

      vi.advanceTimersByTime(10_000)

      expect(lastUpdate(sendToRenderer).remindersTriggered).toBe(1)
    })

    it('does not double-count while staying OVERDUE', () => {
      startWithConfirm(manager, DEFAULT_CONFIG, bridge)

      // Become overdue, then stay overdue for several more ticks
      vi.advanceTimersByTime(13_000)

      expect(lastUpdate(sendToRenderer).remindersTriggered).toBe(1)
    })

    it('counts multiple overdue episodes', () => {
      startWithConfirm(manager, DEFAULT_CONFIG, bridge)

      // First overdue
      vi.advanceTimersByTime(10_000)
      expect(lastUpdate(sendToRenderer).remindersTriggered).toBe(1)

      // Blink to reset
      vi.setSystemTime(11_000)
      bridge.emit('event', blinkEvent(11_000))
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // Second overdue
      vi.advanceTimersByTime(10_000)
      expect(lastUpdate(sendToRenderer).remindersTriggered).toBe(2)
    })

    it('tracks session duration', () => {
      manager.start(DEFAULT_CONFIG)

      vi.advanceTimersByTime(5000)

      const update = lastUpdate(sendToRenderer)
      expect(update.sessionDurationMs).toBe(5000)
    })
  })

  // -----------------------------------------------------------------------
  // Tracking status
  // -----------------------------------------------------------------------

  describe('tracking status', () => {
    it('transitions to SUPPRESSED when face is lost', () => {
      manager.start(DEFAULT_CONFIG)
      sendToRenderer.mockClear()

      bridge.emit('event', trackingEvent(false, 1000))

      const update = lastUpdate(sendToRenderer)
      expect(update.reminderState).toBe('suppressed')
      expect(update.shouldShowReminder).toBe(false)
      expect(update.faceDetected).toBe(false)
    })

    it('transitions SUPPRESSED -> IDLE when face is restored', () => {
      manager.start(DEFAULT_CONFIG)

      // Lose face
      bridge.emit('event', trackingEvent(false, 1000))
      expect(lastUpdate(sendToRenderer).reminderState).toBe('suppressed')

      // Restore face
      vi.setSystemTime(5000)
      bridge.emit('event', trackingEvent(true, 5000))

      const update = lastUpdate(sendToRenderer)
      expect(update.reminderState).toBe('idle')
      expect(update.faceDetected).toBe(true)
    })

    it('resets blink timer when face is restored', () => {
      startWithConfirm(manager, DEFAULT_CONFIG, bridge)

      // Advance 8 seconds (close to overdue, but not yet)
      vi.advanceTimersByTime(8000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // Lose face at t=8000
      bridge.emit('event', trackingEvent(false, 8000))
      expect(lastUpdate(sendToRenderer).reminderState).toBe('suppressed')

      // Restore face at t=9000 - timer should reset from this point
      vi.setSystemTime(9000)
      bridge.emit('event', trackingEvent(true, 9000))
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // Advance 9 more seconds (t=18000) - should NOT be overdue yet
      // because timer was reset at t=9000
      vi.advanceTimersByTime(9000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // Advance 1 more second (t=19000) - NOW overdue (10s since reset at t=9000)
      vi.advanceTimersByTime(1000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('overdue')
    })

    it('suppresses overdue reminder when face is lost', () => {
      startWithConfirm(manager, DEFAULT_CONFIG, bridge)

      // Become overdue
      vi.advanceTimersByTime(10_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('overdue')
      expect(lastUpdate(sendToRenderer).shouldShowReminder).toBe(true)

      // Lose face - should suppress
      bridge.emit('event', trackingEvent(false, 10_000))

      const update = lastUpdate(sendToRenderer)
      expect(update.reminderState).toBe('suppressed')
      expect(update.shouldShowReminder).toBe(false)
    })

    it('updates faceDetected flag', () => {
      manager.start(DEFAULT_CONFIG)

      bridge.emit('event', trackingEvent(true, 1000))
      expect(lastUpdate(sendToRenderer).faceDetected).toBe(true)

      bridge.emit('event', trackingEvent(false, 2000))
      expect(lastUpdate(sendToRenderer).faceDetected).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // Python error / exit handling
  // -----------------------------------------------------------------------

  describe('Python error handling', () => {
    it('stops session on bridge error', () => {
      manager.start(DEFAULT_CONFIG)

      bridge.emit('error', new Error('Camera access denied'))

      expect(manager.isRunning()).toBe(false)
    })

    it('sends error state to renderer on bridge error', () => {
      manager.start(DEFAULT_CONFIG)
      sendToRenderer.mockClear()

      bridge.emit('error', new Error('Camera access denied'))

      const update = lastUpdate(sendToRenderer)
      expect(update.running).toBe(false)
      expect(update.error).toBe('Camera access denied')
    })

    it('stops session on unexpected Python exit', () => {
      manager.start(DEFAULT_CONFIG)

      bridge.emit('exit', 1, null)

      expect(manager.isRunning()).toBe(false)
    })

    it('sends error state to renderer on unexpected exit', () => {
      manager.start(DEFAULT_CONFIG)
      sendToRenderer.mockClear()

      bridge.emit('exit', 1, null)

      const update = lastUpdate(sendToRenderer)
      expect(update.running).toBe(false)
      expect(update.error).toContain('Python process exited unexpectedly')
      expect(update.error).toContain('code=1')
    })

    it('clears tick interval on error', () => {
      manager.start(DEFAULT_CONFIG)
      bridge.emit('error', new Error('fail'))
      sendToRenderer.mockClear()

      vi.advanceTimersByTime(5000)

      expect(sendToRenderer).not.toHaveBeenCalled()
    })

    it('ignores errors when not running', () => {
      // Not started - error should be ignored
      bridge.emit('error', new Error('irrelevant'))

      expect(sendToRenderer).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // 20-20-20 integration
  // -----------------------------------------------------------------------

  describe('20-20-20 integration', () => {
    it('starts timer when enabled', () => {
      manager.start({ ...DEFAULT_CONFIG, twentyTwentyEnabled: true })

      const update = lastUpdate(sendToRenderer)
      expect(update.twentyTwentyState.phase).toBe('waiting')
      expect(update.twentyTwentyState.timeUntilBreakMs).toBeGreaterThan(0)
    })

    it('does not start timer when disabled', () => {
      manager.start({ ...DEFAULT_CONFIG, twentyTwentyEnabled: false })

      const update = lastUpdate(sendToRenderer)
      expect(update.twentyTwentyState.phase).toBe('idle')
      expect(update.twentyTwentyState.timeUntilBreakMs).toBe(0)
    })

    it('includes twenty-twenty state in tick updates', () => {
      manager.start({ ...DEFAULT_CONFIG, twentyTwentyEnabled: true })
      sendToRenderer.mockClear()

      vi.advanceTimersByTime(1000)

      const update = lastUpdate(sendToRenderer)
      expect(update.twentyTwentyState).toBeDefined()
      expect(update.twentyTwentyState.phase).toBe('waiting')
    })

    it('transitions to break after 20 minutes', () => {
      startWithConfirm(manager, { ...DEFAULT_CONFIG, twentyTwentyEnabled: true }, bridge)

      // Advance 20 minutes
      vi.advanceTimersByTime(20 * 60 * 1000)

      const update = lastUpdate(sendToRenderer)
      expect(update.twentyTwentyState.phase).toBe('break_active')
      expect(update.twentyTwentyState.breakTimeRemainingMs).toBeGreaterThan(0)
    })

    it('stops timer on session stop', () => {
      manager.start({ ...DEFAULT_CONFIG, twentyTwentyEnabled: true })
      manager.stop()

      const update = lastUpdate(sendToRenderer)
      expect(update.twentyTwentyState.phase).toBe('idle')
    })
  })

  // -----------------------------------------------------------------------
  // Session summary
  // -----------------------------------------------------------------------

  describe('session summary', () => {
    it('returns correct summary data', () => {
      startWithConfirm(manager, DEFAULT_CONFIG, bridge)

      // Record some blinks with 1-second intervals
      bridge.emit('event', blinkEvent(1000))
      bridge.emit('event', blinkEvent(2000))
      bridge.emit('event', blinkEvent(3000))

      // Advance time to trigger one reminder (blink window expires)
      vi.advanceTimersByTime(15_000)

      // Set the system clock for getSessionSummary() to compute duration
      vi.setSystemTime(15_000)
      const summary = manager.getSessionSummary()

      expect(summary.totalBlinks).toBe(3)
      expect(summary.remindersTriggered).toBe(1)
      expect(summary.totalDurationSeconds).toBe(15)
      expect(summary.sessionStart).toBe(new Date(0).toISOString())
      expect(summary.sessionEnd).toBe(new Date(15_000).toISOString())
      expect(summary.avgBlinksPerMinute).toBeCloseTo(12, 0) // 3 blinks / 0.25 min = 12
      expect(summary.twentyTwentyBreaksTaken).toBe(0)
      expect(summary.longestGapBetweenBlinks).toBe(1) // 1000ms gap = 1s
      // Equal intervals (all 1000ms) have zero standard deviation
      expect(summary.blinkRateStdDev).toBe(0) 
    })

    it('returns zero averages when no duration', () => {
      // No session started: all metrics should be zero
      const summary = manager.getSessionSummary()

      expect(summary.totalBlinks).toBe(0)
      expect(summary.avgBlinksPerMinute).toBe(0)
      expect(summary.totalDurationSeconds).toBe(0)
    })
  })

  // -----------------------------------------------------------------------
  // Full cycle integration
  // -----------------------------------------------------------------------

  describe('full cycle: idle -> overdue -> idle (on blink)', () => {
    it('completes the idle -> overdue -> idle cycle', () => {
      startWithConfirm(manager, DEFAULT_CONFIG, bridge)

      // Initially idle
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // Wait 10 seconds -> overdue
      vi.advanceTimersByTime(10_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('overdue')
      expect(lastUpdate(sendToRenderer).shouldShowReminder).toBe(true)

      // Blink -> back to idle
      vi.setSystemTime(10_500)
      bridge.emit('event', blinkEvent(10_500))
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')
      expect(lastUpdate(sendToRenderer).shouldShowReminder).toBe(false)

      // Wait another 10 seconds from the blink -> overdue again
      vi.advanceTimersByTime(10_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('overdue')
      expect(lastUpdate(sendToRenderer).remindersTriggered).toBe(2)
    })
  })

  describe('full cycle: idle -> suppressed -> idle with timer reset', () => {
    it('completes the idle -> suppressed -> idle cycle', () => {
      startWithConfirm(manager, DEFAULT_CONFIG, bridge)

      // Wait 5 seconds
      vi.advanceTimersByTime(5000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // Lose face at t=5000
      bridge.emit('event', trackingEvent(false, 5000))
      expect(lastUpdate(sendToRenderer).reminderState).toBe('suppressed')

      // Wait 10 seconds with no face - should stay suppressed (not overdue)
      vi.advanceTimersByTime(10_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('suppressed')

      // Restore face at t=15000 - timer resets
      vi.setSystemTime(15_000)
      bridge.emit('event', trackingEvent(true, 15_000))
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // Now wait full window from reset point -> overdue
      vi.advanceTimersByTime(10_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('overdue')
    })
  })


   // -----------------------------------------------------------------------
  // Cold-start clock behaviour 
  // -----------------------------------------------------------------------

  describe('cold-start clock', () => {
    it('does not fire overdue before Python confirms running', () => {
      manager.start(DEFAULT_CONFIG)
      sendToRenderer.mockClear()

      vi.advanceTimersByTime(25_000)

      for (const call of sendToRenderer.mock.calls) {
        const update = call[1] as StateUpdate
        expect(update.reminderState).not.toBe('overdue')
        expect(update.shouldShowReminder).toBe(false)
      }
    })

    it('starts the blink clock on status:running, not on click', () => {
      manager.start(DEFAULT_CONFIG)

      // Python cold-imports for 15s before confirming.
      vi.advanceTimersByTime(15_000)
      vi.setSystemTime(15_000)
      bridge.emit('event', { type: 'status', state: 'running' } as PythonEvent)

      // 9s after confirmation - not overdue yet (clock started at 15s).
      vi.advanceTimersByTime(9_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // 10s after confirmation - now overdue.
      vi.advanceTimersByTime(1_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('overdue')
      expect(lastUpdate(sendToRenderer).shouldShowReminder).toBe(true)
    })

    it('falls back to starting the clock on first face-detected tracking event', () => {
      // if status:running is somehow missed, the first
      // positive tracking status should still anchor the clock.
      manager.start(DEFAULT_CONFIG)

      vi.advanceTimersByTime(8_000)
      vi.setSystemTime(8_000)
      bridge.emit('event', trackingEvent(true, 8_000))

      vi.advanceTimersByTime(9_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      vi.advanceTimersByTime(1_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('overdue')
    })

    it('reproduces the original bug scenario and now fires overdue', () => {
      // start, then cold-start delay, then
      // MediaPipe warm-up yields tracking(false) -> tracking(true)
      // before any overdue opportunity. Clock should start at
      // status:running and only reset on the suppressed->idle transition
      // if it was legitimately restarted.
      manager.start(DEFAULT_CONFIG)

      // Python confirms running at T=15s.
      vi.advanceTimersByTime(15_000)
      vi.setSystemTime(15_000)
      bridge.emit('event', { type: 'status', state: 'running' } as PythonEvent)

      // face lost then restored within ~1s.
      vi.setSystemTime(15_200)
      bridge.emit('event', trackingEvent(false, 15_200))
      expect(lastUpdate(sendToRenderer).reminderState).toBe('suppressed')

      vi.setSystemTime(16_000)
      bridge.emit('event', trackingEvent(true, 16_000))
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // Overdue should fire ~10s after the suppressed->idle reset at T=16s,
      vi.advanceTimersByTime(10_000) // now T=26s
      expect(lastUpdate(sendToRenderer).reminderState).toBe('overdue')
      expect(lastUpdate(sendToRenderer).shouldShowReminder).toBe(true)
    })
  })


  // -----------------------------------------------------------------------
  // Startup timeout
  // -----------------------------------------------------------------------
  describe('startup timeout', () => {
    it('fires error after 30s with no status:running confirmation', () => {
      // Use start() (NOT startWithConfirm) to leave the timeout active
      manager.start(DEFAULT_CONFIG)

      vi.advanceTimersByTime(30_000)

      expect(manager.isRunning()).toBe(false)
      const update = lastUpdate(sendToRenderer)
      expect(update.running).toBe(false)
      expect(update.error).toBe('Could not start detection service')
    })

    it('clears on status:running confirmation', () => {
      // Confirm startup, which clears the timeout
      startWithConfirm(manager, DEFAULT_CONFIG, bridge)

      // Advance past 10s - should NOT trigger timeout
      vi.advanceTimersByTime(9000)

      expect(manager.isRunning()).toBe(true)
      expect(lastUpdate(sendToRenderer).error).toBeUndefined()
    })

    it('clears on manual stop before timeout fires', () => {
      manager.start(DEFAULT_CONFIG)
      manager.stop()  // User stops before Python confirms
      sendToRenderer.mockClear()

      // Advance past 10s - should NOT trigger timeout
      vi.advanceTimersByTime(10_000)

      // No extra state pushes (timeout was cleared by stop())
      expect(sendToRenderer).not.toHaveBeenCalled()
    })

    it('clears on Python error event before timeout fires', () => {
      manager.start(DEFAULT_CONFIG)

      // Python emits a camera error (which calls teardown, clearing the timeout)
      bridge.emit('event', { type: 'error', code: 'CAMERA_OPEN_FAILED', message: 'No camera' } as PythonEvent)

      // The error event should have torn down and cleared timeout
      sendToRenderer.mockClear()
      vi.advanceTimersByTime(10_000)

      // No extra error from the timeout firing
      expect(sendToRenderer).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // Python error event handling
  // -----------------------------------------------------------------------

  describe('Python error event handling', () => {
    it('stops session and shows error message on Python error event', () => {
      manager.start(DEFAULT_CONFIG)
      sendToRenderer.mockClear()

      // Simulate Python emitting a camera error
      bridge.emit('event', { type: 'error', code: 'CAMERA_OPEN_FAILED', message: 'Could not open camera at index 0' } as PythonEvent)

      // Session should be torn down with the error message from Python
      expect(manager.isRunning()).toBe(false)
      const update = lastUpdate(sendToRenderer)
      expect(update.running).toBe(false)
      expect(update.error).toBe('Could not open camera at index 0')
    })

    it('stops session on permission denied error', () => {
      manager.start(DEFAULT_CONFIG)
      sendToRenderer.mockClear()

      // Simulate the macOS-specific permission denied error
      bridge.emit('event', {
        type: 'error',
        code: 'CAMERA_PERMISSION_DENIED',
        message: 'Camera access denied. Please grant permission in System Settings > Privacy & Security > Camera.',
      } as PythonEvent)

      expect(manager.isRunning()).toBe(false)
      const update = lastUpdate(sendToRenderer)
      expect(update.error).toContain('Camera access denied')
    })

    it('clears tick interval on Python error event', () => {
      manager.start(DEFAULT_CONFIG)
      // Error tears down the session (including clearing the tick interval)
      bridge.emit('event', { type: 'error', code: 'FAIL', message: 'Boom' } as PythonEvent)
      sendToRenderer.mockClear()

      // Advance time - no tick callbacks should fire (interval was cleared)
      vi.advanceTimersByTime(5000)

      expect(sendToRenderer).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // Throttle
  // -----------------------------------------------------------------------

  describe('state update throttle', () => {
    let throttledManager: SessionManager

    beforeEach(() => {
      throttledManager = new SessionManager({ bridge, sendToRenderer, throttleMs: 100 })
    })

    afterEach(() => {
      if (throttledManager.isRunning()) {
        throttledManager.stop()
      }
    })

    it('throttles rapid blink events within 100ms', () => {
      startWithConfirm(throttledManager, DEFAULT_CONFIG, bridge)
      // Advance past throttle window so first blink sends immediately
      vi.advanceTimersByTime(100)
      sendToRenderer.mockClear()

      // Send 5 blink events in rapid succession (all at same fake time)
      for (let i = 0; i < 5; i++) {
        bridge.emit('event', blinkEvent(1100 + i))
      }

      // First blink sends immediately (100ms since last push).
      // Remaining 4 are within the throttle window: only 1 trailing push scheduled.
      // So total is at most 2 (1 immediate + 1 pending).
      const callCount = sendToRenderer.mock.calls.length
      expect(callCount).toBeLessThanOrEqual(2)
    })

    it('pending push fires after delay', () => {
      startWithConfirm(throttledManager, DEFAULT_CONFIG, bridge)
      // Advance past throttle window twice to clear initial state
      vi.advanceTimersByTime(200)
      sendToRenderer.mockClear()

      // First blink: immediate (100ms+ since last push)
      bridge.emit('event', blinkEvent(1000))
      const afterFirst = sendToRenderer.mock.calls.length
      expect(afterFirst).toBe(1)

      // Second blink: within 100ms window, should be throttled (pending)
      bridge.emit('event', blinkEvent(1001))
      const afterSecond = sendToRenderer.mock.calls.length
      expect(afterSecond).toBe(1) // Still 1 - second blink is pending

      // Advance 100ms - the trailing push fires with the latest state
      vi.advanceTimersByTime(100)
      expect(sendToRenderer.mock.calls.length).toBe(2)
    })

    it('errors bypass throttle', () => {
      startWithConfirm(throttledManager, DEFAULT_CONFIG, bridge)

      // Send a blink to set lastPushTime (starts the throttle window)
      bridge.emit('event', blinkEvent(1000))
      sendToRenderer.mockClear()

      // Error should send immediately even though within 100ms
      bridge.emit('event', { type: 'error', code: 'FAIL', message: 'Error!' } as PythonEvent)

      expect(sendToRenderer.mock.calls.length).toBe(1)
      expect(lastUpdate(sendToRenderer).error).toBe('Error!')
    })
  })


  // -----------------------------------------------------------------------
  // 20-20-20 break dispatcher + blink suppression
  // -----------------------------------------------------------------------

  describe('20-20-20 break dispatcher wiring', () => {
    // Inline factory for spy strategies
    function createSpyStrategy(id: string): ReminderStrategy & {
      onReminderStart: ReturnType<typeof vi.fn>
      onReminderEnd: ReturnType<typeof vi.fn>
      configure: ReturnType<typeof vi.fn>
      dispose: ReturnType<typeof vi.fn>
    } {
      return {
        id,
        onReminderStart: vi.fn(),
        onReminderEnd: vi.fn(),
        configure: vi.fn(),
        dispose: vi.fn(),
      }
    }

    const TWENTY_MINUTES_MS = 20 * 60 * 1000
    const BREAK_MS = 20 * 1000

    let blinkStrategy: ReturnType<typeof createSpyStrategy>
    let twentyTwentyStrategy: ReturnType<typeof createSpyStrategy>
    let blinkDispatcher: ReminderDispatcher
    let twentyTwentyDispatcher: ReminderDispatcher
    let wiredManager: SessionManager

    beforeEach(() => {
      // Build a real SessionManager with real dispatchers holding spy strategies.
      blinkStrategy = createSpyStrategy('overlay')
      twentyTwentyStrategy = createSpyStrategy('twenty-twenty-popup')
      blinkDispatcher = new ReminderDispatcher([blinkStrategy])
      twentyTwentyDispatcher = new ReminderDispatcher([twentyTwentyStrategy])
      wiredManager = new SessionManager({
        bridge,
        sendToRenderer,
        throttleMs: 0,
        reminderDispatcher: blinkDispatcher,
        twentyTwentyDispatcher,
      })
    })

    afterEach(() => {
      if (wiredManager.isRunning()) {
        wiredManager.stop()
      }
    })

    it('fires onReminderStart on the 20-20-20 dispatcher when break begins', () => {
      // blinkWindowSeconds:999 prevents a blink reminder from firing
      // during the 20-minute wait
      startWithConfirm(
        wiredManager,
        { ...DEFAULT_CONFIG, twentyTwentyEnabled: true, blinkWindowSeconds: 999 },
        bridge,
      )

      vi.advanceTimersByTime(TWENTY_MINUTES_MS)

      expect(twentyTwentyStrategy.onReminderStart).toHaveBeenCalledTimes(1)
    })

    it('fires onReminderEnd on the 20-20-20 dispatcher when break ends', () => {
      startWithConfirm(
        wiredManager,
        { ...DEFAULT_CONFIG, twentyTwentyEnabled: true, blinkWindowSeconds: 999 },
        bridge,
      )

      vi.advanceTimersByTime(TWENTY_MINUTES_MS) // break begins
      twentyTwentyStrategy.onReminderEnd.mockClear()

      vi.advanceTimersByTime(BREAK_MS) // break ends

      expect(twentyTwentyStrategy.onReminderEnd).toHaveBeenCalledTimes(1)
    })

    it('suppresses blink reminder during the 20-20-20 break window', () => {
      // Proves that when a break fires, the blink dispatcher gets 
      // deactivated even if the blink window is already overdue.
      startWithConfirm(
        wiredManager,
        { ...DEFAULT_CONFIG, twentyTwentyEnabled: true, blinkWindowSeconds: 10 },
        bridge,
      )

      // Blink window elapses long before the 20-minute mark -> reminder active
      vi.advanceTimersByTime(10_000)
      expect(blinkStrategy.onReminderStart).toHaveBeenCalledTimes(1)
      blinkStrategy.onReminderEnd.mockClear()

      // Advance to break start - blink reminder must be deactivated
      vi.advanceTimersByTime(TWENTY_MINUTES_MS - 10_000)

      expect(twentyTwentyStrategy.onReminderStart).toHaveBeenCalledTimes(1)
      expect(blinkStrategy.onReminderEnd).toHaveBeenCalledTimes(1)
      expect(lastUpdate(sendToRenderer).shouldShowReminder).toBe(false)
    })

    it('resumes blink reminder after break ends if still overdue', () => {
      startWithConfirm(
        wiredManager,
        { ...DEFAULT_CONFIG, twentyTwentyEnabled: true, blinkWindowSeconds: 10 },
        bridge,
      )

      // Enter the break (blink reminder is already active, then suppressed)
      vi.advanceTimersByTime(TWENTY_MINUTES_MS)
      blinkStrategy.onReminderStart.mockClear()

      // Break ends -> blink reminder should re-fire on the next tick
      vi.advanceTimersByTime(BREAK_MS)

      expect(blinkStrategy.onReminderStart).toHaveBeenCalled()
    })

    it('ignores blink events from Python during break (no reminder edge)', () => {
      startWithConfirm(
        wiredManager,
        { ...DEFAULT_CONFIG, twentyTwentyEnabled: true, blinkWindowSeconds: 10 },
        bridge,
      )

      // Enter the break (reminder suppressed at this point)
      vi.advanceTimersByTime(TWENTY_MINUTES_MS)
      blinkStrategy.onReminderStart.mockClear()
      blinkStrategy.onReminderEnd.mockClear()

      // A blink arrives during the break - it should not toggle the reminder
      vi.setSystemTime(TWENTY_MINUTES_MS + 5_000)
      bridge.emit('event', blinkEvent(TWENTY_MINUTES_MS + 5_000))

      expect(blinkStrategy.onReminderStart).not.toHaveBeenCalled()
      expect(blinkStrategy.onReminderEnd).not.toHaveBeenCalled()
    })

    it('deactivates the 20-20-20 dispatcher on stop during an active break', () => {
      // Stopping mid-break must clean up the popup and play the end sound
      startWithConfirm(
        wiredManager,
        { ...DEFAULT_CONFIG, twentyTwentyEnabled: true, blinkWindowSeconds: 999 },
        bridge,
      )

      vi.advanceTimersByTime(TWENTY_MINUTES_MS)
      expect(twentyTwentyStrategy.onReminderStart).toHaveBeenCalledTimes(1)

      wiredManager.stop()

      expect(twentyTwentyStrategy.onReminderEnd).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------
  // Mid-session 20-20-20 toggle
  // -----------------------------------------------------------------------

  describe('mid-session 20-20-20 toggle', () => {
    function createSpyStrategy(id: string, withCancel: boolean): ReminderStrategy & {
      onReminderStart: ReturnType<typeof vi.fn>
      onReminderEnd: ReturnType<typeof vi.fn>
      onReminderCancel?: ReturnType<typeof vi.fn>
      configure: ReturnType<typeof vi.fn>
      dispose: ReturnType<typeof vi.fn>
    } {
      return {
        id,
        onReminderStart: vi.fn(),
        onReminderEnd: vi.fn(),
        ...(withCancel ? { onReminderCancel: vi.fn() } : {}),
        configure: vi.fn(),
        dispose: vi.fn(),
      }
    }

    const TWENTY_MINUTES_MS = 20 * 60 * 1000

    let popupStrategy: ReturnType<typeof createSpyStrategy>
    let audioStrategy: ReturnType<typeof createSpyStrategy>
    let twentyTwentyDispatcher: ReminderDispatcher
    let wiredManager: SessionManager

    beforeEach(() => {
      popupStrategy = createSpyStrategy('twenty-twenty-popup', false)
      audioStrategy = createSpyStrategy('twenty-twenty-audio', true)
      twentyTwentyDispatcher = new ReminderDispatcher([popupStrategy, audioStrategy])
      wiredManager = new SessionManager({
        bridge,
        sendToRenderer,
        throttleMs: 0,
        twentyTwentyDispatcher,
      })
    })

    afterEach(() => {
      if (wiredManager.isRunning()) {
        wiredManager.stop()
      }
    })

    it('is a no-op when not running', () => {
      wiredManager.setTwentyTwentyEnabled(true)
      wiredManager.setTwentyTwentyEnabled(false)

      expect(popupStrategy.onReminderStart).not.toHaveBeenCalled()
      expect(popupStrategy.onReminderEnd).not.toHaveBeenCalled()
    })

    it('enable from a disabled session starts a fresh 20-minute cycle', () => {
      wiredManager.start({ ...DEFAULT_CONFIG, twentyTwentyEnabled: false })
      expect(lastUpdate(sendToRenderer).twentyTwentyState.phase).toBe('idle')
      sendToRenderer.mockClear()

      wiredManager.setTwentyTwentyEnabled(true)

      const update = lastUpdate(sendToRenderer)
      expect(update.twentyTwentyState.phase).toBe('waiting')
      expect(update.twentyTwentyState.timeUntilBreakMs).toBeGreaterThan(TWENTY_MINUTES_MS - 100)
    })

    it('enable does not reset the cycle if already waiting', () => {
      startWithConfirm(wiredManager, { ...DEFAULT_CONFIG, twentyTwentyEnabled: true }, bridge)

      // Advance 10 minutes into the cycle
      vi.advanceTimersByTime(10 * 60 * 1000)
      const beforeMs = lastUpdate(sendToRenderer).twentyTwentyState.timeUntilBreakMs

      wiredManager.setTwentyTwentyEnabled(true)

      const afterMs = lastUpdate(sendToRenderer).twentyTwentyState.timeUntilBreakMs
      // Cycle was preserved - remaining time is still ~10 minutes (not ~20 as a reset would give)
      expect(afterMs).toBe(beforeMs)
      expect(afterMs).toBeLessThan(TWENTY_MINUTES_MS - 100)
    })

    it('disable during break_active silently cancels the popup and suppresses the end cue', () => {
      startWithConfirm(
        wiredManager,
        { ...DEFAULT_CONFIG, twentyTwentyEnabled: true, blinkWindowSeconds: 999 },
        bridge,
      )

      vi.advanceTimersByTime(TWENTY_MINUTES_MS) // enter break
      expect(popupStrategy.onReminderStart).toHaveBeenCalledTimes(1)
      popupStrategy.onReminderEnd.mockClear()
      audioStrategy.onReminderEnd.mockClear()
      audioStrategy.onReminderCancel?.mockClear()

      wiredManager.setTwentyTwentyEnabled(false)

      // Popup hides (via onReminderEnd - no cancel override for popup)
      expect(popupStrategy.onReminderEnd).toHaveBeenCalledTimes(1)
      // Audio cue is suppressed: onReminderCancel fires, onReminderEnd does NOT
      expect(audioStrategy.onReminderCancel).toHaveBeenCalledTimes(1)
      expect(audioStrategy.onReminderEnd).not.toHaveBeenCalled()
      // Renderer sees the phase update
      expect(lastUpdate(sendToRenderer).twentyTwentyState.phase).toBe('idle')
    })

    it('disable during waiting phase stops the timer with no dispatcher side effects', () => {
      wiredManager.start({ ...DEFAULT_CONFIG, twentyTwentyEnabled: true })
      sendToRenderer.mockClear()

      wiredManager.setTwentyTwentyEnabled(false)

      // Dispatcher wasn't active, so no strategy calls
      expect(popupStrategy.onReminderStart).not.toHaveBeenCalled()
      expect(popupStrategy.onReminderEnd).not.toHaveBeenCalled()
      expect(audioStrategy.onReminderCancel).not.toHaveBeenCalled()
      expect(lastUpdate(sendToRenderer).twentyTwentyState.phase).toBe('idle')
    })

    it('disable is no-op when already idle', () => {
      wiredManager.start({ ...DEFAULT_CONFIG, twentyTwentyEnabled: false })
      sendToRenderer.mockClear()

      wiredManager.setTwentyTwentyEnabled(false)

      // No state update should be pushed for the no-op
      expect(sendToRenderer).not.toHaveBeenCalled()
    })

    it('disable + re-enable resets the cycle fresh, not residual time', () => {
      startWithConfirm(
        wiredManager,
        { ...DEFAULT_CONFIG, twentyTwentyEnabled: true, blinkWindowSeconds: 999 },
        bridge,
      )

      // Advance 15 minutes into the cycle
      vi.advanceTimersByTime(15 * 60 * 1000)

      // Disable then immediately re-enable
      wiredManager.setTwentyTwentyEnabled(false)
      wiredManager.setTwentyTwentyEnabled(true)

      const update = lastUpdate(sendToRenderer)
      expect(update.twentyTwentyState.phase).toBe('waiting')
      // Full cycle restarts - timeUntilBreakMs is near 20 minutes, not ~5
      expect(update.twentyTwentyState.timeUntilBreakMs).toBeGreaterThan(TWENTY_MINUTES_MS - 100)
    })

    it('blink reminder resumes on the next tick after a mid-break disable', () => {
      const blinkStrategy: ReminderStrategy & {
        onReminderStart: ReturnType<typeof vi.fn>
        onReminderEnd: ReturnType<typeof vi.fn>
        configure: ReturnType<typeof vi.fn>
        dispose: ReturnType<typeof vi.fn>
      } = {
        id: 'overlay',
        onReminderStart: vi.fn(),
        onReminderEnd: vi.fn(),
        configure: vi.fn(),
        dispose: vi.fn(),
      }
      const blinkDispatcher = new ReminderDispatcher([blinkStrategy])
      const manager = new SessionManager({
        bridge,
        sendToRenderer,
        throttleMs: 0,
        reminderDispatcher: blinkDispatcher,
        twentyTwentyDispatcher,
      })

      startWithConfirm(
        manager,
        { ...DEFAULT_CONFIG, twentyTwentyEnabled: true, blinkWindowSeconds: 10 },
        bridge,
      )

      // Blink window elapses during the 20-minute wait, then break begins and suppresses it
      vi.advanceTimersByTime(TWENTY_MINUTES_MS)
      blinkStrategy.onReminderStart.mockClear()

      // Disable mid-break -> on the next tick, isBreakActive=false and blink should re-fire
      manager.setTwentyTwentyEnabled(false)
      vi.advanceTimersByTime(1000)

      expect(blinkStrategy.onReminderStart).toHaveBeenCalled()

      manager.stop()
    })
  })
})