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
  const app = { dock: { show: vi.fn().mockResolvedValue(undefined) } } 

  return { app, BrowserWindow, screen }
})

import { app, BrowserWindow } from 'electron'
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
    showInactive: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    setPosition: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
  }
}

const MockBrowserWindow = vi.mocked(BrowserWindow)



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
    expect(mockWin.showInactive).toHaveBeenCalledTimes(1)
  })

  it('reuses existing window on second onReminderStart', () => {
    strategy.onReminderStart()
    strategy.onReminderStart()

    expect(MockBrowserWindow).toHaveBeenCalledTimes(1)
    expect(mockWin.showInactive).toHaveBeenCalledTimes(2)
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
    expect(freshWin.showInactive).toHaveBeenCalledTimes(1)
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
    expect(opts.type).toBe('panel')
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

  it('restores macOS dock icon after configuring workspace visibility', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin' })

    strategy.onReminderStart()

    expect((app.dock as any).show).toHaveBeenCalled()

    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('loads a data URL with popup HTML', () => {
    strategy.onReminderStart()

    expect(mockWin.loadURL).toHaveBeenCalledTimes(1)
    const url = mockWin.loadURL.mock.calls[0][0] as string
    expect(url).toMatch(/^data:text\/html;charset=utf-8,/)
    expect(decodeURIComponent(url)).toContain('Remember to blink')
    expect(decodeURIComponent(url)).toContain('.popup')
  })

  // -------------------------------------------------------------------------
  // configure()
  // -------------------------------------------------------------------------

  it('configure updates corner position for new windows', () => {
    strategy.configure({ corner: 'top-left' })
    strategy.onReminderStart()

    const opts = MockBrowserWindow.mock.calls[0][0] as Record<string, unknown>
    // Top-left with 20px margin
    expect(opts.x).toBe(20)
    expect(opts.y).toBe(20)
  })

  it('configure repositions existing window via setPosition', () => {
    strategy.onReminderStart()
    strategy.configure({ corner: 'top-right' })

    expect(mockWin.setPosition).toHaveBeenCalledWith(1600, 20)
  })

  it('configure handles all four corners', () => {
    // bottom-left
    strategy.configure({ corner: 'bottom-left' })
    strategy.onReminderStart()

    const opts = MockBrowserWindow.mock.calls[0][0] as Record<string, unknown>
    expect(opts.x).toBe(20)
    expect(opts.y).toBe(980)
  })

  it('configure ignores invalid corner values', () => {
    strategy.configure({ corner: 'invalid' })
    strategy.onReminderStart()

    const opts = MockBrowserWindow.mock.calls[0][0] as Record<string, unknown>
    // Still bottom-right (default)
    expect(opts.x).toBe(1600)
    expect(opts.y).toBe(980)
  })

  it('configure with no window does not throw', () => {
    expect(() => strategy.configure({ corner: 'top-left' })).not.toThrow()
  })
})