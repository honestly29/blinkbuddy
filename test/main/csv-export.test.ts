import { describe, it, expect } from 'vitest'
import { buildSessionsCsv, defaultExportFilename } from '../../src/main/csv-export'
import type { SessionSummary } from '../../src/shared/ipc-messages'

// Factory with realistic defaults plus an overrides param. 
const makeSummary = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionStart: '2026-03-11T10:00:00.000Z',
  sessionEnd: '2026-03-11T10:05:00.000Z',
  totalBlinks: 50,
  avgBlinksPerMinute: 10,
  remindersTriggered: 2,
  totalDurationSeconds: 300,
  twentyTwentyBreaksTaken: 0,
  longestGapBetweenBlinks: 12.5,
  blinkRateStdDev: 1750,
  ...overrides,
})

// Header string is defined once here rather than repeated in every test.
const HEADER =
  'Session Start (UTC),Session End (UTC),Duration (seconds),Total Blinks,' +
  'Average Blinks Per Minute,Reminders Triggered,20-20-20 Breaks Taken,' +
  'Longest Gap Between Blinks (seconds),Inter-Blink Interval Std Dev (seconds)'

describe('buildSessionsCsv', () => {
  it('returns a header-only CSV when no sessions exist', () => {
    expect(buildSessionsCsv([])).toBe(HEADER + '\r\n')
  })

  it('produces one data row per session in the expected column order, with stddev converted to seconds', () => {
    const csv = buildSessionsCsv([makeSummary()])
    const lines = csv.split('\r\n')

    expect(lines[0]).toBe(HEADER)
    // Timestamps in formatted UTC form; stddev 1750ms rendered as 1.75s.
    expect(lines[1]).toBe(
      '2026-03-11 10:00:00,2026-03-11 10:05:00,300,50,10,2,0,12.5,1.75',
    )
    // Trailing CRLF produces an empty string as the third split element.
    expect(lines[2]).toBe('')
    expect(lines).toHaveLength(3)
  })

  it('rounds numeric values to at most two decimal places', () => {
    const csv = buildSessionsCsv([
      makeSummary({
        avgBlinksPerMinute: 10.126,
        longestGapBetweenBlinks: 12.555,
        totalDurationSeconds: 299.999,
        blinkRateStdDev: 1234.567,
      }),
    ])
    const dataRow = csv.split('\r\n')[1]
    const cells = dataRow.split(',')

    expect(cells[2]).toBe('300')
    expect(cells[4]).toBe('10.13')
    expect(cells[7]).toBe('12.56')
    expect(cells[8]).toBe('1.23')
  })

  it('uses CRLF line endings between rows', () => {
    const csv = buildSessionsCsv([makeSummary(), makeSummary({ totalBlinks: 77 })])
    // Two sessions + header = 3 lines, each ended with \r\n = 3 CRLFs.
    expect(csv.match(/\r\n/g)?.length).toBe(3)
    // Guard against accidentally using \n\r (LFCR) 
    expect(csv.includes('\n\r')).toBe(false)
  })

  it('quotes and escapes values containing commas, quotes, or newlines', () => {
    // These aren't realistic SessionSummary values, they're chosen purely to test the escape function. 
    const csv = buildSessionsCsv([
      makeSummary({
        sessionStart: 'has,comma',
        sessionEnd: 'has"quote',
      }),
    ])
    const dataRow = csv.split('\r\n')[1]

    expect(dataRow.startsWith('"has,comma","has""quote",')).toBe(true)
  })

  it('does not quote plain numeric or formatted-timestamp values', () => {
    const csv = buildSessionsCsv([makeSummary()])
    expect(csv.includes('"2026-03-11 10:00:00"')).toBe(false)
    expect(csv.includes('"50"')).toBe(false)
  })

  it('formats sessionStart/sessionEnd as UTC YYYY-MM-DD HH:MM:SS with no T or milliseconds', () => {
    const csv = buildSessionsCsv([
      makeSummary({
        sessionStart: '2026-03-11T23:59:01.456Z',
        sessionEnd: '2026-03-12T00:04:07.890Z',
      }),
    ])
    const cells = csv.split('\r\n')[1].split(',')

    expect(cells[0]).toBe('2026-03-11 23:59:01')
    expect(cells[1]).toBe('2026-03-12 00:04:07')
    expect(cells[0]).not.toMatch(/T|Z|\./)
    expect(cells[1]).not.toMatch(/T|Z|\./)
  })
})

describe('defaultExportFilename', () => {
  it('formats the date as YYYY-MM-DD with zero-padding', () => {
    // new Date(2026, 3, 7, 10, 30) = 7 April 2026 (month is 0-indexed).
    const filename = defaultExportFilename(new Date(2026, 3, 7, 10, 30))
    expect(filename).toBe('blinkbuddy-sessions-2026-04-07.csv')
  })

  it('handles two-digit months and days without extra padding', () => {
    const filename = defaultExportFilename(new Date(2026, 10, 23, 9, 0))
    expect(filename).toBe('blinkbuddy-sessions-2026-11-23.csv')
  })
})