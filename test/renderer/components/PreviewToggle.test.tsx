import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PreviewToggle } from '../../../src/renderer/components/PreviewToggle'

describe('PreviewToggle', () => {
  it('renders two buttons', () => {
    render(<PreviewToggle enabled={false} onChange={vi.fn()} />)
    // Both options should always be visible
    expect(screen.getByText('Disabled')).toBeDefined()
    expect(screen.getByText('Enabled')).toBeDefined()
  })

  // -- Active state styling tests --
  // The active button gets bg-blue-600 (blue), the inactive gets bg-gray-700 (grey
  
  it('highlights disabled button when preview is off', () => {
    render(<PreviewToggle enabled={false} onChange={vi.fn()} />)
    expect(screen.getByText('Disabled').className).toContain('bg-blue-600')  // Active
    expect(screen.getByText('Enabled').className).toContain('bg-gray-700')  // Inactive
  })

  it('highlights enabled button when preview is on', () => {
    render(<PreviewToggle enabled={true} onChange={vi.fn()} />)
    expect(screen.getByText('Enabled').className).toContain('bg-blue-600')  // Active
    expect(screen.getByText('Disabled').className).toContain('bg-gray-700')  // Inactive
  })


  // -- Click handler tests --

  it('calls onChange(true) when Enabled is clicked', () => {
    const onChange = vi.fn()
    render(<PreviewToggle enabled={false} onChange={onChange} />)
    fireEvent.click(screen.getByText('Enabled'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onChange(false) when Disabled is clicked', () => {
    const onChange = vi.fn()
    render(<PreviewToggle enabled={true} onChange={onChange} />)
    fireEvent.click(screen.getByText('Disabled'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('renders the label', () => {
    render(<PreviewToggle enabled={false} onChange={vi.fn()} />)
    expect(screen.getByText('Camera preview')).toBeDefined()
  })
})