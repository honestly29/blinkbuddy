import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBlinkMonitor } from '../../../src/renderer/hooks/useBlinkMonitor'
import type { StateUpdate } from '../../../src/shared/ipc-messages'

// --- Mock functions for the window.blinkBuddy API ---
const mockStart = vi.fn().mockResolvedValue(undefined)
const mockStop = vi.fn().mockResolvedValue(undefined)

// Holds a reference to the callback that the hook registers via onStateUpdate.
let stateCallback: ((state: StateUpdate) => void) | null = null
const mockUnsubscribe = vi.fn()

beforeEach(() => {
  // Reset all mocks and captured references before each tes
  stateCallback = null
  mockStart.mockClear()
  mockStop.mockClear()
  mockUnsubscribe.mockClear()

  // Create a fake window.blinkBuddy object
  window.blinkBuddy = {
    start: mockStart,
    stop: mockStop,
    onStateUpdate: vi.fn((cb) => {
      stateCallback = cb
      return mockUnsubscribe
    }),
  } as unknown as typeof window.blinkBuddy
})

afterEach(() => {
  // @ts-expect-error cleanup
  delete window.blinkBuddy
})

describe('useBlinkMonitor', () => {
  it('subscribes on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useBlinkMonitor())

    // After mount, the hook should have called onStateUpdate exactly once
    expect(window.blinkBuddy.onStateUpdate).toHaveBeenCalledOnce()
    // The unsubscribe function should NOT have been called yet
    expect(mockUnsubscribe).not.toHaveBeenCalled()

    // Trigger unmount - this should invoke the useEffect cleanup
    unmount()
    // Now the unsubscribe function should have been called to remove the listener
    expect(mockUnsubscribe).toHaveBeenCalledOnce()
  })


  it('returns initial zeroed state', () => {
    const { result } = renderHook(() => useBlinkMonitor())

    // Before any StateUpdate arrives, all values should match initialState
    expect(result.current.running).toBe(false)
    expect(result.current.blinksPerMinute).toBe(0)
    expect(result.current.totalBlinks).toBe(0)
    expect(result.current.sessionDurationMs).toBe(0)
    expect(result.current.faceDetected).toBe(false)
    expect(result.current.reminderState).toBe('idle')
    expect(result.current.shouldShowReminder).toBe(false)
  })


  it('updates state when callback is invoked', () => {
    const { result } = renderHook(() => useBlinkMonitor())

    // Create a StateUpdate simulating an active monitoring session
    const update: StateUpdate = {
      type: 'state_update',
      running: true,
      blinksPerMinute: 15.5,
      totalBlinks: 42,
      sessionDurationMs: 60000,
      faceDetected: true,
      reminderState: 'idle',
      shouldShowReminder: false,
      twentyTwentyState: { phase: 'idle', timeUntilBreakMs: 0, breakTimeRemainingMs: 0 },
      remindersTriggered: 0,
    }

    act(() => {
      stateCallback!(update)
    })

    // Verify the hook's state matches what was sent in the update
    expect(result.current.running).toBe(true)
    expect(result.current.blinksPerMinute).toBe(15.5)
    expect(result.current.totalBlinks).toBe(42)
    expect(result.current.sessionDurationMs).toBe(60000)
    expect(result.current.faceDetected).toBe(true)
  })

  it('start() calls window.blinkBuddy.start()', async () => {
    const { result } = renderHook(() => useBlinkMonitor())

    // Use async act() because start() returns a Promise (async IPC call)
    await act(async () => {
      await result.current.start()
    })

    expect(mockStart).toHaveBeenCalledOnce()
  })

  it('stop() calls window.blinkBuddy.stop()', async () => {
    const { result } = renderHook(() => useBlinkMonitor())

    await act(async () => {
      await result.current.stop()
    })

    expect(mockStop).toHaveBeenCalledOnce()
  })
})
