import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Electron — factory must not reference top-level variables
// ---------------------------------------------------------------------------
// Tests run in Node.js, not Electron, so `import { BrowserWindow } from 'electron' would crash. 
// vi.mock replaces the electron module with fakes before any imports run.
vi.mock('electron', () => {
  const BrowserWindow = vi.fn()
  const screen = {
    getPrimaryDisplay: vi.fn().mockReturnValue({
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },  // Simulated monitor dimensions
    }),
  }
  // Used for the macOS dock-icon restoration test below.
  const app = { dock: { show: vi.fn().mockResolvedValue(undefined) } }
  return { app, BrowserWindow, screen }
})

import { app, BrowserWindow } from 'electron'
import { ScreenEdgeGlowStrategy } from '../../../src/main/reminder-strategies/screen-edge-glow-strategy'

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
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
    },
  }
}

// Access the mocked BrowserWindow constructor so we can control what it returns
const MockBrowserWindow = vi.mocked(BrowserWindow)

describe('ScreenEdgeGlowStrategy', () => {
  let strategy: ScreenEdgeGlowStrategy
  let mockWin: ReturnType<typeof createMockWindow>

  beforeEach(() => {
    vi.clearAllMocks()
    mockWin = createMockWindow()
    // When the strategy calls `new BrowserWindow(...)`, return our mock
    MockBrowserWindow.mockReturnValue(mockWin as any)
    strategy = new ScreenEdgeGlowStrategy()
  })

  it('has id "screen-edge-glow"', () => {
    expect(strategy.id).toBe('screen-edge-glow')
  })

  it('does not create a window on construction', () => {
    // Lazy creation: window is only built on first onReminderStart()
    expect(MockBrowserWindow).not.toHaveBeenCalled()
  })

  it('creates a window and shows it on onReminderStart', () => {
    strategy.onReminderStart()

    expect(MockBrowserWindow).toHaveBeenCalledTimes(1)
    expect(mockWin.showInactive).toHaveBeenCalledTimes(1)
  })

  it('reuses existing window on second onReminderStart', () => {
    // Window should be created once, then reused (show/hide, not create/destroy)
    strategy.onReminderStart()
    strategy.onReminderStart()

    expect(MockBrowserWindow).toHaveBeenCalledTimes(1)  // Created once
    expect(mockWin.showInactive).toHaveBeenCalledTimes(2)       // Shown twice
  })

  it('hides window on onReminderEnd', () => {
    strategy.onReminderStart()
    strategy.onReminderEnd()

    expect(mockWin.hide).toHaveBeenCalledTimes(1)
  })

  it('onReminderEnd is safe when no window exists', () => {
    // Should not crash if called before any onReminderStart
    expect(() => strategy.onReminderEnd()).not.toThrow()
  })

  it('closes window on dispose', () => {
    strategy.onReminderStart()
    strategy.dispose()

    // close() permanently destroys the window (unlike hide which keeps it)
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

  // -- Window configuration tests --
  // Verify the BrowserWindow is created with the correct options
  // for a transparent, click-through, always-on-top glow effect.

  it('creates window with correct options', () => {
    strategy.onReminderStart()

    const opts = MockBrowserWindow.mock.calls[0][0] as Record<string, unknown>
    expect(opts.transparent).toBe(true)
    expect(opts.frame).toBe(false)
    expect(opts.alwaysOnTop).toBe(true)
    expect(opts.focusable).toBe(false)
    expect(opts.skipTaskbar).toBe(true)
    expect(opts.hasShadow).toBe(false)
    expect(opts.x).toBe(0)
    expect(opts.y).toBe(0)
    expect(opts.width).toBe(1920)
    expect(opts.height).toBe(1080)
  })

  it('sets ignore mouse events on creation', () => {
    strategy.onReminderStart()

    // All clicks pass through to the windows underneath
    expect(mockWin.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
  })

  it('configures window for macOS fullscreen visibility', () => {
    strategy.onReminderStart()

    // visibleOnFullScreen: true prevents macOS from switching Spaces
    expect(mockWin.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true })
    // 'screen-saver' level renders above fullscreen apps
    expect(mockWin.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
  })

  it('restores macOS dock icon after configuring workspace visibility', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin' })

    strategy.onReminderStart()

    expect((app.dock as any).show).toHaveBeenCalled()

    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })
  
  it('loads a data URL with glow HTML', () => {
    strategy.onReminderStart()

    expect(mockWin.loadURL).toHaveBeenCalledTimes(1)
    const url = mockWin.loadURL.mock.calls[0][0] as string
    // Verify it's a data URL, not a file path
    expect(url).toMatch(/^data:text\/html;charset=utf-8,/)
    expect(decodeURIComponent(url)).toContain('box-shadow')
    // Verify the HTML contains the CSS glow effect
    expect(decodeURIComponent(url)).toContain('.glow')
  })

  // -------------------------------------------------------------------------
  // configure()
  // -------------------------------------------------------------------------

  it('configure updates glow HTML colour for new windows', () => {
    strategy.configure({ colour: '#ff0000', opacity: 0.5 })
    strategy.onReminderStart()

    const url = mockWin.loadURL.mock.calls[0][0] as string
    const html = decodeURIComponent(url)
    expect(html).toContain('rgba(255, 0, 0, 0.5)')
  })

  it('configure updates CSS via executeJavaScript on existing window', () => {
    strategy.onReminderStart()
    strategy.configure({ colour: '#00ff00', opacity: 0.8 })

    expect(mockWin.webContents.executeJavaScript).toHaveBeenCalledTimes(1)
    const js = mockWin.webContents.executeJavaScript.mock.calls[0][0] as string
    expect(js).toContain('rgba(0, 255, 0, 0.8)')
  })

  it('configure with no window does not throw', () => {
    expect(() => strategy.configure({ colour: '#123456' })).not.toThrow()
  })

  it('configure ignores unknown options', () => {
    expect(() => strategy.configure({ unknown: 'value' })).not.toThrow()
  })
})