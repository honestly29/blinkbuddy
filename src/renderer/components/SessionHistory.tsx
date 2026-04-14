import { useState, useEffect } from 'react'
import type { SessionSummary } from '../../shared/ipc-messages'

// Convert a total seconds value into a human-readable duration string.
// e.g. 300 -> "5m 0s", 45 -> "45s", 0 -> "0s"
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}


/**
 * Displays a list of past monitoring sessions loaded from disk.
 *
 * Loads session history once on mount via getSessionHistory() IPC call.
 * Does not re-fetch after new sessions are recorded (snapshot on mount).
 * Shows "No sessions yet" if the history is empty.
 */
export function SessionHistory() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])

  // Load session history once on mount
  useEffect(() => {
    window.blinkBuddy.getSessionHistory().then(setSessions)
  }, [])

  // Empty state placeholder
  if (sessions.length === 0) {
    return (
      <div className="rounded-lg bg-gray-800 p-4 text-center text-gray-500">
        No sessions yet
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
        Session History
      </h2>
      <div className="space-y-2">
        {/* Reverse the array so the most recent session appears first.
            The spread [...sessions] creates a shallow copy to avoid
            mutating the original state array. */}
        {[...sessions].reverse().map((s, i) => (
          <div key={i} className="rounded-lg bg-gray-800 px-4 py-3">
            {/* Header row: date and duration */}
            <div className="mb-1 text-sm font-medium text-gray-200">
              {new Date(s.sessionStart).toLocaleDateString()} &mdash;{' '}
              {formatDuration(s.totalDurationSeconds)}
            </div>
            {/* Metrics */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
              <span>Avg {s.avgBlinksPerMinute.toFixed(1)} blinks/min</span>
              <span>Total {s.totalBlinks} blinks</span>
              {/* Conditionally shown: hide when 0 (no inter-blink intervals) */}
              {s.longestGapBetweenBlinks > 0 && (
                <span>Longest gap {s.longestGapBetweenBlinks.toFixed(1)}s</span>
              )}
              <span>{s.remindersTriggered} reminders</span>
              {/* Conditionally shown: hide when 0 (20-20-20 was disabled or no breaks completed) */}
              {s.twentyTwentyBreaksTaken > 0 && (
                <span>{s.twentyTwentyBreaksTaken} breaks</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}