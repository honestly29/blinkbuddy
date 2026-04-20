import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Electron and Node modules
// ---------------------------------------------------------------------------
// The audio strategy imports from both 'electron' (BrowserWindow, app) and
// 'node:fs' (readFileSync for the sound file). Both need to be faked since
// tests run in plain Node.js without Electron or real sound files.

vi.mock('electron', () => {
  const BrowserWindow = vi.fn()
  const app = {
    getAppPath: vi.fn().mockReturnValue('/mock/app'),  // Fake project root
  }
  return { BrowserWindow, app }
})

vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-mp3-data')),
  },
  readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-mp3-data')),
}))

import { BrowserWindow } from 'electron'
import { AudioCueStrategy } from '../../../src/main/reminder-strategies/audio-cue-strategy'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DidFinishLoadCallback = () => void

function createMockWindow() {
  const didFinishLoadHandlers: DidFinishLoadCallback[] = []

  return {
    webContents: {
      on: vi.fn((event: string, handler: DidFinishLoadCallback) => {
        if (event === 'did-finish-load') {
          didFinishLoadHandlers.push(handler)
        }
      }),
      // Mock for the play() call. Returns a resolved Promise (simulates success).
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
    },
    loadURL: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    // Test helper: trigger all registered did-finish-load callbacks, simulating the HTML page finishing loading.
    _simulateLoad() {
      for (const h of didFinishLoadHandlers) h()
    },
  }
}

const MockBrowserWindow = vi.mocked(BrowserWindow)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioCueStrategy', () => {
  let strategy: AudioCueStrategy
  let mockWin: ReturnType<typeof createMockWindow>

  beforeEach(() => {
    vi.clearAllMocks()
    mockWin = createMockWindow()
    MockBrowserWindow.mockReturnValue(mockWin as any)
    strategy = new AudioCueStrategy()
  })

  it('has id "audio-cue"', () => {
    expect(strategy.id).toBe('audio-cue')
  })

  it('does not create a window on construction', () => {
    expect(MockBrowserWindow).not.toHaveBeenCalled()
  })

  it('creates a hidden window on first onReminderStart', () => {
    strategy.onReminderStart()

    expect(MockBrowserWindow).toHaveBeenCalledTimes(1)
    const opts = MockBrowserWindow.mock.calls[0][0] as Record<string, unknown>
    expect(opts.show).toBe(false)
  })

  it('reuses existing window on second onReminderStart', () => {
    strategy.onReminderStart()
    mockWin._simulateLoad()
    strategy.onReminderStart()

    expect(MockBrowserWindow).toHaveBeenCalledTimes(1)
  })

  it('registers did-finish-load handler on creation', () => {
    strategy.onReminderStart()

    expect(mockWin.webContents.on).toHaveBeenCalledWith('did-finish-load', expect.any(Function))
  })

  it('plays sound via executeJavaScript when ready', () => {
    strategy.onReminderStart()
    mockWin._simulateLoad()    // Page is now ready


    // Call again after the page is loaded - should play immediately
    strategy.onReminderStart()

    expect(mockWin.webContents.executeJavaScript).toHaveBeenCalledWith('play()')
  })

  it('queues play if page not loaded yet, plays on did-finish-load', () => {
    strategy.onReminderStart()

    // Not loaded yet — executeJavaScript should not be called
    expect(mockWin.webContents.executeJavaScript).not.toHaveBeenCalled()

    // Simulate load
    mockWin._simulateLoad()

    // Now the pending play should fire
    expect(mockWin.webContents.executeJavaScript).toHaveBeenCalledWith('play()')
  })

  it('onReminderEnd does not throw or interact with window', () => {
    // Audio plays once and finishes naturally, so onReminderEnd is a no-op.
    // Verify it doesn't crash or try to hide the window.
    expect(() => strategy.onReminderEnd()).not.toThrow()

    strategy.onReminderStart()
    mockWin._simulateLoad()

    expect(() => strategy.onReminderEnd()).not.toThrow()
    expect(mockWin.hide).not.toHaveBeenCalled()   // Audio window is never shown/hidden
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
  })

  it('loads a data URL with audio HTML containing base64 sound', () => {
    strategy.onReminderStart()

    expect(mockWin.loadURL).toHaveBeenCalledTimes(1)
    const url = mockWin.loadURL.mock.calls[0][0] as string
    expect(url).toMatch(/^data:text\/html;charset=utf-8,/)
    const html = decodeURIComponent(url)
    // Verify the HTML contains the audio element with embedded base64 sound
    expect(html).toContain('<audio')
    expect(html).toContain('data:audio/mpeg;base64,')
    expect(html).toContain('function play()')
  })

  it('sets volume on audio element at creation time, not just in play()', () => {
    strategy.configure({ volume: 0.8 })
    strategy.onReminderStart()

    const url = mockWin.loadURL.mock.calls[0][0] as string
    const html = decodeURIComponent(url)
    // Volume should be set on the element outside of play()
    expect(html).toMatch(/getElementById\('cue'\)\.volume = 0\.8/)
  })

  // -------------------------------------------------------------------------
  // configure()
  // -------------------------------------------------------------------------

  it('configure with new soundFile disposes existing window', () => {
    strategy.onReminderStart()
    strategy.configure({ soundFile: 'universfield-clear-bell-chime.mp3' })

    expect(mockWin.close).toHaveBeenCalledTimes(1)
  })

  it('configure with same soundFile does not dispose window', () => {
    strategy.onReminderStart()
    strategy.configure({ soundFile: 'dragon-studio-ding.mp3' })

    expect(mockWin.close).not.toHaveBeenCalled()
  })

  it('configure volume updates existing window via executeJavaScript', () => {
    strategy.onReminderStart()
    mockWin._simulateLoad()

    strategy.configure({ volume: 0.3 })

    expect(mockWin.webContents.executeJavaScript).toHaveBeenCalledWith(
      "document.getElementById('cue').volume = 0.3",
    )
  })

  it('configure with no window does not throw', () => {
    expect(() => strategy.configure({ volume: 0.5 })).not.toThrow()
  })

  it('configure ignores invalid soundFile', () => {
    strategy.onReminderStart()
    strategy.configure({ soundFile: 'invalid.mp3' })

    expect(mockWin.close).not.toHaveBeenCalled()
  })

  it('configure ignores out-of-range volume', () => {
    strategy.onReminderStart()
    mockWin._simulateLoad()

    strategy.configure({ volume: 1.5 })

    // Should not call executeJavaScript for volume update
    expect(mockWin.webContents.executeJavaScript).not.toHaveBeenCalledWith(
      expect.stringContaining('volume'),
    )
  })
})