/**
 * Central orchestrator: wires Python bridge events to domain logic
 * and pushes consolidated state updates to the renderer.
 *
 * Responsibilities:
 * - Start/stop detection sessions
 * - Forward blink events from Python to domain layer
 * - Run 1-second interval for overdue checks and 20-20-20 timer
 * - Manage reminder state transitions
 * - Track session metrics for persistence (blink stats, break counts, etc.)
 * - Push consolidated state to renderer via sendToRenderer callback
 */

import { BlinkWindow } from '../domain/blink-window'
import { BlinkStatsTracker } from '../domain/blink-stats'
import { TwentyTwentyTimer } from '../domain/twenty-twenty'
import { transition } from '../domain/reminder-state'
import type { ReminderState, TwentyTwentyState } from '../domain/types'
import type { PythonCommand, PythonEvent } from '../shared/protocol'
import { IPC_CHANNELS } from '../shared/ipc-messages'
import type { SessionSummary, StateUpdate } from '../shared/ipc-messages'

// ---------------------------------------------------------------------------
// Dependencies interface (for testability)
// ---------------------------------------------------------------------------

/** Minimal interface that PythonBridge satisfies. */
export interface BridgePort {
  on(event: 'event', listener: (event: PythonEvent) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): this
  removeListener(event: 'event', listener: (event: PythonEvent) => void): this
  removeListener(event: 'error', listener: (error: Error) => void): this
  removeListener(event: 'exit', listener: (code: number | null, signal: string | null) => void): this
  send(command: PythonCommand): void
}

export interface SessionConfig {
  cameraIndex: number
  previewEnabled: boolean
  blinkWindowSeconds: number
  twentyTwentyEnabled: boolean
}

export interface SessionManagerDeps {
  bridge: BridgePort
  sendToRenderer: (channel: string, data: StateUpdate) => void
}

// ---------------------------------------------------------------------------
// Session Manager
// ---------------------------------------------------------------------------

/** Default 20-20-20 state used when the timer is idle or disabled. */
const IDLE_TWENTY_TWENTY: TwentyTwentyState = {
  phase: 'idle',
  timeUntilBreakMs: 0,
  breakTimeRemainingMs: 0,
}

export class SessionManager {
  private bridge: BridgePort
  private sendToRenderer: (channel: string, data: StateUpdate) => void

  // -- Domain objects (re-created on each start()) --
  private blinkWindow = new BlinkWindow()
  private blinkStats = new BlinkStatsTracker()
  private twentyTwenty = new TwentyTwentyTimer()

  // -- Session state --
  private reminderState: ReminderState = 'idle'
  private running = false
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private sessionStartTime = -1
  private faceDetected = false
  private remindersTriggered = 0
  private lastTwentyTwentyState: TwentyTwentyState = { ...IDLE_TWENTY_TWENTY }
  private twentyTwentyBreaksTaken = 0

  // -- Stable handler references for event subscription cleanup --
  //   1. `this` is always the SessionManager instance 
  //   2. The same function reference is used in both on() and removeListener()
  private readonly onPythonEvent = (event: PythonEvent): void => {
    this.handlePythonEvent(event)
  }
  private readonly onPythonError = (error: Error): void => {
    this.handleError(error)
  }
  private readonly onPythonExit = (code: number | null, signal: string | null): void => {
    this.handleExit(code, signal)
  }

  constructor(deps: SessionManagerDeps) {
    this.bridge = deps.bridge
    this.sendToRenderer = deps.sendToRenderer
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  start(config: SessionConfig): void {
    if (this.running) return

    const now = Date.now()

    // Reset all domain state for the new session
    this.blinkWindow = new BlinkWindow(config.blinkWindowSeconds)
    this.blinkWindow.reset(now)
    this.blinkStats.reset()
    this.twentyTwenty.stop()

    this.reminderState = 'idle'
    this.faceDetected = false
    this.remindersTriggered = 0
    this.twentyTwentyBreaksTaken = 0
    this.sessionStartTime = now
    this.running = true

    // Subscribe to bridge events (blink_event, tracking_status, error, exit)
    this.bridge.on('event', this.onPythonEvent)
    this.bridge.on('error', this.onPythonError)
    this.bridge.on('exit', this.onPythonExit)

    // Send start command to Python process
    this.bridge.send({
      type: 'start',
      camera_index: config.cameraIndex,
      preview_enabled: config.previewEnabled,
    })

    // Start 20-20-20 timer if enabled in settings
    if (config.twentyTwentyEnabled) {
      this.twentyTwenty.start(now)
      this.lastTwentyTwentyState = this.twentyTwenty.tick(now)
    } else {
      this.lastTwentyTwentyState = { ...IDLE_TWENTY_TWENTY }
    }

    // Begin 1-second interval tick for overdue checks and 20-20-20 ticks
    this.tickInterval = setInterval(() => this.tick(), 1000)

    // Push initial state so the renderer shows "Running" immediately
    this.pushStateUpdate()
  }

  stop(): void {
    if (!this.running) return

    this.running = false

    // Clear the 1-second interval
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }

    // Unsubscribe from bridge events to prevent handling events after stop
    this.bridge.removeListener('event', this.onPythonEvent)
    this.bridge.removeListener('error', this.onPythonError)
    this.bridge.removeListener('exit', this.onPythonExit)

    // Tell the Python process to stop capturing
    this.bridge.send({ type: 'stop' })

    // Reset domain timers
    this.twentyTwenty.stop()
    this.lastTwentyTwentyState = { ...IDLE_TWENTY_TWENTY }
    this.reminderState = 'idle'

    // Push final state so the renderer shows "Stopped"
    this.pushStateUpdate()
  }

  isRunning(): boolean {
    return this.running
  }

   /**
   * Capture a snapshot of session metrics for persistence.
   *
   * Called by the STOP IPC handler BEFORE stop() to get accurate metrics. Capturing before stop() ensures:
   *   1. sessionEnd is the exact moment the user clicked stop
   *   2. Domain objects haven't been reset yet
   */
  getSessionSummary(): SessionSummary {
    const now = Date.now()
    const durationMs = this.sessionStartTime >= 0 ? now - this.sessionStartTime : 0
    const intervals = this.blinkStats.getInterBlinkIntervals()
    const totalBlinks = this.blinkStats.getTotalBlinks()

    return {
      sessionStart: new Date(this.sessionStartTime).toISOString(),
      sessionEnd: new Date(now).toISOString(),
      totalBlinks,
      // Avoid division by zero: if duration is 0, average is 0
      avgBlinksPerMinute: durationMs > 0 ? totalBlinks / (durationMs / 60_000) : 0,
      remindersTriggered: this.remindersTriggered,
      totalDurationSeconds: Math.round(durationMs / 1000),
      twentyTwentyBreaksTaken: this.twentyTwentyBreaksTaken,
      // Convert longest interval from ms to seconds; 0 if no intervals exist
      longestGapBetweenBlinks: intervals.length > 0 ? Math.max(...intervals) / 1000 : 0,
      // Standard deviation of inter-blink intervals in milliseconds
      blinkRateStdDev: computeStdDev(intervals),
    }
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  private handlePythonEvent(event: PythonEvent): void {
    if (!this.running) return

    switch (event.type) {
      case 'blink_event':
        this.handleBlink(event.timestamp)
        break
      case 'tracking_status':
        this.handleTrackingStatus(event.face_detected, event.timestamp)
        break
      // preview_frame, status, camera_list, error events are forwarded
      // directly to the renderer by ipc-handlers — not handled here.
    }
  }

  private handleBlink(timestamp: number): void {
    // Record the blink in both domain objects
    this.blinkWindow.recordBlink(timestamp)
    this.blinkStats.recordBlink(timestamp)

    // Evaluate the reminder state machine with a blink_detected event
    const result = transition(
      this.reminderState,
      { type: 'blink_detected', timestamp },
      this.blinkWindow,
    )

    this.reminderState = result.state
    if (result.shouldResetTimer) {
      this.blinkWindow.reset(timestamp)
    }

    this.pushStateUpdate()
  }

  private handleTrackingStatus(faceDetected: boolean, timestamp: number): void {
    this.faceDetected = faceDetected

    // Tracking loss/gain affects reminder behaviour:
    // - Face lost: suppress reminders
    // - Face found: resume normal reminder logic
    const result = transition(
      this.reminderState,
      { type: 'tracking_update', faceDetected, timestamp },
      this.blinkWindow,
    )

    this.reminderState = result.state
    if (result.shouldResetTimer) {
      this.blinkWindow.reset(timestamp)
    }

    this.pushStateUpdate()
  }

  /** Called every 1 second by setInterval. Evaluates time-based state changes. */
  private tick(): void {
    if (!this.running) return

    const now = Date.now()

    // -- Evaluate reminder state machine with a timer tick --
    const result = transition(
      this.reminderState,
      { type: 'timer_tick', timestamp: now },
      this.blinkWindow,
    )

    // Detect new transitions to OVERDUE (blink window expired without a blink).
    // Only count transitions, not repeated overdue ticks.
    if (result.state === 'overdue' && this.reminderState !== 'overdue') {
      this.remindersTriggered++
    }

    this.reminderState = result.state

    // -- Evaluate 20-20-20 timer --
    // Store the new state in a temp variable first so we can compare
    // the PREVIOUS phase with the NEW phase before overwriting.
    const newTtState = this.twentyTwenty.tick(now)

    // Detect completed breaks: break_active -> waiting means the 20-second break
    // just finished and the timer auto-reset to a new 20-minute cycle.
    if (this.lastTwentyTwentyState.phase === 'break_active' && newTtState.phase === 'waiting') {
      this.twentyTwentyBreaksTaken++
    }
    this.lastTwentyTwentyState = newTtState

    this.pushStateUpdate()
  }

  private handleError(error: Error): void {
    if (!this.running) return
    this.teardown()
    this.pushStateUpdate(error.message)
  }

  private handleExit(code: number | null, signal: string | null): void {
    if (!this.running) return
    this.teardown()
    this.pushStateUpdate(
      `Python process exited unexpectedly (code=${code}, signal=${signal})`,
    )
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Emergency cleanup when the Python process crashes or exits unexpectedly. */
  private teardown(): void {
    this.running = false

    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }

    this.bridge.removeListener('event', this.onPythonEvent)
    this.bridge.removeListener('error', this.onPythonError)
    this.bridge.removeListener('exit', this.onPythonExit)

    this.twentyTwenty.stop()
    this.lastTwentyTwentyState = { ...IDLE_TWENTY_TWENTY }
    this.reminderState = 'idle'
  }

  /** Build and send a consolidated state snapshot to the renderer. */
  private pushStateUpdate(error?: string): void {
    const now = Date.now()

    const update: StateUpdate = {
      type: 'state_update',
      running: this.running,
      reminderState: this.reminderState,
      shouldShowReminder: this.reminderState === 'overdue',
      blinksPerMinute: this.blinkStats.getBlinksPerMinute(now),
      totalBlinks: this.blinkStats.getTotalBlinks(),
      sessionDurationMs: this.sessionStartTime >= 0 ? now - this.sessionStartTime : 0,
      faceDetected: this.faceDetected,
      twentyTwentyState: this.lastTwentyTwentyState,
      remindersTriggered: this.remindersTriggered,
    }

    if (error !== undefined) {
      update.error = error
    }

    this.sendToRenderer(IPC_CHANNELS.STATE_UPDATE, update)
  }
}

/**
 * Population standard deviation of an array of numbers.
 *
 * Returns 0 if fewer than 2 values (need at least 2 inter-blink intervals for a meaningful deviation).
 * This avoids division-by-zero and produces a sensible result for very short sessions with 0 or 1 blinks.
 */
function computeStdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}