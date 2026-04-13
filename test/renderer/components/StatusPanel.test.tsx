import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPanel } from '../../../src/renderer/components/StatusPanel'

describe('StatusPanel', () => {
  // --- Text content tests: verify the correct label appears for each state ---

  it('shows "Stopped" when not running', () => {
    render(<StatusPanel running={false} faceDetected={false} />)
    expect(screen.getByText('Stopped')).toBeDefined()
  })

  it('shows "Face Detected" when running and face detected', () => {
    render(<StatusPanel running={true} faceDetected={true} />)
    expect(screen.getByText('Face Detected')).toBeDefined()
  })

  it('shows "No Face Detected" when running but no face', () => {
    render(<StatusPanel running={true} faceDetected={false} />)
    expect(screen.getByText('No Face Detected')).toBeDefined()
  })

  // --- Styling tests: verify correct Tailwind background classes ---
  it('applies green styling when face detected', () => {
    const { container } = render(<StatusPanel running={true} faceDetected={true} />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).toContain('bg-green-900')
  })

  it('applies red styling when no face detected', () => {
    const { container } = render(<StatusPanel running={true} faceDetected={false} />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).toContain('bg-red-900')
  })

  it('applies grey styling when stopped', () => {
    const { container } = render(<StatusPanel running={false} faceDetected={false} />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).toContain('bg-gray-700')
  })
})