import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TwentyTwentyOverlay } from '../../../src/renderer/components/TwentyTwentyOverlay'

describe('TwentyTwentyOverlay', () => {
  // -- Visibility tests: verify the overlay only appears during break_active --

  it('is visible when phase is break_active', () => {
    render(<TwentyTwentyOverlay phase="break_active" breakTimeRemainingMs={15000} />)
    const overlay = screen.getByRole('dialog')
    expect(overlay.className).toContain('opacity-100')  // Visible
    expect(overlay.className).not.toContain('pointer-events-none')  // Blocks clicks (intentional)
  })

  it('is hidden when phase is idle', () => {
    // 'idle' = timer not started (before session or after 20-20-20 disabled)
    render(<TwentyTwentyOverlay phase="idle" breakTimeRemainingMs={0} />)
    const overlay = screen.getByRole('dialog')
    expect(overlay.className).toContain('opacity-0')  // Invisible
    expect(overlay.className).toContain('pointer-events-none')  // Passes clicks through
  })

  it('is hidden when phase is waiting', () => {
    // 'waiting' = counting the 20 minutes until the next break
    render(<TwentyTwentyOverlay phase="waiting" breakTimeRemainingMs={0} />)
    const overlay = screen.getByRole('dialog')
    expect(overlay.className).toContain('opacity-0')
    expect(overlay.className).toContain('pointer-events-none')
  })

  // -- Content tests --

  it('displays the break message', () => {
    render(<TwentyTwentyOverlay phase="break_active" breakTimeRemainingMs={20000} />)
    expect(screen.getByText('Look at something 20 feet away')).toBeDefined()
    expect(screen.getByText('20-20-20 Break')).toBeDefined()
  })

  // -- Countdown rounding tests: verify Math.ceil behaviour --

  it('shows countdown in seconds rounded up', () => {
    // 15200ms / 1000 = 15.2 -> Math.ceil = 16
    render(<TwentyTwentyOverlay phase="break_active" breakTimeRemainingMs={15200} />)
    expect(screen.getByText('16s')).toBeDefined()
  })

  it('shows 1s when less than 1 second remains', () => {
    // 500ms / 1000 = 0.5 -> Math.ceil = 1
    render(<TwentyTwentyOverlay phase="break_active" breakTimeRemainingMs={500} />)
    expect(screen.getByText('1s')).toBeDefined()
  })

  it('shows 0s when exactly 0ms remains', () => {
    // Edge case: 0 / 1000 = 0 -> Math.ceil = 0
    render(<TwentyTwentyOverlay phase="break_active" breakTimeRemainingMs={0} />)
    expect(screen.getByText('0s')).toBeDefined()
  })

  it('shows 20s at the start of a break', () => {
    // Full break duration: 20000ms / 1000 = 20 -> Math.ceil = 20
    render(<TwentyTwentyOverlay phase="break_active" breakTimeRemainingMs={20000} />)
    expect(screen.getByText('20s')).toBeDefined()
  })
})