/**
 * Central orchestrator: wires Python bridge events to domain logic
 * and pushes consolidated state updates to the renderer.
 *
 * Responsibilities:
 * - Start/stop detection sessions
 * - Forward blink events from Python to domain layer
 * - Run 1-second interval for overdue checks and 20-20-20 timer
 * - Manage reminder state transitions
 * - Handle Python error/status events for clean session lifecycle
 * - Enforce startup timeout (10s) so the UI never hangs
 * - Throttle state updates to ~10/s to prevent IPC flooding
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
import { ReminderDispatcher } from './reminder-strategies'

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
  kill(): Promise<void>
  spawn(): void
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
  // Minimum interval between state pushes in ms. Defaults to 100 (~10/s)
  throttleMs?: number
  /** Reminder presentation dispatcher. Defaults to overlay-only if not provided. */
  reminderDispatcher?: ReminderDispatcher
  /** Dispatcher for 20-20-20 break strategies. Defaults to an empty dispatcher. */
  twentyTwentyDispatcher?: ReminderDispatcher
}

// ---------------------------------------------------------------------------
// Session Manager
// ---------------------------------------------------------------------------

const IDLE_TWENTY_TWENTY: TwentyTwentyState = {
  phase: 'idle',
  timeUntilBreakMs: 0,
  breakTimeRemainingMs: 0,
}

export class SessionManager {
  private bridge: BridgePort
  private sendToRenderer: (channel: string, data: StateUpdate) => void
  private throttleMs: number
  private reminderDispatcher: ReminderDispatcher
  private twentyTwentyDispatcher: ReminderDispatcher

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

  // Startup timeout (45 seconds)
  private startupTimeout: ReturnType<typeof setTimeout> | null = null

  private lastPushTime = 0
  private pendingPush: ReturnType<typeof setTimeout> | null = null

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
    // Default 100ms throttle in production; tests pass 0 to disable
    this.throttleMs = deps.throttleMs ?? 100
    this.reminderDispatcher = deps.reminderDispatcher ?? new ReminderDispatcher()
    this.twentyTwentyDispatcher = deps.twentyTwentyDispatcher ?? new ReminderDispatcher()
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  start(config: SessionConfig): void {
    if (this.running) return

    const now = Date.now()

    // Reset all domain state for the new session
    this.blinkWindow = new BlinkWindow(config.blinkWindowSeconds)
    this.blinkStats.reset()
    this.twentyTwenty.stop()

    this.reminderState = 'idle'
    this.reminderDispatcher.deactivate()
    this.twentyTwentyDispatcher.deactivate() 
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

    // Set a 45-second startup timeout. If Python doesn't emit
    // "status: running" within this window, we assume it failed
    this.startupTimeout = setTimeout(async () => {
      //If Python is stuck inside camera.open() when this fires, kill + respawn the subprocess
      this.teardown()
      this.sendStateNow('Could not start detection service')
      try {
        await this.bridge.kill()
        this.bridge.spawn()
      } catch (err) {
        console.error('[SessionManager] Python respawn after startup timeout failed:', err)
      }
    }, 45_000)

    // Begin 1-second interval tick for overdue checks and 20-20-20 ticks
    this.tickInterval = setInterval(() => this.tick(), 1000)

    // Push initial state so the renderer shows "Running" immediately
    this.pushStateUpdate()
  }

  stop(): void {
    if (!this.running) return

    this.running = false

    // Clean up all timers: startup timeout, throttle pending push, tick interval
    this.clearStartupTimeout()
    this.cancelPendingPush()

    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }

    // Unsubscribe from bridge events 
    this.bridge.removeListener('event', this.onPythonEvent)
    this.bridge.removeListener('error', this.onPythonError)
    this.bridge.removeListener('exit', this.onPythonExit)

    // Tell the Python process to stop capturing
    this.bridge.send({ type: 'stop' })

    // Reset domain timers
    this.twentyTwenty.stop()
    this.lastTwentyTwentyState = { ...IDLE_TWENTY_TWENTY }
    this.reminderState = 'idle'
    this.reminderDispatcher.deactivate()
    this.twentyTwentyDispatcher.deactivate()

    // Push final state, bypassing throttle (high-priority transition)
    this.pushStateUpdate()
  }

  isRunning(): boolean {
    return this.running
  }

  setTwentyTwentyEnabled(enabled: boolean): void {
    if (!this.running) return

    if (enabled) {
      if (this.twentyTwenty.getPhase() !== 'idle') return
      const now = Date.now()
      this.twentyTwenty.start(now)
      this.lastTwentyTwentyState = this.twentyTwenty.tick(now)
    } else {
      if (this.twentyTwenty.getPhase() === 'idle') return
      this.twentyTwentyDispatcher.cancel()
      this.twentyTwenty.stop()
      this.lastTwentyTwentyState = { ...IDLE_TWENTY_TWENTY }
    }

    this.pushStateUpdate()
  }

   /**
   * Capture a snapshot of session metrics for persistence.
   *
   * Called by the STOP IPC handler BEFORE stop() to get accurate metrics. 
   * Capturing before stop() ensures domain objects haven't been reset yet
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
      // Handle error events from Python 
      case 'error':
        this.teardown()
        this.sendStateNow(event.message)
        break
      // Handle status events from Python. When Python confirms
      // "status: running", clear the startup timeout
      case 'status':
        if (event.state === 'running') {
          this.clearStartupTimeout()
          if (!this.blinkWindow.isStarted()) {
            this.blinkWindow.reset(Date.now())
          }
        }
        break
      // preview_frame and camera_list events are forwarded directly
      // to the renderer by ipc-handlers. They don't affect session state.
    }
  }

  private handleBlink(timestamp: number): void {
    this.blinkWindow.recordBlink(timestamp)
    this.blinkStats.recordBlink(timestamp)

    // Evaluate the reminder state machine with a blink_detected event
    const result = transition(
      this.reminderState,
      { type: 'blink_detected', timestamp },
      this.blinkWindow,
    )

    this.reminderState = result.state
    const isBreakActive = this.twentyTwenty.getPhase() === 'break_active' 
    this.reminderDispatcher.update(!isBreakActive && result.shouldShowReminder) 
    if (result.shouldResetTimer) {
      this.blinkWindow.reset(timestamp)
    }

    this.pushStateUpdate()
  }

  private handleTrackingStatus(faceDetected: boolean, timestamp: number): void {
    this.faceDetected = faceDetected

    // Fallback if tracking arrives before `status:running` 
    if (faceDetected && !this.blinkWindow.isStarted()) {
      this.blinkWindow.reset(timestamp)
    }

    // Tracking loss/gain affects reminder behaviour:
    // - Face lost: suppress reminders
    // - Face found: resume normal reminder logic
    const result = transition(
      this.reminderState,
      { type: 'tracking_update', faceDetected, timestamp },
      this.blinkWindow,
    )

    this.reminderState = result.state
    const isBreakActive = this.twentyTwenty.getPhase() === 'break_active' 
    this.reminderDispatcher.update(!isBreakActive && result.shouldShowReminder) 
    if (result.shouldResetTimer) {
      this.blinkWindow.reset(timestamp)
    }

    this.pushStateUpdate()
  }

  /** Called every 1 second by setInterval. Evaluates time-based state changes. */
  private tick(): void {
    if (!this.running) return

    const now = Date.now()

    // Evaluate 20-20-20 first so we can suppress blink reminders during the break
    const newTtState = this.twentyTwenty.tick(now)
    if (this.lastTwentyTwentyState.phase === 'break_active' && newTtState.phase === 'waiting') {
      this.twentyTwentyBreaksTaken++
    }
    this.lastTwentyTwentyState = newTtState
    const isBreakActive = newTtState.phase === 'break_active'

    this.twentyTwentyDispatcher.update(isBreakActive)

    // Evaluate reminder state machine with a timer tick 
    const result = transition(
      this.reminderState,
      { type: 'timer_tick', timestamp: now },
      this.blinkWindow,
    )

    // Count new transitions to OVERDUE (blink window expired without a blink).
    // Only count transitions, not repeated overdue ticks.
    if (result.state === 'overdue' && this.reminderState !== 'overdue') {
      this.remindersTriggered++
    }
    this.reminderState = result.state
    // Suppress blink reminders during the 20-20-20 break window
    this.reminderDispatcher.update(!isBreakActive && result.shouldShowReminder)

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

   /** Emergency cleanup: stop everything without sending commands to Python.
   *  Used when Python crashes, exits, or emits an error event. */
  private teardown(): void {
    this.running = false

    // Clear all pending timers to prevent callbacks firing after teardown
    this.clearStartupTimeout()
    this.cancelPendingPush()

    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }

    // Unsubscribe from bridge events
    this.bridge.removeListener('event', this.onPythonEvent)
    this.bridge.removeListener('error', this.onPythonError)
    this.bridge.removeListener('exit', this.onPythonExit)

    // Reset domain state
    this.twentyTwenty.stop()
    this.lastTwentyTwentyState = { ...IDLE_TWENTY_TWENTY }
    this.reminderState = 'idle'
    this.reminderDispatcher.deactivate()
    this.twentyTwentyDispatcher.deactivate()
  }


  /**
   * Rate-limits how often we send state updates to the UI (Trailing-edge throttling).
   *
   * Without this, rapid blink events could send 20+ updates per second, causing the UI to stutter. This limits it to ~10 per second (every 100ms).
   *
   * Three cases:
   *   1. Error or stopped -> send immediately (user needs to see these right away)
   *   2. 100ms+ since last send -> send immediately (enough time has passed)
   *   3. Less than 100ms since last send -> wait, then send the latest state.
   *      If more events arrive while waiting, they're included automatically
   *      because the delayed send reads the current state when it fires.
   */
  private pushStateUpdate(error?: string): void {
    // Errors and stopped state bypass throttle entirely so users see errors instantly
    if (error !== undefined || !this.running) {
      this.cancelPendingPush()
      this.sendStateNow(error)
      return
    }

    const now = Date.now()
    const elapsed = now - this.lastPushTime

    if (elapsed >= this.throttleMs) {
      // Throttle window has passed, safe to send immediately
      this.cancelPendingPush()
      this.sendStateNow()
    } else if (this.pendingPush === null) {
      // Within throttle window and no trailing push scheduled yet.
      // Schedule one for the remaining time in the window.
      this.pendingPush = setTimeout(() => {
        this.pendingPush = null
        this.sendStateNow()
      }, this.throttleMs - elapsed)
    }
    // If within throttle window AND a push is already pending, do nothing.
    // The pending push will send the latest state when it fires.
  }

  /** Actually send a state update to the renderer via IPC. */
  private sendStateNow(error?: string): void {
    const now = Date.now()
    this.lastPushTime = now  // Record when we last pushed for throttle timing

    const update: StateUpdate = {
      type: 'state_update',
      running: this.running,
      reminderState: this.reminderState,
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

  /** Clear the 10-second startup timeout (null-safe). */
  private clearStartupTimeout(): void {
    if (this.startupTimeout !== null) {
      clearTimeout(this.startupTimeout)
      this.startupTimeout = null
    }
  }

  /** Cancel any pending throttled state push (null-safe). */
  private cancelPendingPush(): void {
    if (this.pendingPush !== null) {
      clearTimeout(this.pendingPush)
      this.pendingPush = null
    }
  }
}

/**
 * Population standard deviation of an array of numbers.
 * Returns 0 if fewer than 2 values (need at least 2 intervals
 * for a meaningful deviation).
 */
function computeStdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}