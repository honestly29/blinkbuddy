/**
 * TypeScript type definitions for renderer <-> main Electron IPC channels.
 *
 * Renderer invokes these via contextBridge-exposed API.
 * Main process registers handlers via ipcMain.handle().
 */

import type { CameraInfo, PythonEvent } from './protocol'
import type { ReminderState, TwentyTwentyState } from '../domain/types'

// ---------------------------------------------------------------------------
// IPC channel names
// ---------------------------------------------------------------------------

/**  String constants for all IPC channels used between main and renderer.*/
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
  PYTHON_EVENT: 'blink:python-event',
  STATE_UPDATE: 'blink:state-update',
} as const  

// ---------------------------------------------------------------------------
// Reminder preferences types
// ---------------------------------------------------------------------------

// The four valid corner positions for the popup window.
export type CornerPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface ReminderPreferences {
  overlay: { enabled: boolean }
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

export interface SetPreviewArgs {
  enabled: boolean
}

export interface SetTwentyTwentyArgs {
  enabled: boolean
}

/** User-configurable preferences persisted to settings.json. */
export interface UserSettings {
  blinkWindowSeconds: number
  cameraIndex: number
  previewEnabled: boolean
  twentyTwentyEnabled: boolean
}

/** Summary of a completed monitoring session, persisted to sessions.json. */
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

/** Snapshot of all monitoring state, sent to the renderer on every change. */
export interface StateUpdate {
  type: 'state_update'
  running: boolean
  reminderState: ReminderState
  shouldShowReminder: boolean
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

/** The complete API surface available as window.blinkBuddy in the renderer. */
export interface BlinkBuddyAPI {
  // Command methods (request/response via ipcRenderer.invoke)
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
  testReminder: (strategyId: string) => Promise<void>
  // Event subscription methods (push-based via ipcRenderer.on)
  onPythonEvent: (callback: (event: PythonEvent) => void) => () => void
  onStateUpdate: (callback: (state: StateUpdate) => void) => () => void
}

/** Augment the Window interface so window.blinkBuddy is typed globally. */
declare global {
  interface Window {
    blinkBuddy: BlinkBuddyAPI
  }
}