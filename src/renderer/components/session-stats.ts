import type { SessionSummary } from '../../shared/ipc-messages'

// Sessions shorter than this are excluded from overview stats and the
// trend chart. 
// They still show up in the session list, but short session would skew
// the metrics without telling us anything useful.
export const MIN_SESSION_SECONDS = 120

// A session counts as "healthy" if its average blink rate meets or
// exceeds this threshold. 15 blinks per minute is roughly the lower end
// of the normal blink rate. 
// Used by the chart (to colour bars), the session list (for the session badge),
// and the overview "Healthy Session Rate" stat.
export const HEALTHY_BLINK_RATE = 15 

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Format a number of seconds as "Xm Ys" or "Ys".
 *
 * Used for individual session durations in the list, where we want to
 * see exact minutes and seconds. Examples:
 *   formatDuration(45)  -> "45s"
 *   formatDuration(125) -> "2m 5s"
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

/**
 * Format a number of seconds as "Xh Ym" or "Ym".
 *
 * Used for cumulative totals (e.g. "8h 23m monitored") where seconds
 * are noise. Examples:
 *   formatTotalTime(180)  -> "3m"
 *   formatTotalTime(7800) -> "2h 10m"
 */
export function formatTotalTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/**
 * Format a date string as a 12-hour clock time ("9:05 am", "12:30 pm").
 *
 * Midnight (0) and noon (12) display as "12:00 am" and "12:00 pm"
 * respectively, not "0:00".
 */
export function formatSessionTime(isoString: string): string {
  const d = new Date(isoString)
  const hours24 = d.getHours()

  let hour12: number
  if (hours24 === 0 || hours24 === 12) {
    hour12 = 12
  } else if (hours24 > 12) {
    hour12 = hours24 - 12
  } else {
    hour12 = hours24
  }

  const minutes = String(d.getMinutes()).padStart(2, '0')
  const suffix = hours24 < 12 ? 'am' : 'pm'
  return `${hour12}:${minutes} ${suffix}`
}


/**
 * Format a date string as a day-group header for the session list.
 *
 * Returns "Today" or "Yesterday" for recent days, or a date like
 * "15 January" for anything older. Comparison is on calendar days, not
 * raw timestamps, so a session at 11:50pm and another at 1:00am the
 * next morning correctly land in separate groups.
 */
export function formatDayHeader(isoString: string): string {
  const sessionDate = new Date(isoString)
  const now = new Date()

  // Build new Date objects for midnight on each day. This removes the
  // time of day so we can compare just the calendar dates.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate())

  if (sessionDay.getTime() === today.getTime()) return 'Today'
  if (sessionDay.getTime() === yesterday.getTime()) return 'Yesterday'

  const day = sessionDate.getDate()
  const month = sessionDate.toLocaleString(undefined, { month: 'long' })
  return `${day} ${month}`
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/** A run of sessions that all happened on the same day. */
export interface SessionGroup {
  header: string
  sessions: SessionSummary[]
}


/**
 * Group sessions by the day they started, newest day first.
 *
 * The session list arrives oldest first, so we reverse a copy before
 * iterating. We then build groups by tracking the current day's key
 * (YYYY-MM-DD) and starting a new group whenever the key changes. The
 * result is newest-first: groups are ordered with the most recent
 * day first, and each group's sessions are also ordered with the
 * most recent first.
 *
 * The input array is not mutated. The `[...sessions]` spread creates
 * a copy before `.reverse()` is called, so the input array is safe.
 */
export function groupSessionsByDay(sessions: SessionSummary[]): SessionGroup[] {
  const reversed = [...sessions].reverse()
  const groups: SessionGroup[] = []
  let currentKey = ''

  for (const s of reversed) {
    const d = new Date(s.sessionStart)
    // YYYY-MM-DD key in local time. Single-digit months and days get a
    // leading zero ("05" not "5") so all keys have the same width and
    // sort correctly as strings
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (key !== currentKey) {
      currentKey = key
      groups.push({ header: formatDayHeader(s.sessionStart), sessions: [] })
    }
    groups[groups.length - 1].sessions.push(s)
  }

  return groups
}

/**
 * Headline numbers shown in the overview cards at the top of the Stats page.
 *
 * `healthySessionPercent` is null when there are no sessions to measure
 * (rather than 0), so the UI can display "N/A" instead of "0%". A 0% would
 * imply we measured and found zero healthy sessions; null means we have no
 * data.
 */
export interface OverviewStats {
  avgBlinkRate: number
  totalSessions: number
  totalTimeSeconds: number
  totalReminders: number
  avgRemindersPerSession: number
  healthySessionPercent: number | null // null = no meaningful sessions to measure
  healthySessionCount: number
}

/** A single bar in the trend chart: one day's data. */
export interface DailyRate {
  date: string
  label: string
  rate: number
  totalDuration: number
}

/**
 * Aggregate sessions into per-day blink-rate bars for the trend chart.
 *
 * The blink rate for a day is the time-weighted average across that
 * day's sessions, not a plain average. A 5-minute session at 20 bpm and
 * a 30-minute session at 10 bpm should not weight equally. The longer
 * session is more representative, so we weight by duration.
 *
 * The math is:
 *   weightedSum = sum over sessions of (rate * duration)
 *   weightedAvg = weightedSum / totalDuration
 *
 * Returns the most recent 8 days that had any sessions. Days without
 * sessions are skipped entirely (not shown as zero bars).
 */
export function computeDailyRates(sessions: SessionSummary[]): DailyRate[] {
  // Group sessions by day, building up two running totals per day: the
  // weighted-sum numerator and the total-duration denominator. We
  // divide them at the end to get each day's average blink rate.
  const byDay = new Map<string, { weightedSum: number; totalDuration: number }>()

  for (const s of sessions) {
    const d = new Date(s.sessionStart)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    
    // Get this day's running totals, or start fresh ones if this is
    // the first session for the day.
    let entry = byDay.get(key)
    if (entry === undefined) {
        entry = { weightedSum: 0, totalDuration: 0 }
        byDay.set(key, entry)
    }

    entry.weightedSum += s.avgBlinksPerMinute * s.totalDurationSeconds
    entry.totalDuration += s.totalDurationSeconds
  }

  // Convert each entry into a DailyRate with a display label (e.g "2 May"),
  // then sort chronologically and keep the most recent 8 days.
  const days = [...byDay.entries()]
    .map(([key, { weightedSum, totalDuration }]) => {
      // Append "T00:00:00" so the date is parsed as local midnight rather
      // than UTC midnight, which would land on the wrong calendar
      // day in some timezones.
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
    .sort((a, b) => a.date.localeCompare(b.date))

  // slice(-8) keeps the last 8 elements (the 8 most recent days).
  return days.slice(-8)
}


/**
 * Compute the headline numbers for the overview cards.
 *
 * The blink-rate average is time-weighted across all sessions so a long
 * session contributes more than a short one.
 *
 * The "healthy session" stat counts each session equally, regardless of its
 * duration. It returns both the percentage and the raw count, so the
 * card can show "67%" with "2 of 3 sessions" underneath.
 */
export function computeOverviewStats(sessions: SessionSummary[]): OverviewStats {
  const totalSessions = sessions.length

  // .reduce sums over the array: starting from 0, add each session's
  // duration (or reminder count) to a running total.
  const totalTimeSeconds = sessions.reduce((sum, s) => sum + s.totalDurationSeconds, 0)
  const totalReminders = sessions.reduce((sum, s) => sum + s.remindersTriggered, 0)
  
  const healthySessionCount = sessions.filter(
    (s) => s.avgBlinksPerMinute >= HEALTHY_BLINK_RATE,
  ).length

  // Weighted average blink rate (see computeDailyRates above for
  // the same pattern applied per day.)
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
    // null (not 0) when there are no sessions, so the UI can show "N/A".
    healthySessionPercent:
      totalSessions > 0 ? (healthySessionCount / totalSessions) * 100 : null,
    healthySessionCount,
  }
}