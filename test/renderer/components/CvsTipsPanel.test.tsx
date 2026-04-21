import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CvsTipsPanel } from '../../../src/renderer/components/CvsTipsPanel'

describe('CvsTipsPanel', () => {
  // Check for the section headings, a few representative content snippets, and the distinct disclaimer styling.

  it('renders all section headings', () => {
    render(<CvsTipsPanel />)
    expect(screen.getByText('What is Computer Vision Syndrome?')).toBeDefined()
    expect(screen.getByText('How BlinkBuddy helps')).toBeDefined()
    expect(screen.getByText('Quick start guide')).toBeDefined()
    expect(screen.getByText('The 20-20-20 rule')).toBeDefined()
    expect(screen.getByText('Screen setup tips')).toBeDefined()
    expect(screen.getByText('Lighting and environment')).toBeDefined()
    expect(screen.getByText('Important note')).toBeDefined()
  })

  it('renders key content snippets', () => {
    render(<CvsTipsPanel />)
    // Regex matchers here so the test stays resilient to small edits
    expect(screen.getByText(/digital eye strain/)).toBeDefined()
    expect(screen.getByText(/monitor your blink rate in real time/)).toBeDefined()
    expect(screen.getByText(/Go to Settings and choose your camera/)).toBeDefined()
    expect(screen.getByText(/50-70 cm/)).toBeDefined()
  })

  it('renders the disclaimer with distinct styling', () => {
    render(<CvsTipsPanel />)
    // The disclaimer is visually distinct (amber border + amber heading)
    const heading = screen.getByText('Important note')
    expect(heading.className).toContain('text-amber')
    const card = heading.closest('div')
    expect(card?.className).toContain('border-amber')
  })
})