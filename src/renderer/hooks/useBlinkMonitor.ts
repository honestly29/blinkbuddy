import { useState, useEffect, useCallback } from 'react'
import type { StartArgs, StateUpdate } from '../../shared/ipc-messages'
import type { ReminderState, TwentyTwentyState } from '../../domain/types'

// The state exposed by useBlinkMonitor to React components
export interface BlinkMonitorState {
  running: boolean
  blinksPerMinute: number
  totalBlinks: number
  sessionDurationMs: number
  faceDetected: boolean
  reminderState: ReminderState
  twentyTwentyState: TwentyTwentyState
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
  twentyTwentyState: { phase: 'idle', timeUntilBreakMs: 0, breakTimeRemainingMs: 0 },
  remindersTriggered: 0,
}

// Custom React hook that bridges Electron IPC events into React state
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
        twentyTwentyState: update.twentyTwentyState,
        remindersTriggered: update.remindersTriggered,
        error: update.error,
      })
    })
    // Return the unsubscribe function as the useEffect cleanup
    return unsubscribe
  }, []) 

  // Wrap IPC calls in useCallback so they maintain a stable function reference across re-renders
  const start = useCallback(async (args?: StartArgs) => {
    await window.blinkBuddy.start(args)
  }, [])

  const stop = useCallback(async () => {
    await window.blinkBuddy.stop()
  }, [])

  // Spread all state fields plus start/stop functions into one flat object
  return { ...state, start, stop }
}