import { useCallback } from 'react'
import { useBlinkMonitor } from './hooks/useBlinkMonitor'
import { useSettings } from './hooks/useSettings'
import { StatusPanel } from './components/StatusPanel'
import { BlinkStatsPanel } from './components/BlinkStatsPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { StartStopControls } from './components/StartStopControls'
import { ReminderOverlay } from './components/ReminderOverlay'

function App() {
  // -- Hook 1: Monitoring state and actions --
  // Provides running status, blink metrics, and start/stop functions.
  const {
    running,
    blinksPerMinute,
    totalBlinks,
    sessionDurationMs,
    faceDetected,
    shouldShowReminder,
    error,
    start,
    stop,
  } = useBlinkMonitor()

  // -- Hook 2: Settings state and setters --
  // Provides user preferences, camera list, and setter functions.
  // Each hook manages its own concern independently.
  const {
    settings,
    cameras,
    camerasLoading,
    setBlinkWindow,
    setCameraIndex,
    setPreviewEnabled,
    setTwentyTwentyEnabled,
  } = useSettings()


   /**
   * Bridge between the two hooks: packages the current settings
   * into a StartArgs object when the user clicks "Start Monitoring".
   *
   * The dependency array includes `settings` so it always reads the latest values. 
   */
  const handleStart = useCallback(async () => {
    await start({
      cameraIndex: settings.cameraIndex,
      previewEnabled: settings.previewEnabled,
      blinkWindowSeconds: settings.blinkWindowSeconds,
      twentyTwentyEnabled: settings.twentyTwentyEnabled,
    })
  }, [start, settings])

  /**
   * Bridge between the two hooks: injects the current `running` state into the preview setter.
   * When running is true, setPreviewEnabled also sends a set_preview IPC command to the Python process.
   */
  const handlePreviewChange = useCallback(
    (enabled: boolean) => {
      setPreviewEnabled(enabled, running)
    },
    [setPreviewEnabled, running],
  )

  return (
    <div className="flex min-h-screen flex-col bg-gray-900 text-white">
      {/* -- Header -- */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">BlinkBuddy</h1>
          <StatusPanel running={running} faceDetected={faceDetected} />
        </div>
      </header>

      {/* -- Main content area -- */}
      <main className="flex flex-1 flex-col gap-6 p-6">
        <BlinkStatsPanel
          blinksPerMinute={blinksPerMinute}
          totalBlinks={totalBlinks}
          sessionDurationMs={sessionDurationMs}
        />

        {/* Settings panel receives both settings state and the running flag.
            The running flag controls which settings are disabled mid-session. */}
        <SettingsPanel
          settings={settings}
          cameras={cameras}
          camerasLoading={camerasLoading}
          running={running}
          onBlinkWindowChange={setBlinkWindow}
          onCameraChange={setCameraIndex}
          onPreviewChange={handlePreviewChange}
          onTwentyTwentyChange={setTwentyTwentyEnabled}
        />

        {/* Error banner: only rendered when the Python process crashes or exits */}
        {error && (
          <div className="rounded-lg bg-red-900/50 px-4 py-3 text-red-300">
            {error}
          </div>
        )}

        <div className="mt-auto">
          {/* onStart uses handleStart (which packages settings) instead of raw start() */}
          <StartStopControls running={running} onStart={handleStart} onStop={stop} />
        </div>
      </main>

      <ReminderOverlay visible={shouldShowReminder} />
    </div>
  )
}

export default App