import { useCallback, useState } from 'react'
import { useBlinkMonitor } from './hooks/useBlinkMonitor'
import { useSettings } from './hooks/useSettings'
import { StatusPanel } from './components/StatusPanel'
import { BlinkStatsPanel } from './components/BlinkStatsPanel'
import { PreviewCanvas } from './components/PreviewCanvas'
import { SettingsPanel } from './components/SettingsPanel'
import { StartStopControls } from './components/StartStopControls'
import { ReminderSettingsPanel } from './components/ReminderSettingsPanel'
import { DataManagementPanel } from './components/DataManagementPanel'
import { CvsTipsPanel } from './components/CvsTipsPanel'
import { StatsPage } from './components/StatsPage'
import { TabBar } from './components/TabBar'
import { TABS } from './navigation'
import type { Tab } from './navigation'

/**
 * Top-level layout for BlinkBuddy.
 *
 * Wires the two main hooks (useBlinkMonitor for session state,
 * useSettings for user preferences) into the four-tab UI: Monitor,
 * Tips, Stats, Settings. The TabBar is rendered outside <main> so it
 * stays fixed at the bottom while content scrolls.
 */
function App() {
  // -- Monitoring state  --
  const {
    running,
    blinksPerMinute,
    totalBlinks,
    sessionDurationMs,
    faceDetected,
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

  const handleTwentyTwentyChange = useCallback(
    (enabled: boolean) => {
      setTwentyTwentyEnabled(enabled, running)
    },
    [setTwentyTwentyEnabled, running],
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
        
        {/* One block per tab. Only the active tab's block renders. */}

        {activeTab === 'monitor' && (
          <>
            <BlinkStatsPanel
              blinksPerMinute={blinksPerMinute}
              totalBlinks={totalBlinks}
              sessionDurationMs={sessionDurationMs}
            />

            {/* Camera preview toggle lives on the Monitor page. Three states:
              not running (nothing renders), running with preview enabled (full
              preview + hide button), running with preview disabled (a show button).
              */}
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
          <StatsPage />
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
              onTwentyTwentyChange={handleTwentyTwentyChange}
            />
            <ReminderSettingsPanel running={running} />

            <DataManagementPanel />
          </>
        )}
      </main>
        {/* TabBar sits outside <main> so it stays fixed at the bottom while
          main content scrolls. */}
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}

export default App