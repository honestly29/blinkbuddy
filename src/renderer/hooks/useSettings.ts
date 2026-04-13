import { useState, useEffect, useCallback } from 'react'
import type { UserSettings } from '../../shared/ipc-messages'
import type { CameraInfo } from '../../shared/protocol'

// Renderer-side copy of the default settings.
// Used as initial React state before loadSettings() resolves.
const DEFAULT_SETTINGS: UserSettings = {
  blinkWindowSeconds: 20,
  cameraIndex: 0,
  previewEnabled: false,
  twentyTwentyEnabled: true,
}


/**
 * Custom hook that manages user settings state and persistence.
 *
 * On mount: loads persisted settings from disk and fetches the camera list.
 * On change: updates React state immediately (for instant UI feedback)
 *   and fires an IPC call to save to disk (for persistence across restarts).
 *
 * Returns the current settings, camera list, loading state, and setter functions.
 */
export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [cameras, setCameras] = useState<CameraInfo[]>([])
  // Tracks whether the camera list is still loading from the Python process.
  // Starts true because the fetch begins immediately on mount.
  const [camerasLoading, setCamerasLoading] = useState(true)

  // Load persisted settings and enumerate cameras on mount.
  useEffect(() => {
    window.blinkBuddy.loadSettings().then(setSettings)
    window.blinkBuddy
      .listCameras()
      .then(setCameras)
      .finally(() => setCamerasLoading(false))  // Clear loading flag even if the call fails
  }, [])

  const setBlinkWindow = useCallback((seconds: number) => {
    setSettings(prev => {
      const next = { ...prev, blinkWindowSeconds: seconds }
      window.blinkBuddy.saveSettings(next)  // Persist to disk via IPC
      return next
    })
  }, [])

  const setCameraIndex = useCallback((index: number) => {
    setSettings(prev => {
      const next = { ...prev, cameraIndex: index }
      window.blinkBuddy.saveSettings(next)
      return next
    })
  }, [])

  // Preview is the only setting that can change mid-session.
  const setPreviewEnabled = useCallback((enabled: boolean, running: boolean) => {
    setSettings(prev => {
      const next = { ...prev, previewEnabled: enabled }
      window.blinkBuddy.saveSettings(next)
      return next
    })
    if (running) {
      window.blinkBuddy.setPreview({ enabled })
    }
  }, [])

  const setTwentyTwentyEnabled = useCallback((enabled: boolean) => {
    setSettings(prev => {
      const next = { ...prev, twentyTwentyEnabled: enabled }
      window.blinkBuddy.saveSettings(next)
      return next
    })
  }, [])

  // Re-fetch the camera list from the Python process.
  const refreshCameras = useCallback(() => {
    setCamerasLoading(true)
    window.blinkBuddy
      .listCameras()
      .then(setCameras)
      .finally(() => setCamerasLoading(false))
  }, [])

  return {
    settings,
    cameras,
    camerasLoading,
    setBlinkWindow,
    setCameraIndex,
    setPreviewEnabled,
    setTwentyTwentyEnabled,
    refreshCameras,
  }
}