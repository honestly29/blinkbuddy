import type { SessionSummary } from '../shared/ipc-messages'

// Column order matters - the output CSV matches this order exactly.
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


// CSV records are separated by \r\n (carriage return + line feed),
// per RFC 4180.
const LINE_ENDING = '\r\n'

/**
 * Wrap a cell in quotes and double any embedded quotes, but only when
 * the content contains a CSV-special character. Keeps plain
 * numbers and timestamps unchanged.
 */
function escapeCell(value: string | number): string {
  const str = String(value)
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Round a number to at most 2 decimal places. Trailing zeros are dropped. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Turn an ISO 8601 UTC timestamp into a "YYYY-MM-DD HH:MM:SS" string for
 * the CSV. Assumes the input is in UTC.
 */
function formatUtcTimestamp(iso: string): string {
  return iso.slice(0, 19).replace('T', ' ')
}

/**
 * Build one CSV row from a session summary. The order of values here must
 * match HEADERS above, since CSV has no field names per row.
 */
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
    // blinkRateStdDev is the only field stored in milliseconds; everything
    // else in SessionSummary is already in the unit used by the CSV.
    round2(session.blinkRateStdDev / 1000),
  ]
    .map(escapeCell)
    .join(',')
}

/**
 * Serialise an array of session summaries to a complete CSV string,
 * including the header row and a trailing CRLF after the last record.
 */
export function buildSessionsCsv(sessions: SessionSummary[]): string {
  const lines = [HEADERS.join(','), ...sessions.map(sessionToRow)]
  return lines.join(LINE_ENDING) + LINE_ENDING
}

/**
 * Build a default filename for the save dialog, dated today in local time.
 * The `now` parameter exists so tests can pass a fixed date.
 */
export function defaultExportFilename(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `blinkbuddy-sessions-${year}-${month}-${day}.csv`
}