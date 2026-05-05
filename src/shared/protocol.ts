/**
 * TypeScript type definitions for Electron <-> Python IPC protocol.
 * Must match the message schemas in python/protocol.py exactly.
 *
 * Transport: stdin/stdout JSON Lines (one JSON object per line, \n terminated).
 */

// ---------------------------------------------------------------------------
// Electron -> Python (Commands)
// ---------------------------------------------------------------------------

export interface StartCommand {
  type: 'start'
  camera_index: number
  preview_enabled: boolean
}

export interface StopCommand {
  type: 'stop'
}

export interface SetPreviewCommand {
  type: 'set_preview'
  enabled: boolean
}

export interface ListCamerasCommand {
  type: 'list_cameras'
}

export type PythonCommand =
  | StartCommand
  | StopCommand
  | SetPreviewCommand
  | ListCamerasCommand

// ---------------------------------------------------------------------------
// Python -> Electron (Events)
// ---------------------------------------------------------------------------

export interface BlinkEvent {
  type: 'blink_event'
  timestamp: number
  duration_ms: number | null
  ear_value: number
}

export interface TrackingStatusEvent {
  type: 'tracking_status'
  face_detected: boolean
  quality: number
  timestamp: number
}

export interface PreviewFrameEvent {
  type: 'preview_frame'
  data: string
  width: number
  height: number
  timestamp: number
}

export interface CameraInfo {
  index: number
  name: string
}

export interface CameraListEvent {
  type: 'camera_list'
  cameras: CameraInfo[]
}

export interface ErrorEvent {
  type: 'error'
  code: string
  message: string
}

export type PythonStatus = 'running' | 'stopped' | 'error'

export interface StatusEvent {
  type: 'status'
  state: PythonStatus
}

export type PythonEvent =
  | BlinkEvent
  | TrackingStatusEvent
  | PreviewFrameEvent
  | CameraListEvent
  | ErrorEvent
  | StatusEvent

// ---------------------------------------------------------------------------
// Event type discriminator helpers
// ---------------------------------------------------------------------------

export type PythonEventType = PythonEvent['type']
export type PythonCommandType = PythonCommand['type']