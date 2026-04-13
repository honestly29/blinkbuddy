import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CvsTipsPanel } from '../../../src/renderer/components/CvsTipsPanel'

describe('CvsTipsPanel', () => {
  it('renders the section heading', () => {
    render(<CvsTipsPanel />)
    expect(screen.getByText('Eye Health Tips')).toBeDefined()
  })

  it('renders all five tips', () => {
    // Verify every tip title is present in the DOM.
    render(<CvsTipsPanel />)
    expect(screen.getByText('20-20-20 Rule')).toBeDefined()
    expect(screen.getByText('Screen Distance')).toBeDefined()
    expect(screen.getByText('Blink Awareness')).toBeDefined()
    expect(screen.getByText('Lighting')).toBeDefined()
    expect(screen.getByText('Font Size')).toBeDefined()
  })

  it('renders tip descriptions', () => {
    // Uses regex patterns (/.../) rather than exact string matching
    render(<CvsTipsPanel />)
    expect(screen.getByText(/Every 20 minutes/)).toBeDefined()
    expect(screen.getByText(/50–70 cm/)).toBeDefined()
    expect(screen.getByText(/reduce your blink rate/)).toBeDefined()
    expect(screen.getByText(/Match your screen brightness/)).toBeDefined()
    expect(screen.getByText(/at least 12pt/)).toBeDefined()
  })
})