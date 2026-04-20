import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ReminderSettingsPanel } from '../../../src/renderer/components/ReminderSettingsPanel'
import type { ReminderPreferences } from '../../../src/shared/ipc-messages'

const defaultPrefs: ReminderPreferences = {
  overlay: { enabled: true },
  screenEdgeGlow: { enabled: true, colour: '#38bdf8', opacity: 0.3 },
  cornerPopup: { enabled: true, corner: 'bottom-right' },
  audioCue: { enabled: true, soundFile: 'dragon-studio-ding.mp3', volume: 0.5 },
}

const mockGetReminderPreferences = vi.fn()
const mockUpdateReminderPreferences = vi.fn()
const mockTestReminder = vi.fn()

beforeEach(() => {
  mockGetReminderPreferences.mockClear()
  mockUpdateReminderPreferences.mockClear()
  mockTestReminder.mockClear()

  mockGetReminderPreferences.mockResolvedValue({ ...defaultPrefs })
  mockUpdateReminderPreferences.mockResolvedValue(undefined)
  mockTestReminder.mockResolvedValue(undefined)

  window.blinkBuddy = {
    getReminderPreferences: mockGetReminderPreferences,
    updateReminderPreferences: mockUpdateReminderPreferences,
    testReminder: mockTestReminder,
  } as unknown as typeof window.blinkBuddy
})

afterEach(() => {
  // @ts-expect-error cleanup
  delete window.blinkBuddy
})

describe('ReminderSettingsPanel', () => {
  it('shows loading state initially', () => {
    mockGetReminderPreferences.mockReturnValue(new Promise(() => {}))
    render(<ReminderSettingsPanel running={false} />)

    expect(screen.getByText('Loading...')).toBeDefined()
    expect(screen.getByText('Reminders')).toBeDefined()
  })

  it('renders all four card headings after loading', async () => {
    render(<ReminderSettingsPanel running={false} />)

    await waitFor(() => {
      expect(screen.getByText('In-app overlay')).toBeDefined()
      expect(screen.getByText('Screen edge glow')).toBeDefined()
      expect(screen.getByText('Corner popup')).toBeDefined()
      expect(screen.getByText('Audio cue')).toBeDefined()
    })
  })

  it('renders four test buttons', async () => {
    render(<ReminderSettingsPanel running={false} />)

    await waitFor(() => {
      expect(screen.getAllByText('Test')).toHaveLength(4)
    })
  })

  // -------------------------------------------------------------------------
  // Toggle behaviour
  // -------------------------------------------------------------------------

  it('calls updateReminderPreferences when toggling overlay off', async () => {
    render(<ReminderSettingsPanel running={false} />)

    await waitFor(() => screen.getByText('In-app overlay'))

    // The overlay toggle is the first toggle switch (green button)
    const toggles = screen.getAllByRole('button').filter(
      (b) => b.className.includes('rounded-full'),
    )
    fireEvent.click(toggles[0])

    await waitFor(() => {
      expect(mockUpdateReminderPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          overlay: { enabled: false },
        }),
      )
    })
  })

  it('reverts toggle and shows error when update rejects', async () => {
    mockUpdateReminderPreferences.mockRejectedValue(
      new Error('At least one reminder strategy must be enabled'),
    )

    render(<ReminderSettingsPanel running={false} />)

    await waitFor(() => screen.getByText('In-app overlay'))

    const toggles = screen.getAllByRole('button').filter(
      (b) => b.className.includes('rounded-full'),
    )
    fireEvent.click(toggles[0])

    await waitFor(() => {
      expect(
        screen.getByText('At least one reminder strategy must be enabled'),
      ).toBeDefined()
    })
  })

  // -------------------------------------------------------------------------
  // Test button
  // -------------------------------------------------------------------------

  it('calls testReminder with correct strategy ID', async () => {
    render(<ReminderSettingsPanel running={false} />)

    await waitFor(() => screen.getByText('In-app overlay'))

    const testButtons = screen.getAllByText('Test')
    fireEvent.click(testButtons[0])

    expect(mockTestReminder).toHaveBeenCalledWith('overlay')
  })

  it('shows test error when testReminder rejects', async () => {
    mockTestReminder.mockRejectedValue(
      new Error('Cannot test while a reminder is active'),
    )

    render(<ReminderSettingsPanel running={false} />)

    await waitFor(() => screen.getByText('In-app overlay'))

    const testButtons = screen.getAllByText('Test')
    fireEvent.click(testButtons[0])

    await waitFor(() => {
      expect(
        screen.getByText('Cannot test while a reminder is active'),
      ).toBeDefined()
    })
  })

  it('disables test buttons when monitoring is running', async () => {
    render(<ReminderSettingsPanel running={true} />)

    await waitFor(() => screen.getByText('In-app overlay'))

    const testButtons = screen.getAllByText('Test')
    for (const btn of testButtons) {
      expect(btn).toHaveProperty('disabled', true)
      expect(btn.className).toContain('opacity-50')
    }
  })

  // -------------------------------------------------------------------------
  // Secondary controls visibility
  // -------------------------------------------------------------------------

  it('shows glow colour and opacity controls when enabled', async () => {
    render(<ReminderSettingsPanel running={false} />)

    await waitFor(() => {
      expect(screen.getByText('Colour')).toBeDefined()
      expect(screen.getByText('Opacity')).toBeDefined()
    })
  })

  it('hides glow controls when disabled', async () => {
    mockGetReminderPreferences.mockResolvedValue({
      ...defaultPrefs,
      screenEdgeGlow: { ...defaultPrefs.screenEdgeGlow, enabled: false },
    })

    render(<ReminderSettingsPanel running={false} />)

    await waitFor(() => screen.getByText('Screen edge glow'))

    expect(screen.queryByText('Colour')).toBeNull()
    expect(screen.queryByText('Opacity')).toBeNull()
  })

  it('shows corner position selector when popup enabled', async () => {
    render(<ReminderSettingsPanel running={false} />)

    await waitFor(() => {
      expect(screen.getByText('Position')).toBeDefined()
      // Unicode arrow buttons for corners
      expect(screen.getByText('\u2196')).toBeDefined()
      expect(screen.getByText('\u2197')).toBeDefined()
      expect(screen.getByText('\u2199')).toBeDefined()
      expect(screen.getByText('\u2198')).toBeDefined()
    })
  })

  it('hides corner controls when popup disabled', async () => {
    mockGetReminderPreferences.mockResolvedValue({
      ...defaultPrefs,
      cornerPopup: { ...defaultPrefs.cornerPopup, enabled: false },
    })

    render(<ReminderSettingsPanel running={false} />)

    await waitFor(() => screen.getByText('Corner popup'))

    expect(screen.queryByText('Position')).toBeNull()
  })

  it('shows sound dropdown and volume when audio enabled', async () => {
    render(<ReminderSettingsPanel running={false} />)

    await waitFor(() => {
      expect(screen.getByText('Sound')).toBeDefined()
      expect(screen.getByText('Volume')).toBeDefined()
      expect(screen.getByText('Ding')).toBeDefined()
    })
  })

  it('hides audio controls when disabled', async () => {
    mockGetReminderPreferences.mockResolvedValue({
      ...defaultPrefs,
      audioCue: { ...defaultPrefs.audioCue, enabled: false },
    })

    render(<ReminderSettingsPanel running={false} />)

    await waitFor(() => screen.getByText('Audio cue'))

    expect(screen.queryByText('Sound')).toBeNull()
    expect(screen.queryByText('Volume')).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Control interactions
  // -------------------------------------------------------------------------

  it('updates corner position when button clicked', async () => {
    render(<ReminderSettingsPanel running={false} />)

    await waitFor(() => screen.getByText('Position'))

    // Click top-left arrow
    fireEvent.click(screen.getByText('\u2196'))

    await waitFor(() => {
      expect(mockUpdateReminderPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          cornerPopup: { enabled: true, corner: 'top-left' },
        }),
      )
    })
  })

  it('updates sound file when dropdown changed', async () => {
    render(<ReminderSettingsPanel running={false} />)

    await waitFor(() => screen.getByText('Sound'))

    const select = screen.getByDisplayValue('Ding')
    fireEvent.change(select, { target: { value: 'universfield-clear-bell-chime.mp3' } })

    await waitFor(() => {
      expect(mockUpdateReminderPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          audioCue: expect.objectContaining({
            soundFile: 'universfield-clear-bell-chime.mp3',
          }),
        }),
      )
    })
  })
})
