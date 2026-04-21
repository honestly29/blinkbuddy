import { useCallback, useState } from 'react'
import { useBlinkMonitor } from './hooks/useBlinkMonitor'
import { useSettings } from './hooks/useSettings'
import { StatusPanel } from './components/StatusPanel'
import { BlinkStatsPanel } from './components/BlinkStatsPanel'
import { PreviewCanvas } from './components/PreviewCanvas'
import { SettingsPanel } from './components/SettingsPanel'
import { StartStopControls } from './components/StartStopControls'
import { ReminderOverlay } from './components/ReminderOverlay'
import { TwentyTwentyOverlay } from './components/TwentyTwentyOverlay'
import { ReminderSettingsPanel } from './components/ReminderSettingsPanel'
import { CvsTipsPanel } from './components/CvsTipsPanel'
import { SessionHistory } from './components/SessionHistory'
import { TabBar } from './components/TabBar'
import { TABS } from './navigation'
import type { Tab } from './navigation'

function App() {
  // -- Monitoring state  --
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

  // -- User Settings --
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

  // --- Tab routing state ---
  const [activeTab, setActiveTab] = useState<Tab>('monitor')

  return (
    <div className="flex h-screen flex-col bg-gray-900 text-white">
      {/* -- Header -- */}
      <header className="shrink-0 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">BlinkBuddy</h1>
          <StatusPanel running={running} faceDetected={faceDetected} />
        </div>
      </header>

      {/* -- Main content area -- */}
      <main className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
        
        {activeTab === 'monitor' && (
          <>
            <BlinkStatsPanel
              blinksPerMinute={blinksPerMinute}
              totalBlinks={totalBlinks}
              sessionDurationMs={sessionDurationMs}
            />

            {/* Camera preview toggle lives on the Monitor page. */}
            {running && (
              settings.previewEnabled ? (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-400">Camera preview</h3>
                    <button
                      onClick={() => handlePreviewChange(false)}
                      className="text-sm text-gray-400 transition-colors hover:text-white"
                    >
                      Hide preview
                    </button>
                  </div>
                  <PreviewCanvas visible />
                </div>
              ) : (
                // Preview is off: show a single button to turn it on.
                <button
                  onClick={() => handlePreviewChange(true)}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
                >
                  Show camera preview
                </button>
              )
            )}

            {error && (
              <div className="rounded-lg bg-red-900/50 px-4 py-3 text-red-300">
                {error}
              </div>
            )}

            <div className="mt-auto">
              <StartStopControls running={running} onStart={handleStart} onStop={stop} />
            </div>
          </>
        )}
        {activeTab === 'tips' && (
          <CvsTipsPanel />
        )}
        {activeTab === 'stats' && (
          <SessionHistory />
        )}
        {activeTab === 'settings' && (
          <>
            <SettingsPanel
              settings={settings}
              cameras={cameras}
              camerasLoading={camerasLoading}
              running={running}
              onBlinkWindowChange={setBlinkWindow}
              onCameraChange={setCameraIndex}
              onTwentyTwentyChange={setTwentyTwentyEnabled}
            />
            <ReminderSettingsPanel running={running} />
          </>
        )}
      </main>

      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      <ReminderOverlay visible={shouldShowReminder} />
      <TwentyTwentyOverlay
        phase={twentyTwentyState.phase}
        breakTimeRemainingMs={twentyTwentyState.breakTimeRemainingMs}
      />
    </div>
  )
}

export default App