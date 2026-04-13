import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BlinkWindowInput } from '../../../src/renderer/components/BlinkWindowInput'

describe('BlinkWindowInput', () => {
  it('renders with the given value', () => {
    render(<BlinkWindowInput value={20} disabled={false} onChange={vi.fn()} />)
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    expect(input.value).toBe('20')
  })

  it('calls onChange with new value', () => {
    const onChange = vi.fn()
    render(<BlinkWindowInput value={20} disabled={false} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')
    // simulates the user typing a new value
    fireEvent.change(input, { target: { value: '30' } })
    // onChange should receive a number (30), not a string ('30')
    expect(onChange).toHaveBeenCalledWith(30)
  })

  it('is disabled when disabled prop is true', () => {
    render(<BlinkWindowInput value={20} disabled={true} onChange={vi.fn()} />)
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  // -- Clamp-on-blur tests: verify range enforcement when the input loses focus --
  it('clamps value to minimum on blur', () => {
    const onChange = vi.fn()
    // Value 2 is below the minimum of 5
    render(<BlinkWindowInput value={2} disabled={false} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')
    fireEvent.blur(input)  // Simulate clicking away from the input
    expect(onChange).toHaveBeenCalledWith(5)  // Should clamp up to minimum
  })

  it('clamps value to maximum on blur', () => {
    const onChange = vi.fn()
    // Value 500 is above the maximum of 300
    render(<BlinkWindowInput value={500} disabled={false} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(300)  // Should clamp down to maximum
  })

  it('does not call onChange on blur if value is in range', () => {
    const onChange = vi.fn()
    // Value 20 is within [5, 300], so no correction needed
    render(<BlinkWindowInput value={20} disabled={false} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()  // No unnecessary state update
  })

  it('renders the label', () => {
    render(<BlinkWindowInput value={20} disabled={false} onChange={vi.fn()} />)
    expect(screen.getByText('Blink window (seconds)')).toBeDefined()
  })
})