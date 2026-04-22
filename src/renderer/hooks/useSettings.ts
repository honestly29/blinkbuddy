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

  // Load both settings and cameras together, then validate.
  useEffect(() => {
  Promise.all([
    window.blinkBuddy.loadSettings(),
    window.blinkBuddy.listCameras(),
  ]).then(([loadedSettings, loadedCameras]) => {
    setCameras(loadedCameras)

    // Check if the saved camera index still exists in the available cameras.
    // This handles the case where an external webcam was disconnected since
    // the last session, leaving a stale index (e.g. 1) in settings.json.
    const validIndex = loadedCameras.some(c => c.index === loadedSettings.cameraIndex)
    if (!validIndex && loadedCameras.length > 0) {
      // Stale index: correct to the first available camera and persist the correction 
      const corrected = { ...loadedSettings, cameraIndex: loadedCameras[0].index }
      window.blinkBuddy.saveSettings(corrected)
      setSettings(corrected)
    } else {
      setSettings(loadedSettings)
    }
  }).finally(() => setCamerasLoading(false))
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

  const setTwentyTwentyEnabled = useCallback((enabled: boolean, running: boolean) => {
    setSettings(prev => {
      const next = { ...prev, twentyTwentyEnabled: enabled }
      window.blinkBuddy.saveSettings(next)
      return next
    })
    if (running) {
      window.blinkBuddy.setTwentyTwenty({ enabled })
    }
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