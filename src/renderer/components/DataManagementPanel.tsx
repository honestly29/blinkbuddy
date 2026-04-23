import { useEffect, useState } from 'react'

// Dev flag. 
// Set false to disable 'wipe sessions' feature 
// This is for any build going to participants in a study so they can't accidentally destroy their own data. 
const ENABLE_CLEAR_DATA = false

type Status =
  | { kind: 'idle' }
  | { kind: 'exporting' }
  | { kind: 'clearing' }
  | { kind: 'success'; filePath: string }
  | { kind: 'cleared' }
  | { kind: 'no-sessions' }
  | { kind: 'error'; message: string }

export function DataManagementPanel() {
  const [sessionCount, setSessionCount] = useState<number | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  useEffect(() => {
    let cancelled = false
    window.blinkBuddy
      .getSessionHistory()
      .then((sessions) => {
        if (!cancelled) setSessionCount(sessions.length)
      })
      .catch(() => {
        if (!cancelled) setSessionCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Derived UI state. Recomputed each render rather than stored in useState 
  const exporting = status.kind === 'exporting'
  const clearing = status.kind === 'clearing'
  const hasSessions = sessionCount !== null && sessionCount > 0
  // Both buttons disable while either operation is in flight 
  const exportDisabled = !hasSessions || exporting || clearing
  const clearDisabled = !hasSessions || exporting || clearing

  async function handleExport() {
    setStatus({ kind: 'exporting' })
    try {
      const result = await window.blinkBuddy.exportSessionsCsv()

      switch (result.status) {
        case 'saved':
          setStatus({ kind: 'success', filePath: result.filePath })
          break
        case 'cancelled':
          setStatus({ kind: 'idle' })
          break
        case 'no-sessions':
          setStatus({ kind: 'no-sessions' })
          break
        case 'error':
          setStatus({ kind: 'error', message: result.message })
          break
      }
    } catch (err) {
      // Fallback for IPC-layer failures (preload bridge down, etc).
      const message = err instanceof Error ? err.message : String(err)
      setStatus({ kind: 'error', message })
    }
  }

  async function handleClear() {
    setStatus({ kind: 'clearing' })
    try {
      const result = await window.blinkBuddy.clearSessions()
      switch (result.status) {
        case 'cleared':
          // Update the local count immediately so the Export button
          // disables without waiting for the next getSessionHistory fetch. 
          setSessionCount(0)
          setStatus({ kind: 'cleared' })
          break
        case 'cancelled':
          setStatus({ kind: 'idle' })
          break
        case 'error':
          setStatus({ kind: 'error', message: result.message })
          break
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus({ kind: 'error', message })
    }
  }

  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <h2 className="mb-4 text-lg font-semibold text-white">Data Management</h2>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-300">Export session history</p>
            <p className="text-xs text-gray-500">Save all logged sessions as a CSV file.</p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exportDisabled}
            className="rounded bg-gray-600 px-3 py-1 text-xs text-white transition-colors hover:bg-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {/* Label flips mid-export so the user sees the click register */}
            {exporting ? 'Exporting…' : 'Export to CSV'}
          </button>
        </div>

        {/* Conditional render means the row
            is entirely absent from the DOM when the flag is off. */}
        {ENABLE_CLEAR_DATA && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300">Clear all session data</p>
              <p className="text-xs text-gray-500">Delete every logged session. Cannot be undone.</p>
            </div>
            <button
              type="button"
              onClick={handleClear}
              disabled={clearDisabled}
              className="rounded bg-red-700 px-3 py-1 text-xs text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {clearing ? 'Clearing…' : 'Clear All Data'}
            </button>
          </div>
        )}

        {/* Hint only appears once we've confirmed there are zero sessions */}
        {sessionCount === 0 && (
          <p className="text-xs text-gray-500">No sessions logged yet - start a monitoring session first.</p>
        )}

        {status.kind === 'success' && (
          <p className="rounded bg-green-900/40 px-3 py-2 text-xs text-green-300">
            Saved to <span className="break-all font-mono">{status.filePath}</span>
          </p>
        )}

        {status.kind === 'cleared' && (
          <p className="rounded bg-green-900/40 px-3 py-2 text-xs text-green-300">
            All session data cleared.
          </p>
        )}

        {status.kind === 'no-sessions' && (
          <p className="rounded bg-gray-700/60 px-3 py-2 text-xs text-gray-300">
            No sessions to export yet.
          </p>
        )}

        {status.kind === 'error' && (
          <p className="rounded bg-red-900/40 px-3 py-2 text-xs text-red-300">
            {status.message}
          </p>
        )}
      </div>
    </div>
  )
}