import { useCallback } from 'react'
import { useBlinkMonitor } from './hooks/useBlinkMonitor'
import { useSettings } from './hooks/useSettings'
import { StatusPanel } from './components/StatusPanel'
import { BlinkStatsPanel } from './components/BlinkStatsPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { StartStopControls } from './components/StartStopControls'
import { ReminderOverlay } from './components/ReminderOverlay'
import { TwentyTwentyOverlay } from './components/TwentyTwentyOverlay'
import { CvsTipsPanel } from './components/CvsTipsPanel'

function App() {
  // -- Hook 1: Monitoring state and actions --
  const {
    running,
    blinksPerMinute,
    totalBlinks,
    sessionDurationMs,
    faceDetected,
    shouldShowReminder,
    twentyTwentyState,
    error,
    start,
    stop,
  } = useBlinkMonitor()

  // -- Hook 2: Settings state and setters --
  const {
    settings,
    cameras,
    camerasLoading,
    setBlinkWindow,
    setCameraIndex,
    setPreviewEnabled,
    setTwentyTwentyEnabled,
  } = useSettings()


   // Package the current settings into StartArgs when starting a session.
  // Dependency array includes `settings` so we always read the latest values.
  const handleStart = useCallback(async () => {
    await start({
      cameraIndex: settings.cameraIndex,
      previewEnabled: settings.previewEnabled,
      blinkWindowSeconds: settings.blinkWindowSeconds,
      twentyTwentyEnabled: settings.twentyTwentyEnabled,
    })
  }, [start, settings])

  // Bridge between the two hooks: injects the `running` state into
  // the preview setter so it can send a set_preview IPC command mid-session.
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

        {/* Settings panel receives both settings state and the running flag */}
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

        {/*  Static CVS health tips */}
        <CvsTipsPanel />

        <div className="mt-auto">
          <StartStopControls running={running} onStart={handleStart} onStop={stop} />
        </div>
      </main>

      {/* -- Overlay layers -- */}
      <ReminderOverlay visible={shouldShowReminder} />
      <TwentyTwentyOverlay
        phase={twentyTwentyState.phase}
        breakTimeRemainingMs={twentyTwentyState.breakTimeRemainingMs}
      />
    </div>
  )
}

export default App