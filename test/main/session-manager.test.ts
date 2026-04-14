import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SessionManager, type BridgePort, type SessionConfig } from '../../src/main/session-manager'
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
    manager = new SessionManager({ bridge, sendToRenderer })
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

      // Advance time — no more ticks should fire
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

    it('transitions OVERDUE → IDLE on blink', () => {
      manager.start(DEFAULT_CONFIG)

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
    it('transitions IDLE → OVERDUE when blink window expires', () => {
      manager.start(DEFAULT_CONFIG)

      // Advance exactly to the window boundary (10 seconds)
      vi.advanceTimersByTime(10_000)

      const update = lastUpdate(sendToRenderer)
      expect(update.reminderState).toBe('overdue')
      expect(update.shouldShowReminder).toBe(true)
    })

    it('stays IDLE before the window expires', () => {
      manager.start(DEFAULT_CONFIG)

      // Advance 9 seconds — not yet overdue
      vi.advanceTimersByTime(9000)

      const update = lastUpdate(sendToRenderer)
      expect(update.reminderState).toBe('idle')
      expect(update.shouldShowReminder).toBe(false)
    })

    it('increments remindersTriggered on transition to OVERDUE', () => {
      manager.start(DEFAULT_CONFIG)

      vi.advanceTimersByTime(10_000)

      expect(lastUpdate(sendToRenderer).remindersTriggered).toBe(1)
    })

    it('does not double-count while staying OVERDUE', () => {
      manager.start(DEFAULT_CONFIG)

      // Become overdue, then stay overdue for several more ticks
      vi.advanceTimersByTime(13_000)

      expect(lastUpdate(sendToRenderer).remindersTriggered).toBe(1)
    })

    it('counts multiple overdue episodes', () => {
      manager.start(DEFAULT_CONFIG)

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

    it('transitions SUPPRESSED → IDLE when face is restored', () => {
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
      manager.start(DEFAULT_CONFIG)

      // Advance 8 seconds (close to overdue, but not yet)
      vi.advanceTimersByTime(8000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // Lose face at t=8000
      bridge.emit('event', trackingEvent(false, 8000))
      expect(lastUpdate(sendToRenderer).reminderState).toBe('suppressed')

      // Restore face at t=9000 — timer should reset from this point
      vi.setSystemTime(9000)
      bridge.emit('event', trackingEvent(true, 9000))
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // Advance 9 more seconds (t=18000) — should NOT be overdue yet
      // because timer was reset at t=9000
      vi.advanceTimersByTime(9000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // Advance 1 more second (t=19000) — NOW overdue (10s since reset at t=9000)
      vi.advanceTimersByTime(1000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('overdue')
    })

    it('suppresses overdue reminder when face is lost', () => {
      manager.start(DEFAULT_CONFIG)

      // Become overdue
      vi.advanceTimersByTime(10_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('overdue')
      expect(lastUpdate(sendToRenderer).shouldShowReminder).toBe(true)

      // Lose face — should suppress
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
      // Not started — error should be ignored
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
      manager.start({ ...DEFAULT_CONFIG, twentyTwentyEnabled: true })

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
      manager.start(DEFAULT_CONFIG)

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

  describe('full cycle: idle → overdue → idle (on blink)', () => {
    it('completes the idle → overdue → idle cycle', () => {
      manager.start(DEFAULT_CONFIG) // T = 10s

      // Initially idle
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // Wait 10 seconds → overdue
      vi.advanceTimersByTime(10_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('overdue')
      expect(lastUpdate(sendToRenderer).shouldShowReminder).toBe(true)

      // Blink → back to idle
      vi.setSystemTime(10_500)
      bridge.emit('event', blinkEvent(10_500))
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')
      expect(lastUpdate(sendToRenderer).shouldShowReminder).toBe(false)

      // Wait another 10 seconds from the blink → overdue again
      vi.advanceTimersByTime(10_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('overdue')
      expect(lastUpdate(sendToRenderer).remindersTriggered).toBe(2)
    })
  })

  describe('full cycle: idle → suppressed → idle with timer reset', () => {
    it('completes the idle → suppressed → idle cycle', () => {
      manager.start(DEFAULT_CONFIG) // T = 10s

      // Wait 5 seconds
      vi.advanceTimersByTime(5000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // Lose face at t=5000
      bridge.emit('event', trackingEvent(false, 5000))
      expect(lastUpdate(sendToRenderer).reminderState).toBe('suppressed')

      // Wait 10 seconds with no face — should stay suppressed (not overdue)
      vi.advanceTimersByTime(10_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('suppressed')

      // Restore face at t=15000 — timer resets
      vi.setSystemTime(15_000)
      bridge.emit('event', trackingEvent(true, 15_000))
      expect(lastUpdate(sendToRenderer).reminderState).toBe('idle')

      // Now wait full window from reset point → overdue
      vi.advanceTimersByTime(10_000)
      expect(lastUpdate(sendToRenderer).reminderState).toBe('overdue')
    })
  })
})