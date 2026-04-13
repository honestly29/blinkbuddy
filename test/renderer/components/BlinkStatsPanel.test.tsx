import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BlinkStatsPanel } from '../../../src/renderer/components/BlinkStatsPanel'

describe('BlinkStatsPanel', () => {
  it('displays blinks per minute', () => {
    render(<BlinkStatsPanel blinksPerMinute={15.3} totalBlinks={42} sessionDurationMs={60000} />)
    expect(screen.getByText('15.3')).toBeDefined()
    expect(screen.getByText('Blinks/min')).toBeDefined()
  })

  it('displays total blinks', () => {
    render(<BlinkStatsPanel blinksPerMinute={0} totalBlinks={42} sessionDurationMs={0} />)
    expect(screen.getByText('42')).toBeDefined()
    expect(screen.getByText('Total Blinks')).toBeDefined()
  })

  // --- Duration formatting tests: verify the formatDuration() helper ---
  it('formats duration as MM:SS', () => {
    // 125000ms = 2 minutes and 5 seconds -> "02:05"
    render(<BlinkStatsPanel blinksPerMinute={0} totalBlinks={0} sessionDurationMs={125000} />)
    expect(screen.getByText('02:05')).toBeDefined()
  })

  it('formats duration as H:MM:SS when >= 1 hour', () => {
    // 3661000ms = 1 hour, 1 minute, 1 second -> "1:01:01" (hours not zero-padded)
    render(<BlinkStatsPanel blinksPerMinute={0} totalBlinks={0} sessionDurationMs={3661000} />)
    expect(screen.getByText('1:01:01')).toBeDefined()
  })

  it('shows 00:00 for zero duration', () => {
    // Edge case: session just started or hasn't started yet
    render(<BlinkStatsPanel blinksPerMinute={0} totalBlinks={0} sessionDurationMs={0} />)
    expect(screen.getByText('00:00')).toBeDefined()
  })
})