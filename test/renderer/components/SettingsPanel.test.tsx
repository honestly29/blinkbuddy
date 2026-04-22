import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SettingsPanel } from '../../../src/renderer/components/SettingsPanel'
import type { UserSettings } from '../../../src/shared/ipc-messages'

const defaultSettings: UserSettings = {
  blinkWindowSeconds: 20,
  cameraIndex: 0,
  previewEnabled: false,
  twentyTwentyEnabled: true,
}

const defaultProps = {
  settings: defaultSettings,
  cameras: [],
  camerasLoading: false,
  running: false,
  onBlinkWindowChange: vi.fn(),
  onCameraChange: vi.fn(),
  onTwentyTwentyChange: vi.fn(),
}

describe('SettingsPanel', () => {
  it('renders all sub-components', () => {
    render(<SettingsPanel {...defaultProps} />)
    // Verify each settings control is present by checking for its label text
    expect(screen.getByText('Settings')).toBeDefined()
    expect(screen.getByText('Camera')).toBeDefined()
    expect(screen.getByText('Blink window (seconds)')).toBeDefined()
    expect(screen.getByText('20-20-20 break reminders')).toBeDefined()
  })

  // -- Disabled-when-running tests --
  // These verify that the correct controls are locked during an active session.

  it('disables camera selector when running', () => {
    render(<SettingsPanel {...defaultProps} running={true} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.disabled).toBe(true)
  })

  it('disables blink window input when running', () => {
    render(<SettingsPanel {...defaultProps} running={true} />)
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('keeps 20-20-20 toggle clickable when running', () => {
    render(<SettingsPanel {...defaultProps} running={true} />)
    const buttons = screen.getAllByRole('button')
    const twentyTwentyButton = buttons.find(
      b => b.className.includes('rounded-full'),
    )
    expect(twentyTwentyButton).toBeDefined()
    expect((twentyTwentyButton as HTMLButtonElement).disabled).toBe(false)
  })
})