import { useState, useEffect, useCallback } from 'react'
import type { StartArgs, StateUpdate } from '../../shared/ipc-messages'
import type { ReminderState } from '../../domain/types'

// The state exposed by useBlinkMonitor to React components
export interface BlinkMonitorState {
  running: boolean
  blinksPerMinute: number
  totalBlinks: number
  sessionDurationMs: number
  faceDetected: boolean
  reminderState: ReminderState
  remindersTriggered: number
  error?: string
}

// Default state before any StateUpdate arrives from the main process
const initialState: BlinkMonitorState = {
  running: false,
  blinksPerMinute: 0,
  totalBlinks: 0,
  sessionDurationMs: 0,
  faceDetected: false,
  reminderState: 'idle',
  remindersTriggered: 0,
}

/**
 * React hook that exposes the live blink monitoring state to components.
 *
 * Subscribes to StateUpdate events from the main process via the preload
 * IPC bridge and mirrors them into React state. Also exposes start() and
 * stop() helpers that forward to the corresponding IPC calls.
 *
 * @returns BlinkMonitorState fields plus { start, stop } as one flat object.
 */
export function useBlinkMonitor() {
  const [state, setState] = useState<BlinkMonitorState>(initialState)

  useEffect(() => {
    // Subscribe to the IPC state update channel exposed by the preload script
    const unsubscribe = window.blinkBuddy.onStateUpdate((update: StateUpdate) => {
      // Replace the entire state on every update
      setState({
        running: update.running,
        blinksPerMinute: update.blinksPerMinute,
        totalBlinks: update.totalBlinks,
        sessionDurationMs: update.sessionDurationMs,
        faceDetected: update.faceDetected,
        reminderState: update.reminderState,
        remindersTriggered: update.remindersTriggered,
        error: update.error,
      })
    })
 
    return unsubscribe
    // Subscribe once on mount; setState is stable so it doesn't need to be a dep.
  }, []) 

  // useCallback stops start and stop from being recreated on every
  // render, which would cause components using them to re-render too.
  const start = useCallback(async (args?: StartArgs) => {
    await window.blinkBuddy.start(args)
  }, [])

  const stop = useCallback(async () => {
    await window.blinkBuddy.stop()
  }, [])

  // Flatten state and the action functions into one object so 
  // consumers can access them directly 
  return { ...state, start, stop }
}