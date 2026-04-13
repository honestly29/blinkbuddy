import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StartStopControls } from '../../../src/renderer/components/StartStopControls'

describe('StartStopControls', () => {
  // --- Button label tests ---

  it('shows "Start Monitoring" when not running', () => {
    render(<StartStopControls running={false} onStart={vi.fn()} onStop={vi.fn()} />)
    expect(screen.getByText('Start Monitoring')).toBeDefined()
  })

  it('shows "Stop Monitoring" when running', () => {
    render(<StartStopControls running={true} onStart={vi.fn()} onStop={vi.fn()} />)
    expect(screen.getByText('Stop Monitoring')).toBeDefined()
  })

  // --- Click handler tests ---
  it('calls onStart when clicked while stopped', async () => {
    const onStart = vi.fn().mockResolvedValue(undefined)
    const onStop = vi.fn()
    render(<StartStopControls running={false} onStart={onStart} onStop={onStop} />)

    fireEvent.click(screen.getByText('Start Monitoring'))

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledOnce()
    })
    expect(onStop).not.toHaveBeenCalled()
  })

  it('calls onStop when clicked while running', async () => {
    const onStart = vi.fn()
    const onStop = vi.fn().mockResolvedValue(undefined)
    render(<StartStopControls running={true} onStart={onStart} onStop={onStop} />)

    fireEvent.click(screen.getByText('Stop Monitoring'))

    await waitFor(() => {
      expect(onStop).toHaveBeenCalledOnce()
    })
    expect(onStart).not.toHaveBeenCalled()
  })

  // --- Styling tests ---
  it('applies green styling when not running', () => {
    render(<StartStopControls running={false} onStart={vi.fn()} onStop={vi.fn()} />)
    const button = screen.getByRole('button')
    expect(button.className).toContain('bg-green-600')
  })

  it('applies red styling when running', () => {
    render(<StartStopControls running={true} onStart={vi.fn()} onStop={vi.fn()} />)
    const button = screen.getByRole('button')
    expect(button.className).toContain('bg-red-600')
  })
})