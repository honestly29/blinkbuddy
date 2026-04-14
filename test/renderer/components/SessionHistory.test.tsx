import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SessionHistory } from '../../../src/renderer/components/SessionHistory'
import type { SessionSummary } from '../../../src/shared/ipc-messages'

const mockGetSessionHistory = vi.fn()

// Factory with sensible defaults
const makeSummary = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionStart: '2026-03-11T10:00:00.000Z',
  sessionEnd: '2026-03-11T10:05:00.000Z',
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

  // Only mock getSessionHistory 
  window.blinkBuddy = {
    getSessionHistory: mockGetSessionHistory,
  } as unknown as typeof window.blinkBuddy
})

afterEach(() => {
  // @ts-expect-error cleanup
  delete window.blinkBuddy
})

describe('SessionHistory', () => {
  it('renders "No sessions yet" when history is empty', async () => {
    mockGetSessionHistory.mockResolvedValue([])
    render(<SessionHistory />)

    await waitFor(() => {
      expect(screen.getByText('No sessions yet')).toBeDefined()
    })
  })

  it('renders session entries when history has data', async () => {
    mockGetSessionHistory.mockResolvedValue([makeSummary()])
    render(<SessionHistory />)

    await waitFor(() => {
      expect(screen.getByText('Session History')).toBeDefined()
      expect(screen.getByText(/5m 0s/)).toBeDefined()
      expect(screen.getByText('Avg 10.0 blinks/min')).toBeDefined()
      expect(screen.getByText('Total 50 blinks')).toBeDefined()
      expect(screen.getByText('2 reminders')).toBeDefined()
    })
  })

  it('displays longest gap when present', async () => {
    // longestGapBetweenBlinks > 0 triggers the conditional <span>
    mockGetSessionHistory.mockResolvedValue([makeSummary({ longestGapBetweenBlinks: 8.3 })])
    render(<SessionHistory />)

    await waitFor(() => {
      expect(screen.getByText('Longest gap 8.3s')).toBeDefined()
    })
  })

  it('displays twenty-twenty breaks when taken', async () => {
    // twentyTwentyBreaksTaken > 0 triggers the conditional <span>
    mockGetSessionHistory.mockResolvedValue([makeSummary({ twentyTwentyBreaksTaken: 3 })])
    render(<SessionHistory />)

    await waitFor(() => {
      expect(screen.getByText('3 breaks')).toBeDefined()
    })
  })

  it('renders multiple sessions in reverse chronological order', async () => {
    const sessions = [
      makeSummary({ sessionStart: '2026-03-10T10:00:00.000Z', totalBlinks: 30 }),
      makeSummary({ sessionStart: '2026-03-11T10:00:00.000Z', totalBlinks: 50 }),
    ]
    mockGetSessionHistory.mockResolvedValue(sessions)
    render(<SessionHistory />)

    await waitFor(() => {
      expect(screen.getByText('Total 50 blinks')).toBeDefined()
      expect(screen.getByText('Total 30 blinks')).toBeDefined()
    })

    // The most recent session (50 blinks) should appear first in the DOM
    const items = screen.getAllByText(/Total \d+ blinks/)
    expect(items[0].textContent).toBe('Total 50 blinks')
    expect(items[1].textContent).toBe('Total 30 blinks')
  })
})