/**
 * Post-session summary rules and aggregation.
 *
 * Operates on completed `SessionSummary` records (the summaries
 * emitted by SessionManager.getSessionSummary() and persisted by
 * SessionLogger). Lives in the domain layer because the rules here 
 * belong to the system's definition of a session, independent of how the 
 * renderer displays them.
 */

import type { SessionSummary } from './types'

// Sessions shorter than this are excluded from overview stats and the
// trend chart. They still appear in the session list, but a short
// session would skew the metrics without telling us anything useful.
export const MIN_SESSION_SECONDS = 120

// A session counts as "healthy" if its average blink rate meets or
// exceeds this threshold. 15 blinks per minute is roughly the lower end
// of the normal blink rate. Used by the chart (to colour bars), the
// session list (for the session badge), and the overview "Healthy
// Session Rate" stat.
export const HEALTHY_BLINK_RATE = 15

/**
 * Returns true when a session's average blink rate meets the healthy
 * threshold. Inclusive at the boundary: exactly HEALTHY_BLINK_RATE
 * counts as healthy.
 */
export function isHealthySession(summary: SessionSummary): boolean {
  return summary.avgBlinksPerMinute >= HEALTHY_BLINK_RATE
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

  const healthySessionCount = sessions.filter(isHealthySession).length

  // Weighted-average blink rate: sum(rate * duration) / sum(duration).
  // A long session contributes more than a short one, so the average
  // reflects what the user actually experienced over time.
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
