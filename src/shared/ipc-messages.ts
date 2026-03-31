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

export const IPC_CHANNELS = {
  START: 'blink:start',
  STOP: 'blink:stop',
  SET_PREVIEW: 'blink:set-preview',
  LIST_CAMERAS: 'blink:list-cameras',
  GET_SESSION_HISTORY: 'blink:get-session-history',
  SAVE_SETTINGS: 'blink:save-settings',
  LOAD_SETTINGS: 'blink:load-settings',
  PYTHON_EVENT: 'blink:python-event',
  STATE_UPDATE: 'blink:state-update',
} as const

// ---------------------------------------------------------------------------
// Channel argument/return types
// ---------------------------------------------------------------------------

export interface StartArgs {
  cameraIndex?: number
  previewEnabled?: boolean
  blinkWindowSeconds?: number
  twentyTwentyEnabled?: boolean
}

export interface SetPreviewArgs {
  enabled: boolean
}

export interface UserSettings {
  blinkWindowSeconds: number
  cameraIndex: number
  previewEnabled: boolean
  twentyTwentyEnabled: boolean
}

export interface SessionSummary {
  sessionStart: string
  sessionEnd: string
  totalBlinks: number
  avgBlinksPerMinute: number
  remindersTriggered: number
  totalDurationSeconds: number
}

// ---------------------------------------------------------------------------
// Consolidated state update pushed from Session Manager to renderer
// ---------------------------------------------------------------------------

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

export interface BlinkBuddyAPI {
  start: (args?: StartArgs) => Promise<void>
  stop: () => Promise<void>
  setPreview: (args: SetPreviewArgs) => Promise<void>
  listCameras: () => Promise<CameraInfo[]>
  getSessionHistory: () => Promise<SessionSummary[]>
  saveSettings: (settings: UserSettings) => Promise<void>
  loadSettings: () => Promise<UserSettings>
  onPythonEvent: (callback: (event: PythonEvent) => void) => () => void
}

declare global {
  interface Window {
    blinkBuddy: BlinkBuddyAPI
  }
}