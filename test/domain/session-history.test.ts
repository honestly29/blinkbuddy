import { describe, it, expect } from 'vitest'
import {
  HEALTHY_BLINK_RATE,
  MIN_SESSION_SECONDS,
  computeOverviewStats,
  isHealthySession,
} from '../../src/domain/session-history'
import type { SessionSummary } from '../../src/domain/types'

// Factory for a SessionSummary with sensible defaults, overridable per test.
const makeSummary = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionStart: '2026-05-01T10:00:00.000Z',
  sessionEnd: '2026-05-01T10:05:00.000Z',
  totalBlinks: 50,
  avgBlinksPerMinute: 10,
  remindersTriggered: 2,
  totalDurationSeconds: 300,
  twentyTwentyBreaksTaken: 0,
  longestGapBetweenBlinks: 12.5,
  blinkRateStdDev: 450,
  ...overrides,
})

describe('Constants', () => {
  it('MIN_SESSION_SECONDS is 120', () => {
    expect(MIN_SESSION_SECONDS).toBe(120)
  })

  it('HEALTHY_BLINK_RATE is 15', () => {
    expect(HEALTHY_BLINK_RATE).toBe(15)
  })
})

describe('isHealthySession', () => {
  it('rate just below threshold is unhealthy', () => {
    expect(isHealthySession(makeSummary({ avgBlinksPerMinute: 14.99 }))).toBe(false)
  })

  it('rate exactly at threshold is healthy (boundary inclusive)', () => {
    expect(isHealthySession(makeSummary({ avgBlinksPerMinute: 15 }))).toBe(true)
  })

  it('rate just above threshold is healthy', () => {
    expect(isHealthySession(makeSummary({ avgBlinksPerMinute: 15.01 }))).toBe(true)
  })
})

describe('computeOverviewStats', () => {
  it('returns zero-valued stats with healthySessionPercent: null for empty input', () => {
    const stats = computeOverviewStats([])
    expect(stats.totalSessions).toBe(0)
    expect(stats.totalTimeSeconds).toBe(0)
    expect(stats.totalReminders).toBe(0)
    expect(stats.avgRemindersPerSession).toBe(0)
    expect(stats.avgBlinkRate).toBe(0)
    expect(stats.healthySessionCount).toBe(0)
    // null (not 0) so the UI can render "N/A" rather than "0%"
    expect(stats.healthySessionPercent).toBeNull()
  })

  it('counts sessions, durations, and reminders', () => {
    const sessions = [
      makeSummary({ totalDurationSeconds: 300, remindersTriggered: 2 }),
      makeSummary({ totalDurationSeconds: 600, remindersTriggered: 4 }),
    ]
    const stats = computeOverviewStats(sessions)
    expect(stats.totalSessions).toBe(2)
    expect(stats.totalTimeSeconds).toBe(900)
    expect(stats.totalReminders).toBe(6)
    expect(stats.avgRemindersPerSession).toBe(3)
  })

  it('weighted blink rate: 5min at 20bpm + 30min at 10bpm averages closer to 10 than 15', () => {
    // 300s * 20 = 6000; 1800s * 10 = 18000. weightedSum 24000 / total 2100 = 11.4286
    const sessions = [
      makeSummary({ totalDurationSeconds: 300, avgBlinksPerMinute: 20 }),
      makeSummary({ totalDurationSeconds: 1800, avgBlinksPerMinute: 10 }),
    ]
    const stats = computeOverviewStats(sessions)
    expect(stats.avgBlinkRate).toBeCloseTo(11.4286, 4)
    expect(stats.avgBlinkRate).toBeLessThan(15)
    expect(stats.avgBlinkRate).toBeGreaterThan(10)
  })

  it('classifies a 15 bpm session as healthy at the boundary', () => {
    const stats = computeOverviewStats([
      makeSummary({ avgBlinksPerMinute: 15 }),
    ])
    expect(stats.healthySessionCount).toBe(1)
    expect(stats.healthySessionPercent).toBe(100)
  })

  it('healthy fraction matches the StatsPage 67% case (18, 15, 8 -> 2 of 3)', () => {
    const sessions = [
      makeSummary({ avgBlinksPerMinute: 18 }), // healthy
      makeSummary({ avgBlinksPerMinute: 15 }), // healthy (boundary)
      makeSummary({ avgBlinksPerMinute: 8 }),  // unhealthy
    ]
    const stats = computeOverviewStats(sessions)
    expect(stats.totalSessions).toBe(3)
    expect(stats.healthySessionCount).toBe(2)
    expect(stats.healthySessionPercent).toBeCloseTo((2 / 3) * 100, 5)
  })
})
