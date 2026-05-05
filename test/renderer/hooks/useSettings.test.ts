import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useSettings } from '../../../src/renderer/hooks/useSettings'
import type { UserSettings } from '../../../src/shared/ipc-messages'
import type { CameraInfo } from '../../../src/shared/protocol'

const DEFAULT_SETTINGS: UserSettings = {
  blinkWindowSeconds: 20,
  cameraIndex: 0,
  previewEnabled: false,
  twentyTwentyEnabled: true,
}

const DEFAULT_CAMERAS: CameraInfo[] = [{ index: 0, name: 'Built-in' }]

const mockLoadSettings = vi.fn()
const mockListCameras = vi.fn()
const mockSaveSettings = vi.fn()
const mockSetPreview = vi.fn()
const mockSetTwentyTwenty = vi.fn()

beforeEach(() => {
  mockLoadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS })
  mockListCameras.mockResolvedValue(DEFAULT_CAMERAS)
  mockSaveSettings.mockResolvedValue(undefined)
  mockSetPreview.mockResolvedValue(undefined)
  mockSetTwentyTwenty.mockResolvedValue(undefined)

  window.blinkBuddy = {
    loadSettings: mockLoadSettings,
    listCameras: mockListCameras,
    saveSettings: mockSaveSettings,
    setPreview: mockSetPreview,
    setTwentyTwenty: mockSetTwentyTwenty,
  } as unknown as typeof window.blinkBuddy
})

afterEach(() => {
  vi.clearAllMocks()
  // @ts-expect-error cleanup
  delete window.blinkBuddy
})

describe('useSettings - setTwentyTwentyEnabled', () => {
  it('always persists via saveSettings when toggled', async () => {
    const { result } = renderHook(() => useSettings())
    // Wait for the initial load
    await waitFor(() => expect(result.current.camerasLoading).toBe(false))
    // Clear saveSettings so the upcoming assertion only sees the call
    // from act()
    mockSaveSettings.mockClear()

    act(() => {
      result.current.setTwentyTwentyEnabled(false, false)
    })

    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ twentyTwentyEnabled: false }),
    )
  })

  it('sends live IPC command when running=true', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.camerasLoading).toBe(false))

    act(() => {
      result.current.setTwentyTwentyEnabled(false, true)
    })

    expect(mockSetTwentyTwenty).toHaveBeenCalledWith({ enabled: false })
  })

  it('does not send live IPC command when running=false', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.camerasLoading).toBe(false))

    act(() => {
      result.current.setTwentyTwentyEnabled(true, false)
    })

    // No live IPC when there's no live session - just the persist path.
    expect(mockSetTwentyTwenty).not.toHaveBeenCalled()
  })
})