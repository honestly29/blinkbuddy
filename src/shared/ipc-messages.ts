/**
 * Defines all the types used for messages between the renderer and the
 * main process.
 *
 * The renderer talks to the main process by calling functions on
 * window.blinkBuddy (see the BlinkBuddyAPI interface below). Each call
 * becomes a message that travels across the IPC boundary; the main
 * process picks it up and runs the matching handler in ipc-handlers.ts.
 *
 * This file is the shared contract: it defines the channel names, the
 * argument shapes, the return shapes, and the events that flow back
 * the other way. Both processes import from here so they agree on what
 * each message looks like.
 */

import type { CameraInfo, PythonEvent } from './protocol'
import type { ReminderState, TwentyTwentyState } from '../domain/types'
import type { ReminderStrategyId } from './reminder-strategies'

// ---------------------------------------------------------------------------
// IPC channel names
// ---------------------------------------------------------------------------

/**
 * String constants for the IPC channels used between the main and
 * renderer processes. Both sides reference the same names from this
 * object, so a typo on either side is caught at compile time.
 */
export const IPC_CHANNELS = {
  START: 'blink:start',
  STOP: 'blink:stop',
  SET_PREVIEW: 'blink:set-preview',
  SET_TWENTY_TWENTY: 'blink:set-twenty-twenty',
  LIST_CAMERAS: 'blink:list-cameras',
  GET_SESSION_HISTORY: 'blink:get-session-history',
  SAVE_SETTINGS: 'blink:save-settings',
  LOAD_SETTINGS: 'blink:load-settings',
  GET_REMINDER_PREFERENCES: 'blink:get-reminder-preferences',
  UPDATE_REMINDER_PREFERENCES: 'blink:update-reminder-preferences',
  TEST_REMINDER: 'blink:test-reminder',
  EXPORT_SESSIONS_CSV: 'blink:export-sessions-csv',     
  CLEAR_SESSIONS: 'blink:clear-sessions',
  PYTHON_EVENT: 'blink:python-event',
  STATE_UPDATE: 'blink:state-update',
} as const  

// ---------------------------------------------------------------------------
// Reminder preferences types
// ---------------------------------------------------------------------------

/** The four valid corner positions for the popup window. */
export type CornerPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/**
 * User preferences for the three blink reminder strategies. Persisted
 * to disk via ReminderPreferencesStore and applied to the live
 * dispatcher whenever the user changes a setting.
 */
export interface ReminderPreferences {
  screenEdgeGlow: { enabled: boolean; colour: string; opacity: number }
  cornerPopup: { enabled: boolean; corner: CornerPosition }
  audioCue: { enabled: boolean; soundFile: string; volume: number }
}

// ---------------------------------------------------------------------------
// Channel argument/return types
// ---------------------------------------------------------------------------

/** Arguments passed to the START handler when beginning a monitoring session. */
export interface StartArgs {
  cameraIndex?: number
  previewEnabled?: boolean
  blinkWindowSeconds?: number
  twentyTwentyEnabled?: boolean
}

/** Argument for the SET_PREVIEW channel: turns the camera preview on or off. */
export interface SetPreviewArgs {
  enabled: boolean
}

/** Argument for the SET_TWENTY_TWENTY channel: turns 20-20-20 breaks on or off. */
export interface SetTwentyTwentyArgs {
  enabled: boolean
}

/** User-configurable preferences persisted to disk by SettingsStore. */
export interface UserSettings {
  blinkWindowSeconds: number
  cameraIndex: number
  previewEnabled: boolean
  twentyTwentyEnabled: boolean
}

/**
 * Result of an export-to-CSV attempt. Each variant is for a different
 * outcome:
 *   - saved: the file was written successfully (filePath included).
 *   - cancelled: the user closed the save dialog without picking a file.
 *   - no-sessions: there were no sessions to export.
 *   - error: the write failed (message describes the cause).
 */
export type ExportSessionsResult =
  | { status: 'saved'; filePath: string }
  | { status: 'cancelled' }
  | { status: 'no-sessions' }
  | { status: 'error'; message: string }

/**
 * Result of a clear-sessions attempt. Variants:
 *   - cleared: all sessions were deleted.
 *   - cancelled: the user closed the confirm dialog without confirming.
 *   - error: the deletion failed (message describes the cause).
 */
export type ClearSessionsResult =
  | { status: 'cleared' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }


/** Summary of a completed monitoring session, persisted to disk by SessionLogger. */
export interface SessionSummary {
  sessionStart: string    // ISO 8601 timestamp
  sessionEnd: string      // ISO 8601 timestamp
  totalBlinks: number
  avgBlinksPerMinute: number
  remindersTriggered: number
  totalDurationSeconds: number
  twentyTwentyBreaksTaken: number
  longestGapBetweenBlinks: number
  blinkRateStdDev: number
}

// ---------------------------------------------------------------------------
// Consolidated state update pushed from Session Manager to renderer
// ---------------------------------------------------------------------------

/**
 * Snapshot of all live monitoring state. The Session Manager builds
 * one of these whenever the state changes and pushes it to the
 * renderer via the STATE_UPDATE channel; the renderer uses it to
 * update the UI.
 */
export interface StateUpdate {
  type: 'state_update'
  running: boolean
  reminderState: ReminderState
  blinksPerMinute: number
  totalBlinks: number
  sessionDurationMs: number
  faceDetected: boolean
  twentyTwentyState: TwentyTwentyState
  remindersTriggered: number
  error?: string
}

// ---------------------------------------------------------------------------
// Preload API shape exposed to renderer via contextBridge
// ---------------------------------------------------------------------------

/**
 * The API surface available as window.blinkBuddy in the renderer.
 * Each method here corresponds to one IPC channel registered in
 * ipc-handlers.ts.
 */
export interface BlinkBuddyAPI {
  start: (args?: StartArgs) => Promise<void>
  stop: () => Promise<void>
  setPreview: (args: SetPreviewArgs) => Promise<void>
  setTwentyTwenty: (args: SetTwentyTwentyArgs) => Promise<void>
  listCameras: () => Promise<CameraInfo[]>
  getSessionHistory: () => Promise<SessionSummary[]>
  saveSettings: (settings: UserSettings) => Promise<void>
  loadSettings: () => Promise<UserSettings>
  getReminderPreferences: () => Promise<ReminderPreferences>
  updateReminderPreferences: (prefs: ReminderPreferences) => Promise<void>
  testReminder: (strategyId: ReminderStrategyId) => Promise<void>
   exportSessionsCsv: () => Promise<ExportSessionsResult>
  clearSessions: () => Promise<ClearSessionsResult>
  onPythonEvent: (callback: (event: PythonEvent) => void) => () => void
  onStateUpdate: (callback: (state: StateUpdate) => void) => () => void
}

/** Augment the Window interface so window.blinkBuddy is typed globally. */
declare global {
  interface Window {
    blinkBuddy: BlinkBuddyAPI
  }
}