import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CameraSelector } from '../../../src/renderer/components/CameraSelector'

// Sample camera data for tests that need a populated dropdown
const cameras = [
  { index: 0, name: 'FaceTime HD Camera' },
  { index: 1, name: 'USB Camera' },
]

describe('CameraSelector', () => {
  it('renders camera options from cameras prop', () => {
    render(
      <CameraSelector
        cameras={cameras}
        selectedIndex={0}
        disabled={false}
        loading={false}
        onChange={vi.fn()}
      />,
    )
    // Both camera names should appear as <option> elements
    expect(screen.getByText('FaceTime HD Camera')).toBeDefined()
    expect(screen.getByText('USB Camera')).toBeDefined()
  })

  it('shows loading state when loading and no cameras', () => {
    // Simulates the brief period on mount while Python enumerates cameras
    render(
      <CameraSelector
        cameras={[]}
        selectedIndex={0}
        disabled={false}
        loading={true}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Loading cameras...')).toBeDefined()
  })

  it('shows default camera when not loading and no cameras', () => {
    // Fallback state: Python isn't running or returned no cameras
    render(
      <CameraSelector
        cameras={[]}
        selectedIndex={0}
        disabled={false}
        loading={false}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Default camera')).toBeDefined()
  })

  it('calls onChange with selected camera index', () => {
    const onChange = vi.fn()
    render(
      <CameraSelector
        cameras={cameras}
        selectedIndex={0}
        disabled={false}
        loading={false}
        onChange={onChange}
      />,
    )
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '1' } })
    expect(onChange).toHaveBeenCalledWith(1)  // Expects a number, not a string
  })

  it('is disabled when disabled prop is true', () => {
    render(
      <CameraSelector
        cameras={cameras}
        selectedIndex={0}
        disabled={true}
        loading={false}
        onChange={vi.fn()}
      />,
    )
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.disabled).toBe(true)
  })

  it('renders the label', () => {
    render(
      <CameraSelector
        cameras={[]}
        selectedIndex={0}
        disabled={false}
        loading={false}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Camera')).toBeDefined()
  })
})