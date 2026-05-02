import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { StatsPage } from '../../../src/renderer/components/StatsPage'
import { formatSessionTime } from '../../../src/renderer/components/session-stats'
import type { SessionSummary } from '../../../src/shared/ipc-messages'

const mockGetSessionHistory = vi.fn()

/** Returns an ISO string for today at the given hour */
function todayAt(hour: number): string {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

/** Returns an ISO string for N days ago at the given hour */
function daysAgo(n: number, hour = 10): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

// Factory for a SessionSummary with sensible defaults, overridable per test.
const makeSummary = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionStart: todayAt(10),
  sessionEnd: todayAt(10),
  totalBlinks: 50,
  avgBlinksPerMinute: 10,
  remindersTriggered: 2,
  totalDurationSeconds: 300,
  twentyTwentyBreaksTaken: 0,
  longestGapBetweenBlinks: 12.5,
  blinkRateStdDev: 450,
  ...overrides,
})

beforeEach(() => {
  mockGetSessionHistory.mockClear()

  // Minimal blinkBuddy mock.
  window.blinkBuddy = {
    getSessionHistory: mockGetSessionHistory,
  } as unknown as typeof window.blinkBuddy
})

afterEach(() => {
  // @ts-expect-error cleanup
  delete window.blinkBuddy
})

describe('formatSessionTime', () => {
  function at(hour: number, minute: number): string {
    return new Date(2026, 0, 15, hour, minute).toISOString()
  }

  it('formats midnight as 12:00 am', () => {
    expect(formatSessionTime(at(0, 0))).toBe('12:00 am')
  })

  it('formats 00:30 as 12:30 am', () => {
    expect(formatSessionTime(at(0, 30))).toBe('12:30 am')
  })

  it('formats 11:59 as 11:59 am', () => {
    expect(formatSessionTime(at(11, 59))).toBe('11:59 am')
  })

  it('formats noon as 12:00 pm', () => {
    expect(formatSessionTime(at(12, 0))).toBe('12:00 pm')
  })

  it('formats 12:02 as 12:02 pm', () => {
    expect(formatSessionTime(at(12, 2))).toBe('12:02 pm')
  })

  it('formats 13:00 as 1:00 pm', () => {
    expect(formatSessionTime(at(13, 0))).toBe('1:00 pm')
  })

  it('formats 23:45 as 11:45 pm', () => {
    expect(formatSessionTime(at(23, 45))).toBe('11:45 pm')
  })
})

describe('StatsPage', () => {
  it('renders empty state when history is empty', async () => {
    mockGetSessionHistory.mockResolvedValue([])
    render(<StatsPage />)

    await waitFor(() => {
      expect(
        screen.getByText(/No sessions yet/),
      ).toBeDefined()
    })
  })

  it('renders overview cards with session data', async () => {
    mockGetSessionHistory.mockResolvedValue([makeSummary()])
    render(<StatsPage />)

    await waitFor(() => {
      expect(screen.getByText('Overview*')).toBeDefined()
      expect(screen.getByText('10.0 blinks/min')).toBeDefined()
      expect(screen.getByText('5m monitored')).toBeDefined()
      expect(screen.getByText('Total Reminders')).toBeDefined()
      expect(screen.getByText('Healthy Session Rate**')).toBeDefined()
      expect(screen.getByText('0 of 1 sessions')).toBeDefined()
      expect(
        screen.getByText('* Stats and the trend chart only include sessions longer than 2 minutes.'),
      ).toBeDefined()
      expect(
        screen.getByText('** A healthy session averages at least 15 blinks per minute.'),
      ).toBeDefined()
    })
  })

  it('renders session row with correct format', async () => {
    mockGetSessionHistory.mockResolvedValue([makeSummary()])
    render(<StatsPage />)

    await waitFor(() => {
      expect(screen.getByText('Session History')).toBeDefined()
      expect(screen.getByText(/5m 0s/)).toBeDefined()
      expect(screen.getByText(/50 blinks/)).toBeDefined()
      expect(screen.getByText(/· 2 reminders/)).toBeDefined()
      expect(screen.getByText('10.0/min')).toBeDefined()
    })
  })

  it('excludes short sessions from stats but shows in list', async () => {
    const sessions = [
      makeSummary({ totalDurationSeconds: 60, totalBlinks: 10, sessionStart: todayAt(9) }),
      makeSummary({ totalDurationSeconds: 300, totalBlinks: 50, sessionStart: todayAt(10) }),
    ]
    mockGetSessionHistory.mockResolvedValue(sessions)
    render(<StatsPage />)

    await waitFor(() => {
      // Stats card should count only the 300s session
      expect(screen.getByText('Total Sessions')).toBeDefined()
      // Both sessions appear in the list (check for both blink counts)
      expect(screen.getByText(/10 blinks/)).toBeDefined()
      expect(screen.getByText(/50 blinks/)).toBeDefined()
    })
  })

  it('shows N/A for Healthy Session Rate when no meaningful sessions exist', async () => {
    mockGetSessionHistory.mockResolvedValue([
      makeSummary({ totalDurationSeconds: 60 }), // below MIN_SESSION_SECONDS (120)
    ])
    render(<StatsPage />)

    await waitFor(() => {
      expect(screen.getByText('Healthy Session Rate**')).toBeDefined()
      expect(screen.getByText('N/A')).toBeDefined()
      expect(screen.getByText('No meaningful sessions yet')).toBeDefined()
      expect(
        screen.getByText('** A healthy session averages at least 15 blinks per minute.'),
      ).toBeDefined()
    })
  })

  it('shows percentage and "X of Y sessions" subtitle for Healthy Session Rate', async () => {
    mockGetSessionHistory.mockResolvedValue([
      makeSummary({ sessionStart: todayAt(9), avgBlinksPerMinute: 18 }), // healthy
      makeSummary({ sessionStart: todayAt(10), avgBlinksPerMinute: 15 }), // healthy (boundary)
      makeSummary({ sessionStart: todayAt(11), avgBlinksPerMinute: 8 }), // unhealthy
    ])
    render(<StatsPage />)

    await waitFor(() => {
      expect(screen.getByText('67%')).toBeDefined()
      expect(screen.getByText('2 of 3 sessions')).toBeDefined()
    })
  })

  it('shows "Show older sessions" toggle for old sessions', async () => {
    // One session today, one 10 days ago. The 10 day old session falls
    // past the 7-day cutoff and should be hidden until the toggle is clicked.
    const sessions = [
      makeSummary({ sessionStart: daysAgo(10), totalBlinks: 30 }),
      makeSummary({ sessionStart: todayAt(10), totalBlinks: 50 }),
    ]
    mockGetSessionHistory.mockResolvedValue(sessions)
    render(<StatsPage />)

    await waitFor(() => {
      expect(screen.getByText('Show older sessions')).toBeDefined()
      // Older session's blinks not visible yet
      expect(screen.queryByText(/30 blinks/)).toBeNull()
    })

    // Expand: older session becomes visible
    fireEvent.click(screen.getByText('Show older sessions'))
    expect(screen.getByText(/30 blinks/)).toBeDefined()
    expect(screen.getByText('Show less')).toBeDefined()

    // Collapse: back to the original state
    fireEvent.click(screen.getByText('Show less'))
    expect(screen.queryByText(/30 blinks/)).toBeNull()
    expect(screen.getByText('Show older sessions')).toBeDefined()
  })

  it('renders "Today" date group header for today\'s sessions', async () => {
    mockGetSessionHistory.mockResolvedValue([makeSummary()])
    render(<StatsPage />)

    await waitFor(() => {
      expect(screen.getByText('Today')).toBeDefined()
    })
  })
})