import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Electron — factory must not reference top-level variables
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
import { TwentyTwentyPopupStrategy } from '../../../src/main/reminder-strategies/twenty-twenty-popup-strategy'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DidFinishLoadCallback = () => void

function createMockWindow() {
  const didFinishLoadHandlers: DidFinishLoadCallback[] = []

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
    webContents: {
      on: vi.fn((event: string, handler: DidFinishLoadCallback) => {
        if (event === 'did-finish-load') {
          didFinishLoadHandlers.push(handler)
        }
      }),
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
    },
    // Test-only hook. Lets us trigger did-finish-load at the 
    // exact point a test cares about.
    _simulateLoad() {
      for (const h of didFinishLoadHandlers) h()
    },
  }
}

const MockBrowserWindow = vi.mocked(BrowserWindow)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TwentyTwentyPopupStrategy', () => {
  let strategy: TwentyTwentyPopupStrategy
  let mockWin: ReturnType<typeof createMockWindow>

  beforeEach(() => {
    vi.clearAllMocks()    // Fresh mocks per test
    mockWin = createMockWindow()
    MockBrowserWindow.mockReturnValue(mockWin as any)
    strategy = new TwentyTwentyPopupStrategy()
  })

  it('has id "twenty-twenty-popup"', () => {
    expect(strategy.id).toBe('twenty-twenty-popup')
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
    mockWin._simulateLoad()
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
    // Defensive: end without a prior start shouldn't throw.
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

  it('creates a larger window than the blink popup (400x140)', () => {
    strategy.onReminderStart()

    const opts = MockBrowserWindow.mock.calls[0][0] as Record<string, unknown>
    expect(opts.width).toBe(400)
    expect(opts.height).toBe(140)
  })

  it('positions in the bottom-right corner by default', () => {
    strategy.onReminderStart()

    // 1920 - 400 - 20 = 1500, 1080 - 140 - 20 = 920.
    const opts = MockBrowserWindow.mock.calls[0][0] as Record<string, unknown>
    expect(opts.x).toBe(1500)
    expect(opts.y).toBe(920)
  })

  it('creates window with click-through, transparent, always-on-top display options', () => {
    strategy.onReminderStart()

    const opts = MockBrowserWindow.mock.calls[0][0] as Record<string, unknown>
    expect(opts.transparent).toBe(true)
    expect(opts.frame).toBe(false)
    expect(opts.alwaysOnTop).toBe(true)
    expect(opts.focusable).toBe(false)
    expect(opts.skipTaskbar).toBe(true)
    expect(opts.hasShadow).toBe(false)
    expect(mockWin.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
  })

  it('configures fullscreen visibility and screen-saver always-on-top level', () => {
    strategy.onReminderStart()

    // These two calls together are what make the popup visible over
    // fullscreen apps
    expect(mockWin.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true })
    expect(mockWin.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
  })

  it('restores macOS dock icon after configuring workspace visibility', () => {
    // Temporarily set process.platform to 'darwin'
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin' })

    strategy.onReminderStart()

    expect((app.dock as any).show).toHaveBeenCalled()

    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('loads HTML containing break copy and countdown element', () => {
    strategy.onReminderStart()

    expect(mockWin.loadURL).toHaveBeenCalledTimes(1)
    const url = mockWin.loadURL.mock.calls[0][0] as string
    expect(url).toMatch(/^data:text\/html;charset=utf-8,/)
    const html = decodeURIComponent(url)
    // Decode back from data URL to verify what the page will contain.
    expect(html).toContain('20-20-20 Break')
    expect(html).toContain('Look 20 ft away')
    expect(html).toContain('id="count"')
    expect(html).toContain('function resetCountdown()')
  })

  it('uses higher opacity (0.95) than the blink popup (0.85)', () => {
    strategy.onReminderStart()

    const url = mockWin.loadURL.mock.calls[0][0] as string
    const html = decodeURIComponent(url)
    expect(html).toContain('rgba(15, 23, 42, 0.95)')
  })

  // -------------------------------------------------------------------------
  // Countdown reset behaviour
  // -------------------------------------------------------------------------

  it('does not call executeJavaScript on first show before load', () => {
    strategy.onReminderStart()

    expect(mockWin.webContents.executeJavaScript).not.toHaveBeenCalled()
  })

  it('resets countdown via executeJavaScript on subsequent shows after load', () => {
    strategy.onReminderStart()
    mockWin._simulateLoad()
    strategy.onReminderEnd()
    strategy.onReminderStart()

    expect(mockWin.webContents.executeJavaScript).toHaveBeenCalledWith('resetCountdown()')
  })

  // -------------------------------------------------------------------------
  // configure()
  // -------------------------------------------------------------------------

  it('configure updates corner position for new windows', () => {
    strategy.configure({ corner: 'top-left' })
    strategy.onReminderStart()

    const opts = MockBrowserWindow.mock.calls[0][0] as Record<string, unknown>
    expect(opts.x).toBe(20)
    expect(opts.y).toBe(20)
  })

  it('configure repositions existing window via setPosition', () => {
    strategy.onReminderStart()
    strategy.configure({ corner: 'top-right' })

    // 1920 - 400 - 20 = 1500, margin = 20
    expect(mockWin.setPosition).toHaveBeenCalledWith(1500, 20)
  })

  it('configure handles all four corners', () => {
    strategy.configure({ corner: 'bottom-left' })
    strategy.onReminderStart()

    const opts = MockBrowserWindow.mock.calls[0][0] as Record<string, unknown>
    expect(opts.x).toBe(20)
    expect(opts.y).toBe(920)
  })

  it('configure ignores invalid corner values', () => {
    // Malformed prefs shouldn't crash or move the popup to 0,0
    strategy.configure({ corner: 'invalid' })
    strategy.onReminderStart()

    const opts = MockBrowserWindow.mock.calls[0][0] as Record<string, unknown>
    expect(opts.x).toBe(1500)
    expect(opts.y).toBe(920)
  })

  it('configure with no window does not throw', () => {
    // configure can be called any time, including before a window has
    // ever been spawned
    expect(() => strategy.configure({ corner: 'top-left' })).not.toThrow()
  })
})