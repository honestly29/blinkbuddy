import { useState, useEffect } from 'react'
import type { SessionSummary } from '../../shared/ipc-messages'

// Minimum session length (in seconds) for a session to count toward the aggregate statistics.
// From sessions shorter than this, the blink rate data is unreliable
// These short sessions are filtered out of the stats and chart, but still appear in the session history list so the user has a complete record.
const MIN_SESSION_SECONDS = 120

const HEALTHY_BLINK_RATE = 15 // blinks per minute

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Formats a session's length, e.g. "5m 30s" or "45s"
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

// Formats an aggregate monitoring time across many sessions, e.g. "2h 15m".
function formatTotalTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}


// Aggregate statistics derived from the user's session history.
// Computed once when the data loads and passed to the overview cards.
interface OverviewStats {
  avgBlinkRate: number
  totalSessions: number
  totalTimeSeconds: number
  totalReminders: number
  avgRemindersPerSession: number
  healthySessionPercent: number | null // null = no meaningful sessions to measure
  healthySessionCount: number
}


function computeOverviewStats(sessions: SessionSummary[]): OverviewStats {
  const totalSessions = sessions.length
  const totalTimeSeconds = sessions.reduce((sum, s) => sum + s.totalDurationSeconds, 0)
  const totalReminders = sessions.reduce((sum, s) => sum + s.remindersTriggered, 0)
  const healthySessionCount = sessions.filter(
    (s) => s.avgBlinksPerMinute >= HEALTHY_BLINK_RATE,
  ).length

  // Weighted average blink rate, weighted by session duration.
  // sum(blink_rate × duration) / sum(duration)
  const weightedSum = sessions.reduce(
    (sum, s) => sum + s.avgBlinksPerMinute * s.totalDurationSeconds,
    0,
  )
  const avgBlinkRate = totalTimeSeconds > 0 ? weightedSum / totalTimeSeconds : 0

  return {
    avgBlinkRate,
    totalSessions,
    totalTimeSeconds,
    totalReminders,
    avgRemindersPerSession: totalSessions > 0 ? totalReminders / totalSessions : 0,
    healthySessionPercent:
      totalSessions > 0 ? (healthySessionCount / totalSessions) * 100 : null,
      healthySessionCount,
  }
}


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// Stat card used for the four overview metrics. 
function SummaryCard({
  label,
  value,
  subtitle,
}: {
  label: string
  value: string
  subtitle?: string
}) {
  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
    </div>
  )
}

// Per-day aggregated blink rate used by the chart.
interface DailyRate {
  date: string    // sortable YYYY-MM-DD key
  label: string
  rate: number    // weighted average
  totalDuration: number
}


function computeDailyRates(sessions: SessionSummary[]): DailyRate[] {
  // Map keyed by YYYY-MM-DD, holding the running weighted-sum numerator and total duration denominator. 
  const byDay = new Map<string, { weightedSum: number; totalDuration: number }>()

  for (const s of sessions) {
    const d = new Date(s.sessionStart)
    // Build the YYYY-MM-DD key from local-time components. 
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const entry = byDay.get(key) ?? { weightedSum: 0, totalDuration: 0 }
    // Duration-weighted average formula but per day instead of across the whole history.
    entry.weightedSum += s.avgBlinksPerMinute * s.totalDurationSeconds
    entry.totalDuration += s.totalDurationSeconds
    byDay.set(key, entry)
  }

  const days = [...byDay.entries()]
    .map(([key, { weightedSum, totalDuration }]) => {
      // Appending 'T00:00:00' forces the date string to be parsed in LOCAL time. 
      const d = new Date(key + 'T00:00:00')
      const day = d.getDate()
      const month = d.toLocaleString(undefined, { month: 'short' })
      return {
        date: key,
        label: `${day} ${month}`,
        rate: totalDuration > 0 ? weightedSum / totalDuration : 0,
        totalDuration,
      }
    })

    // Sorts YYYY-MM-DD keys chronologically 
    .sort((a, b) => a.date.localeCompare(b.date))
  
  // Take the most recent 8 days that have data
  return days.slice(-8)
}

function BlinkRateChart({ sessions }: { sessions: SessionSummary[] }) {
  const days = computeDailyRates(sessions)
  // If there are no days to show render nothing rather than an empty chart.
  if (days.length === 0) return null

  // --- SVG layout constants ---
  const svgWidth = 400
  const svgHeight = 200
  const padLeft = 26
  const padRight = 5
  const padTop = 22
  const padBottom = 18
  const chartWidth = svgWidth - padLeft - padRight
  const chartHeight = svgHeight - padTop - padBottom

  const maxRate = Math.max(...days.map((d) => d.rate), 20)
  const ceilMax = Math.ceil(maxRate / 10) * 10

  // Y position of the reference line at the healthy blink rate threshold 
  const refY = padTop + chartHeight - (HEALTHY_BLINK_RATE / ceilMax) * chartHeight

  const barWidth = 28
  const barGap = 14
  const groupWidth = days.length * barWidth + (days.length - 1) * barGap

  // Centre the group of bars in the chart area
  const offsetX = padLeft + (chartWidth - groupWidth) / 2

  // Y-axis tick values at every 10 blinks/min up to the ceiling
  const ticks: number[] = []
  for (let v = 0; v <= ceilMax; v += 10) ticks.push(v)
  
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
        Blink Rate Trend
      </h2>
      <div className="rounded-lg bg-gray-800 p-4">
        
        <svg
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="img"
          aria-label="Blink rate trend bar chart"
        >
          {/* Y-axis ticks and labels */}
          {ticks.map((v) => {
            const y = padTop + chartHeight - (v / ceilMax) * chartHeight
            return (
              <g key={`tick-${v}`}>
                <line
                  x1={padLeft - 4}
                  y1={y}
                  x2={padLeft}
                  y2={y}
                  stroke="#6b7280"
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="#6b7280"
                  fontSize={8}
                >
                  {v}
                </text>
              </g>
            )
          })}

          {/* Y-axis vertical line */}
          <line
            x1={padLeft}
            y1={padTop}
            x2={padLeft}
            y2={padTop + chartHeight}
            stroke="#374151"
            strokeWidth={1}
          />

          {/* X-axis baseline */}
          <line
            x1={padLeft}
            y1={padTop + chartHeight}
            x2={svgWidth - padRight}
            y2={padTop + chartHeight}
            stroke="#374151"
            strokeWidth={1}
          />

          {/* Reference line at 15 blinks/min (the healthy threshold) */}
          <line
            x1={padLeft}
            y1={refY}
            x2={svgWidth - padRight}
            y2={refY}
            stroke="rgba(74, 222, 128, 0.3)"
            strokeDasharray="6 4"
            strokeWidth={1}
          />
          <text
            x={padLeft}
            y={refY + 3.5}
            textAnchor="end"
            fill="#4ade80"
            fontSize={7}
            opacity={0.6}
          >
            Healthy
          </text>

          {/* Bars + labels. Each day becomes one group containing:
              - the bar 
              - the rate value above the bar
              - the date label below the X-axis
              - the daily monitoring time below the date */}
          {days.map((d, i) => {
            // Colours: green for healthy, amber for low.
            const healthy = d.rate >= HEALTHY_BLINK_RATE
            const fill = healthy
              ? 'rgba(34, 197, 94, 0.75)'
              : 'rgba(217, 158, 20, 0.75)'
            const barHeight = (d.rate / ceilMax) * chartHeight
          
            const x = offsetX + i * (barWidth + barGap)
           
            const y = padTop + chartHeight - barHeight

            return (
              <g key={d.date}>
                {/* `rx={3}` rounds the bar corners */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={3}
                  fill={fill}
                />
                {/* Numeric value label, centred above the bar. */}
                <text
                  x={x + barWidth / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fill="#e5e7eb"
                  fontSize={7}
                  fontWeight={500}
                >
                  {d.rate.toFixed(1)}
                </text>
                {/* Date label ("15 Apr"), centred under the bar. */}
                <text
                  x={x + barWidth / 2}
                  y={svgHeight - 8}
                  textAnchor="middle"
                  fill="#9ca3af"
                  fontSize={7}
                >
                  {d.label}
                </text>
                {/* Monitoring time for the day, below the date. */}
                <text
                  x={x + barWidth / 2}
                  y={svgHeight}
                  textAnchor="middle"
                  fill="#6b7280"
                  fontSize={7}
                >
                  {formatTotalTime(d.totalDuration)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}


// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

// Time-only formatter for session rows.
function formatSessionTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// Day-header formatter: "Today", "Yesterday", or a date like "31 March"
function formatDayHeader(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()

  // Strip the time component by building new Date objects at midnight.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const sessionDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (sessionDay.getTime() === today.getTime()) return 'Today'
  if (sessionDay.getTime() === yesterday.getTime()) return 'Yesterday'

  // Full month name for older dates 
  const day = date.getDate()
  const month = date.toLocaleString(undefined, { month: 'long' })
  return `${day} ${month}`
}


// ---------------------------------------------------------------------------
// Grouping Logic
// ---------------------------------------------------------------------------

// A day's worth of sessions
interface SessionGroup {
  header: string
  sessions: SessionSummary[]
}

// Group sessions under date headers.
// We reverse the order so dates are ordered newest-first
function groupSessionsByDay(sessions: SessionSummary[]): SessionGroup[] {
  const reversed = [...sessions].reverse()
  const groups: SessionGroup[] = []
  // Track the current day's key so we only create a new group when the day actually changes. 
  let currentKey = ''

  for (const s of reversed) {
    const d = new Date(s.sessionStart)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (key !== currentKey) {
      currentKey = key
      groups.push({ header: formatDayHeader(s.sessionStart), sessions: [] })
    }
    // Push into the most recently created group. 
    groups[groups.length - 1].sessions.push(s)
  }

  return groups
}

// Display blink rate with a health-indicating colour.
function BlinkRateBadge({ rate }: { rate: number }) {
  const healthy = rate >= HEALTHY_BLINK_RATE

  const colour = healthy
    ? 'bg-green-500/20 text-green-400'
    : 'bg-amber-500/20 text-amber-400'

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colour}`}>
      {rate.toFixed(1)}/min
    </span>
  )
}

// One row in the session history list.
// Top line: time + blink rate badge 
// Bottom line: duration + blinks + reminders
function SessionRow({ session }: { session: SessionSummary }) {
  return (
    <div className="rounded-lg bg-gray-800 px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-200">
          {formatSessionTime(session.sessionStart)}
        </span>
        <BlinkRateBadge rate={session.avgBlinksPerMinute} />
      </div>
      <div className="mt-1 text-xs text-gray-400">
        {formatDuration(session.totalDurationSeconds)} &middot;{' '}
        {session.totalBlinks} blinks &middot;{' '}
        
        {session.remindersTriggered} {session.remindersTriggered === 1 ? 'reminder' : 'reminders'}
      </div>
    </div>
  )
}


function SessionGroupList({ groups }: { groups: SessionGroup[] }) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.header}>
          <h3 className="mb-1.5 mt-3 text-xs font-medium text-gray-500 first:mt-0">
            {group.header}
          </h3>
          <div className="space-y-2">
            {group.sessions.map((s, i) => (
              <SessionRow key={i} session={s} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}


// ---------------------------------------------------------------------------
// 7-Day Cutoff with Expand/Collapse Toggle
// ---------------------------------------------------------------------------

function SessionList({
  sessions,
  showAll,
  onToggle,
}: {
  sessions: SessionSummary[]
  showAll: boolean
  onToggle: () => void
}) {
  // Cutoff = start of the day 7 days ago. 
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 7)
  cutoffDate.setHours(0, 0, 0, 0)

  // Split into two arrays first, then group each independently. 
  const recentSessions = sessions.filter((s) => new Date(s.sessionStart) >= cutoffDate)
  const olderSessions = sessions.filter((s) => new Date(s.sessionStart) < cutoffDate)
  const recentGroups = groupSessionsByDay(recentSessions)
  const olderGroups = groupSessionsByDay(olderSessions)

  return (
    <div className="space-y-1">
      <SessionGroupList groups={recentGroups} />
      {/* Toggle button only renders when there is something older to show. */}
      {olderGroups.length > 0 && (
        <button
          onClick={onToggle}
          className="mt-3 w-full rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
        >
          {showAll ? 'Show less' : 'Show older sessions'}
        </button>
      )}
      {showAll && <SessionGroupList groups={olderGroups} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SessionHistory() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [showAll, setShowAll] = useState(false)

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

  // Exclude sessions shorter than 2 minutes from stats and chart
  const meaningful = sessions.filter((s) => s.totalDurationSeconds >= MIN_SESSION_SECONDS)
  const stats = computeOverviewStats(meaningful)

  return (
    <div className="space-y-6">
      {/* Overview summary cards */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Overview
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
          <SummaryCard
            label="Healthy Session Rate*"
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
        <p className="mt-3 text-xs font-medium text-gray-500">
          {`* A healthy session averages at least ${HEALTHY_BLINK_RATE} blinks per minute.`}
        </p>
      </div>

      {/* Blink rate trend. */}
      <BlinkRateChart sessions={meaningful} />

      {/* Session list  */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Session History
        </h2>
        <SessionList sessions={sessions} showAll={showAll} onToggle={() => setShowAll((v) => !v)} />
      </div>
    </div>
  )
}