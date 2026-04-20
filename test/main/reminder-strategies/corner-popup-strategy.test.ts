import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Electron 
// ---------------------------------------------------------------------------

vi.mock('electron', () => {
  const BrowserWindow = vi.fn()
  const screen = {
    getPrimaryDisplay: vi.fn().mockReturnValue({
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    }),
  }
  return { BrowserWindow, screen }
})

import { BrowserWindow } from 'electron'
import { CornerPopupStrategy } from '../../../src/main/reminder-strategies/corner-popup-strategy'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWindow() {
  return {
    setIgnoreMouseEvents: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    loadURL: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
  }
}

const MockBrowserWindow = vi.mocked(BrowserWindow)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CornerPopupStrategy', () => {
  let strategy: CornerPopupStrategy
  let mockWin: ReturnType<typeof createMockWindow>

  beforeEach(() => {
    vi.clearAllMocks()
    mockWin = createMockWindow()
    MockBrowserWindow.mockReturnValue(mockWin as any)
    strategy = new CornerPopupStrategy()
  })

  it('has id "corner-popup"', () => {
    expect(strategy.id).toBe('corner-popup')
  })

  it('does not create a window on construction', () => {
    expect(MockBrowserWindow).not.toHaveBeenCalled()
  })

  it('creates a window and shows it on onReminderStart', () => {
    strategy.onReminderStart()

    expect(MockBrowserWindow).toHaveBeenCalledTimes(1)
    expect(mockWin.show).toHaveBeenCalledTimes(1)
  })

  it('reuses existing window on second onReminderStart', () => {
    strategy.onReminderStart()
    strategy.onReminderStart()

    expect(MockBrowserWindow).toHaveBeenCalledTimes(1)
    expect(mockWin.show).toHaveBeenCalledTimes(2)
  })

  it('hides window on onReminderEnd', () => {
    strategy.onReminderStart()
    strategy.onReminderEnd()

    expect(mockWin.hide).toHaveBeenCalledTimes(1)
  })

  it('onReminderEnd is safe when no window exists', () => {
    expect(() => strategy.onReminderEnd()).not.toThrow()
  })

  it('closes window on dispose', () => {
    strategy.onReminderStart()
    strategy.dispose()

    expect(mockWin.close).toHaveBeenCalledTimes(1)
  })

  it('dispose is safe when no window exists', () => {
    expect(() => strategy.dispose()).not.toThrow()
  })

  it('creates a fresh window after dispose', () => {
    strategy.onReminderStart()
    strategy.dispose()

    const freshWin = createMockWindow()
    MockBrowserWindow.mockReturnValue(freshWin as any)

    strategy.onReminderStart()

    expect(MockBrowserWindow).toHaveBeenCalledTimes(2)
    expect(freshWin.show).toHaveBeenCalledTimes(1)
  })


  // -- Position and size tests --

  it('creates a small window in the bottom-right corner', () => {
    strategy.onReminderStart()

    const opts = MockBrowserWindow.mock.calls[0][0] as Record<string, unknown>
    expect(opts.width).toBe(300)
    expect(opts.height).toBe(80)
    // Bottom-right with 20px margin on a 1920x1080 screen:
    // x = 1920 - 300 - 20 = 1600, y = 1080 - 80 - 20 = 980
    expect(opts.x).toBe(1600)
    expect(opts.y).toBe(980)
  })

  it('creates window with correct display options', () => {
    strategy.onReminderStart()

    const opts = MockBrowserWindow.mock.calls[0][0] as Record<string, unknown>
    expect(opts.transparent).toBe(true)
    expect(opts.frame).toBe(false)
    expect(opts.alwaysOnTop).toBe(true)
    expect(opts.focusable).toBe(false)
    expect(opts.skipTaskbar).toBe(true)
    expect(opts.hasShadow).toBe(false)
  })

  it('sets ignore mouse events on creation', () => {
    strategy.onReminderStart()

    expect(mockWin.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
  })

  it('configures window for macOS fullscreen visibility', () => {
    strategy.onReminderStart()

    expect(mockWin.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true })
    expect(mockWin.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
  })

  it('loads a data URL with popup HTML', () => {
    strategy.onReminderStart()

    expect(mockWin.loadURL).toHaveBeenCalledTimes(1)
    const url = mockWin.loadURL.mock.calls[0][0] as string
    expect(url).toMatch(/^data:text\/html;charset=utf-8,/)
    expect(decodeURIComponent(url)).toContain('Remember to blink')
    expect(decodeURIComponent(url)).toContain('.popup')
  })
})