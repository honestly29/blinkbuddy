import { useBlinkMonitor } from './hooks/useBlinkMonitor'
import { StatusPanel } from './components/StatusPanel'
import { BlinkStatsPanel } from './components/BlinkStatsPanel'
import { StartStopControls } from './components/StartStopControls'
import { ReminderOverlay } from './components/ReminderOverlay'

function App() {
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

  return (
    // Full-height flex column layout that stretches to fill the Electron window
    <div className="flex min-h-screen flex-col bg-gray-900 text-white">
      {/* --- Header: app title + status badge --- */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">BlinkBuddy</h1>
          {/* StatusPanel shows Stopped / Face Detected / No Face Detected */}
          <StatusPanel running={running} faceDetected={faceDetected} />
        </div>
      </header>

      {/* --- Main content area --- */}
      <main className="flex flex-1 flex-col gap-6 p-6">
        {/* Three stat cards in a horizontal row */}
        <BlinkStatsPanel
          blinksPerMinute={blinksPerMinute}
          totalBlinks={totalBlinks}
          sessionDurationMs={sessionDurationMs}
        />

        {/* Conditionally rendered error banner.
            Only appears when the Python process crashes or exits unexpectedly,
            in which case the Session Manager sets the error field. */}
        {error && (
          <div className="rounded-lg bg-red-900/50 px-4 py-3 text-red-300">
            {error}
          </div>
        )}

        <div className="mt-auto">
          <StartStopControls running={running} onStart={start} onStop={stop} />
        </div>
      </main>

        {/* Reminder overlay uses fixed positioning, so it floats above all content */}
      <ReminderOverlay visible={shouldShowReminder} />
    </div>
  )
}

export default App