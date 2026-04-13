import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReminderOverlay } from '../../../src/renderer/components/ReminderOverlay'

describe('ReminderOverlay', () => {
  it('renders the reminder message', () => {
    render(<ReminderOverlay visible={true} />)
    expect(screen.getByText('Remember to blink!')).toBeDefined()
  })

  it('applies visible classes when visible', () => {
    render(<ReminderOverlay visible={true} />)
    const overlay = screen.getByRole('alert')
    expect(overlay.className).toContain('translate-y-0')  // Slid into view
    expect(overlay.className).toContain('opacity-100')    // Fully opaqu
    expect(overlay.className).not.toContain('pointer-events-none') // Clickable
  })

  it('applies hidden classes when not visible', () => {
    render(<ReminderOverlay visible={false} />)
    const overlay = screen.getByRole('alert')
    expect(overlay.className).toContain('translate-y-full')  // Pushed off-screen below
    expect(overlay.className).toContain('opacity-0')  // Fully transparent
    expect(overlay.className).toContain('pointer-events-none')  // Won't capture clicks
  })
})