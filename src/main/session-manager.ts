/**
 * Central orchestrator: wires Python bridge events to domain logic
 * and pushes consolidated state updates to the renderer.
 *
 * Responsibilities:
 * - Start/stop detection sessions
 * - Forward blink events from Python to domain layer
 * - Run 1-second interval for overdue checks and 20-20-20 timer
 * - Manage reminder state transitions
 * - Push consolidated state to renderer via sendToRenderer callback
 */

import { BlinkWindow } from '../domain/blink-window'
import { BlinkStatsTracker } from '../domain/blink-stats'
import { TwentyTwentyTimer } from '../domain/twenty-twenty'
import { transition } from '../domain/reminder-state'
import type { ReminderState, TwentyTwentyState } from '../domain/types'
import type { PythonCommand, PythonEvent } from '../shared/protocol'
import { IPC_CHANNELS } from '../shared/ipc-messages'
import type { StateUpdate } from '../shared/ipc-messages'

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

const IDLE_TWENTY_TWENTY: TwentyTwentyState = {
  phase: 'idle',
  timeUntilBreakMs: 0,
  breakTimeRemainingMs: 0,
}

export class SessionManager {
  private bridge: BridgePort
  private sendToRenderer: (channel: string, data: StateUpdate) => void

  // Domain objects
  private blinkWindow = new BlinkWindow()
  private blinkStats = new BlinkStatsTracker()
  private twentyTwenty = new TwentyTwentyTimer()

  // Session state
  private reminderState: ReminderState = 'idle'
  private running = false
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private sessionStartTime = -1
  private faceDetected = false
  private remindersTriggered = 0
  private lastTwentyTwentyState: TwentyTwentyState = { ...IDLE_TWENTY_TWENTY }

  // Bound handlers for add/remove symmetry
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

    // Reset domain state
    this.blinkWindow = new BlinkWindow(config.blinkWindowSeconds)
    this.blinkWindow.reset(now)
    this.blinkStats.reset()
    this.twentyTwenty.stop()

    this.reminderState = 'idle'
    this.faceDetected = false
    this.remindersTriggered = 0
    this.sessionStartTime = now
    this.running = true

    // Subscribe to bridge events
    this.bridge.on('event', this.onPythonEvent)
    this.bridge.on('error', this.onPythonError)
    this.bridge.on('exit', this.onPythonExit)

    // Send start command to Python
    this.bridge.send({
      type: 'start',
      camera_index: config.cameraIndex,
      preview_enabled: config.previewEnabled,
    })

    // Start 20-20-20 timer if enabled
    if (config.twentyTwentyEnabled) {
      this.twentyTwenty.start(now)
      this.lastTwentyTwentyState = this.twentyTwenty.tick(now)
    } else {
      this.lastTwentyTwentyState = { ...IDLE_TWENTY_TWENTY }
    }

    // Begin 1-second interval tick
    this.tickInterval = setInterval(() => this.tick(), 1000)

    // Push initial state
    this.pushStateUpdate()
  }

  stop(): void {
    if (!this.running) return

    this.running = false

    // Clear interval
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }

    // Unsubscribe from bridge events
    this.bridge.removeListener('event', this.onPythonEvent)
    this.bridge.removeListener('error', this.onPythonError)
    this.bridge.removeListener('exit', this.onPythonExit)

    // Send stop command to Python
    this.bridge.send({ type: 'stop' })

    // Stop domain timers
    this.twentyTwenty.stop()
    this.lastTwentyTwentyState = { ...IDLE_TWENTY_TWENTY }
    this.reminderState = 'idle'

    // Push final state
    this.pushStateUpdate()
  }

  isRunning(): boolean {
    return this.running
  }

  /** Returns session metrics for logging. */
  getSessionSummary() {
    const now = Date.now()
    const durationMs = this.sessionStartTime >= 0 ? now - this.sessionStartTime : 0
    return {
      sessionStart: this.sessionStartTime,
      sessionEnd: now,
      totalBlinks: this.blinkStats.getTotalBlinks(),
      avgBlinksPerMinute:
        durationMs > 0
          ? this.blinkStats.getTotalBlinks() / (durationMs / 60_000)
          : 0,
      remindersTriggered: this.remindersTriggered,
      totalDurationMs: durationMs,
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
    }
  }

  private handleBlink(timestamp: number): void {
    this.blinkWindow.recordBlink(timestamp)
    this.blinkStats.recordBlink(timestamp)

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

  private tick(): void {
    if (!this.running) return

    const now = Date.now()

    // Evaluate reminder state
    const result = transition(
      this.reminderState,
      { type: 'timer_tick', timestamp: now },
      this.blinkWindow,
    )

    // Count new transitions to OVERDUE
    if (result.state === 'overdue' && this.reminderState !== 'overdue') {
      this.remindersTriggered++
    }

    this.reminderState = result.state

    // Evaluate 20-20-20
    this.lastTwentyTwentyState = this.twentyTwenty.tick(now)

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