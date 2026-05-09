import { useState, useEffect } from 'react'
import type { SessionSummary } from '../../shared/ipc-messages'
import { SummaryCard } from './SummaryCard'
import { BlinkRateChart } from './BlinkRateChart'
import { SessionList } from './SessionList'
import {
  HEALTHY_BLINK_RATE,
  MIN_SESSION_SECONDS,
  computeOverviewStats,
} from '../../domain/session-history'
import { formatTotalTime } from './session-stats'


/**
 * Top-level page component for the Stats tab.
 *
 * Composes three sections from smaller building blocks:
 *   1. Overview cards (2x2 grid of SummaryCard)
 *   2. Blink rate trend chart (BlinkRateChart)
 *   3. Date-grouped session list (SessionList, with a show-older toggle)
 *
 * The page owns two pieces of state:
 *   - The list of sessions, fetched once on mount from the main process.
 *   - Whether the older-sessions section is expanded.
 *
 * All formatting and aggregation logic lives in session-stats.ts. This
 * component just receives the session data and passes it down to each
 * child. If there are no sessions yet, it shows an explanatory message
 * instead of rendering all the cards with zero values.
 */
export function StatsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [showAll, setShowAll] = useState(false)

  // Fetch session history once, on first render. The empty dependency
  // tells React not to re-run this effect on subsequent renders.
  useEffect(() => {
    window.blinkBuddy.getSessionHistory().then(setSessions)
  }, [])

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg bg-gray-800 p-6 text-center text-gray-400">
        No sessions yet - start monitoring to see your stats here.
      </div>
    )
  }

  // Sessions shorter than MIN_SESSION_SECONDS are excluded from the
  // overview stats and the chart, since their averages would be noisy
  // and unrepresentative. They still appear in the session list below.
  const meaningful = sessions.filter((s) => s.totalDurationSeconds >= MIN_SESSION_SECONDS)
  const stats = computeOverviewStats(meaningful)

  return (
    <div className="space-y-6">
      {/* Overview: 2x2 grid of headline numbers, plus a footnote
          explaining what counts as a "healthy" session. */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Overview*
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <SummaryCard
            label="Average Blink Rate (across all sessions)"
            value={`${stats.avgBlinkRate.toFixed(1)} blinks/min`}
          />
          <SummaryCard
            label="Total Sessions"
            value={String(stats.totalSessions)}
            subtitle={formatTotalTime(stats.totalTimeSeconds) + ' monitored'}
          />
          <SummaryCard
            label="Total Reminders"
            value={String(stats.totalReminders)}
            subtitle={`Average of ${Math.round(stats.avgRemindersPerSession)} reminders per session`}
          />
          {/* The healthy-session card shows "N/A" when there are no
            meaningful sessions yet, rather than "0%".*/}
          <SummaryCard
            label="Healthy Session Rate**"
            value={
              stats.healthySessionPercent === null
                ? 'N/A'
                : `${Math.round(stats.healthySessionPercent)}%`
            }
            subtitle={
              stats.healthySessionPercent === null
                ? 'No meaningful sessions yet'
                : `${stats.healthySessionCount} of ${stats.totalSessions} sessions`
            }
          />
        </div>
        <p className="mt-1 text-xs font-medium text-gray-500">
          {`* Stats and the trend chart only include sessions longer than ${MIN_SESSION_SECONDS / 60} minutes.`}
        </p>
        <p className="mt-3 text-xs font-medium text-gray-500">
          {`** A healthy session averages at least ${HEALTHY_BLINK_RATE} blinks per minute.`}
        </p>
      </div>

      {/* Trend: per-day average blink rate for the last 8 days that had
        sessions. Uses the same `meaningful` filter as the overview. */}
      <BlinkRateChart sessions={meaningful} />

      {/* Session list: every session, grouped by day, with a toggle for
        older entries. Uses the unfiltered list so short sessions are
        still visible. */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Session History
        </h2>
        <SessionList sessions={sessions} showAll={showAll} onToggle={() => setShowAll((v) => !v)} />
      </div>
    </div>
  )
}