import type { SessionSummary } from '../shared/ipc-messages'

// Column order matters - the output CSV and every test match this order exactly.
const HEADERS = [
  'Session Start (UTC)',
  'Session End (UTC)',
  'Duration (seconds)',
  'Total Blinks',
  'Average Blinks Per Minute',
  'Reminders Triggered',
  '20-20-20 Breaks Taken',
  'Longest Gap Between Blinks (seconds)',
  'Inter-Blink Interval Std Dev (seconds)',
] as const

// RFC 4180 mandates \r\n between records.
const LINE_ENDING = '\r\n'

/**
 * Wrap a cell in quotes and double any embedded quotes, but only when
 * the content actually contains a CSV-special character. Keeps plain
 * numbers and timestamps unquoted for a tidier-looking file.
 */
function escapeCell(value: string | number): string {
  const str = String(value)
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Round to at most 2 decimals */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Turn an ISO 8601 timestamp into a "YYYY-MM-DD HH:MM:SS" string. */
function formatUtcTimestamp(iso: string): string {
  return iso.slice(0, 19).replace('T', ' ')
}

function sessionToRow(session: SessionSummary): string {
  return [
    formatUtcTimestamp(session.sessionStart),
    formatUtcTimestamp(session.sessionEnd),
    round2(session.totalDurationSeconds),
    round2(session.totalBlinks),
    round2(session.avgBlinksPerMinute),
    round2(session.remindersTriggered),
    round2(session.twentyTwentyBreaksTaken),
    round2(session.longestGapBetweenBlinks),
    // Convert ms -> s before rounding.
    round2(session.blinkRateStdDev / 1000),
  ]
    .map(escapeCell)
    .join(',')
}

/**
 * Serialise an array of session summaries to a complete CSV string */
export function buildSessionsCsv(sessions: SessionSummary[]): string {
  const lines = [HEADERS.join(','), ...sessions.map(sessionToRow)]
  return lines.join(LINE_ENDING) + LINE_ENDING
}

/**
 * Build a default filename for the save dialog, dated today in local time */
export function defaultExportFilename(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `blinkbuddy-sessions-${year}-${month}-${day}.csv`
}