import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import App from '../../../src/renderer/App'
import type { StateUpdate, UserSettings } from '../../../src/shared/ipc-messages'

const defaultSettings: UserSettings = {
  blinkWindowSeconds: 20,
  cameraIndex: 0,
  previewEnabled: false,
  twentyTwentyEnabled: true,
}
const mockStart = vi.fn().mockResolvedValue(undefined)
const mockStop = vi.fn().mockResolvedValue(undefined)
const mockSaveSettings = vi.fn().mockResolvedValue(undefined)
const mockLoadSettings = vi.fn().mockResolvedValue(defaultSettings)
const mockListCameras = vi.fn().mockResolvedValue([])
const mockSetPreview = vi.fn().mockResolvedValue(undefined)
const mockGetSessionHistory = vi.fn().mockResolvedValue([])
const mockGetReminderPreferences = vi.fn().mockResolvedValue({
  overlay: { enabled: true },
  screenEdgeGlow: { enabled: true, colour: '#38bdf8', opacity: 0.3 },
  cornerPopup: { enabled: true, corner: 'bottom-right' },
  audioCue: { enabled: true, soundFile: 'dragon-studio-ding.mp3', volume: 0.5 },
})
let stateCallback: ((state: StateUpdate) => void) | null = null
const mockUnsubscribe = vi.fn()

// Creates default StateUpdate that can be customised with overrides
function makeStateUpdate(overrides: Partial<StateUpdate> = {}): StateUpdate {
  return {
    type: 'state_update',
    running: false,
    blinksPerMinute: 0,
    totalBlinks: 0,
    sessionDurationMs: 0,
    faceDetected: false,
    reminderState: 'idle',
    shouldShowReminder: false,
    twentyTwentyState: { phase: 'idle', timeUntilBreakMs: 0, breakTimeRemainingMs: 0 },
    remindersTriggered: 0,
    ...overrides,
  }
}

beforeEach(() => {
  stateCallback = null
  mockStart.mockClear()
  mockStop.mockClear()
  mockSaveSettings.mockClear()
  mockLoadSettings.mockClear().mockResolvedValue(defaultSettings)
  mockListCameras.mockClear().mockResolvedValue([])
  mockSetPreview.mockClear()
  mockGetSessionHistory.mockClear().mockResolvedValue([])
  mockGetReminderPreferences.mockClear().mockResolvedValue({
    overlay: { enabled: true },
    screenEdgeGlow: { enabled: true, colour: '#38bdf8', opacity: 0.3 },
    cornerPopup: { enabled: true, corner: 'bottom-right' },
    audioCue: { enabled: true, soundFile: 'dragon-studio-ding.mp3', volume: 0.5 },
  })
  mockUnsubscribe.mockClear()

  window.blinkBuddy = {
    start: mockStart,
    stop: mockStop,
    saveSettings: mockSaveSettings,
    loadSettings: mockLoadSettings,
    listCameras: mockListCameras,
    setPreview: mockSetPreview,
    getSessionHistory: mockGetSessionHistory,
    getReminderPreferences: mockGetReminderPreferences,
    updateReminderPreferences: vi.fn().mockResolvedValue(undefined),
    testReminder: vi.fn().mockResolvedValue(undefined),
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

describe('App', () => {
  // --- Integration test: renders the full App component tree ---
  it('renders initial stopped state correctly', () => {
    render(<App />)
    // Verify elements from multiple child components are all present
    expect(screen.getByText('BlinkBuddy')).toBeDefined()
    expect(screen.getByText('Stopped')).toBeDefined()
    expect(screen.getByText('Start Monitoring')).toBeDefined()
    expect(screen.getByText('00:00')).toBeDefined()
    expect(screen.getByText('0')).toBeDefined()
    expect(screen.getByText('0.0')).toBeDefined()
  })

  it('renders settings panel on Settings tab', () => {
    render(<App />)

    fireEvent.click(screen.getByText('Settings'))

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeDefined()
    expect(screen.getByText('Camera')).toBeDefined()
    expect(screen.getByText('Blink window (seconds)')).toBeDefined()
    expect(screen.getByText('20-20-20 break reminders')).toBeDefined()
  })
  
  it('updates to running state with face detected', () => {
    render(<App />)
    // Simulate a state update arriving from the main process via IPC.
    act(() => {
      stateCallback!(makeStateUpdate({
        running: true,
        faceDetected: true,
        blinksPerMinute: 15.3,
        totalBlinks: 42,
        sessionDurationMs: 65000,
      }))
    })
    // Verify all affected components updated correctly from the single state update
    expect(screen.getByText('Face Detected')).toBeDefined()
    expect(screen.getByText('Stop Monitoring')).toBeDefined()
    expect(screen.getByText('15.3')).toBeDefined()
    expect(screen.getByText('42')).toBeDefined()
    expect(screen.getByText('01:05')).toBeDefined()
  })

 
  it('shows reminder overlay when shouldShowReminder is true', () => {
    render(<App />)

    act(() => {
      stateCallback!(makeStateUpdate({
        running: true,
        shouldShowReminder: true,
        reminderState: 'overdue',
      }))
    })
    // Verify the overlay is visible with correct CSS classes
    const overlay = screen.getByRole('alert')
    expect(overlay.textContent).toBe('Remember to blink!')
    expect(overlay.className).toContain('translate-y-0')
    expect(overlay.className).toContain('opacity-100')
  })

 
  it('hides reminder overlay when shouldShowReminder is false', () => {
    render(<App />)
    // No state update sent - default state has shouldShowReminder: false
    const overlay = screen.getByRole('alert')
    expect(overlay.className).toContain('translate-y-full')
    expect(overlay.className).toContain('opacity-0')
  })

  
  it('displays error message when error is set', () => {
    render(<App />)

    act(() => {
      stateCallback!(makeStateUpdate({
        error: 'Camera disconnected',
      }))
    })

    expect(screen.getByText('Camera disconnected')).toBeDefined()
  })

  // verifies that start() is called with the full StartArgs
  // object containing the user's settings
  it('calls start with settings when Start Monitoring is clicked', async () => {
    render(<App />)

    fireEvent.click(screen.getByText('Start Monitoring'))

    await waitFor(() => {
      // handleStart should package the default settings into StartArgs
      expect(mockStart).toHaveBeenCalledWith({
        cameraIndex: 0,
        previewEnabled: false,
        blinkWindowSeconds: 20,
        twentyTwentyEnabled: true,
      })
    })
  })

 
  it('calls stop when Stop Monitoring is clicked', async () => {
    render(<App />)
    // First, transition to running state so the Stop button appears
    act(() => {
      stateCallback!(makeStateUpdate({ running: true }))
    })

    fireEvent.click(screen.getByText('Stop Monitoring'))

    await waitFor(() => {
      expect(mockStop).toHaveBeenCalledOnce()
    })
  })

  // Verify that both hooks fire their initial data fetches on mount
  it('loads settings and cameras on mount', () => {
    render(<App />)

    expect(mockLoadSettings).toHaveBeenCalledOnce()
    expect(mockListCameras).toHaveBeenCalledOnce()
  })
})