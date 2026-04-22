import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Electron and Node modules — factories must not reference top-level vars
// ---------------------------------------------------------------------------

vi.mock('electron', () => {
  const BrowserWindow = vi.fn()
  const app = {
    // Used to locate the sounds dir.
    getAppPath: vi.fn().mockReturnValue('/mock/app'),
  }
  return { BrowserWindow, app }
})

vi.mock('node:fs', () => {
  // Return different buffers for the two sound files
  const readFileSync = vi.fn((p: string) => {
    if (typeof p === 'string' && p.includes('clear-bell-chime')) return Buffer.from('start-sound-data')
    if (typeof p === 'string' && p.includes('system-notification')) return Buffer.from('end-sound-data')
    return Buffer.from('unknown-sound')
  })
  return {
    default: { readFileSync },
    readFileSync,
  }
})

import { BrowserWindow } from 'electron'
import { TwentyTwentyAudioStrategy } from '../../../src/main/reminder-strategies/twenty-twenty-audio-strategy'

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
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
    },
    loadURL: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    _simulateLoad() {
      for (const h of didFinishLoadHandlers) h()
    },
  }
}

const MockBrowserWindow = vi.mocked(BrowserWindow)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TwentyTwentyAudioStrategy', () => {
  let strategy: TwentyTwentyAudioStrategy
  let mockWin: ReturnType<typeof createMockWindow>

  beforeEach(() => {
    vi.clearAllMocks()
    mockWin = createMockWindow()
    MockBrowserWindow.mockReturnValue(mockWin as any)
    strategy = new TwentyTwentyAudioStrategy()
  })

  it('has id "twenty-twenty-audio"', () => {
    expect(strategy.id).toBe('twenty-twenty-audio')
  })

  it('does not create a window on construction', () => {
    expect(MockBrowserWindow).not.toHaveBeenCalled()
  })

  it('creates a hidden window on first onReminderStart', () => {
    strategy.onReminderStart()

    expect(MockBrowserWindow).toHaveBeenCalledTimes(1)
    const opts = MockBrowserWindow.mock.calls[0][0] as Record<string, unknown>
    // This is an audio-only window so the user
    // should never see it flash into existence.
    expect(opts.show).toBe(false)
  })

  it('reuses existing window on subsequent calls', () => {
    strategy.onReminderStart()
    mockWin._simulateLoad()
    strategy.onReminderEnd()

    // One construction total - start and end share the same hidden window
    expect(MockBrowserWindow).toHaveBeenCalledTimes(1)
  })

  it('loads HTML containing both startCue and endCue elements', () => {
    strategy.onReminderStart()

    expect(mockWin.loadURL).toHaveBeenCalledTimes(1)
    const url = mockWin.loadURL.mock.calls[0][0] as string
    const html = decodeURIComponent(url)
    // Two separate audio elements - playing start doesn't interfere
    // with the end cue's currentTime or vice versa.
    expect(html).toContain('id="startCue"')
    expect(html).toContain('id="endCue"')
    expect(html).toContain('function playStart()')
    expect(html).toContain('function playEnd()')
  })

  it('embeds both sounds as base64 data URLs', () => {
    strategy.onReminderStart()

    const url = mockWin.loadURL.mock.calls[0][0] as string
    const html = decodeURIComponent(url)
    // Verify the right file buffer ended up at the right element.
    const startExpected = Buffer.from('start-sound-data').toString('base64')
    const endExpected = Buffer.from('end-sound-data').toString('base64')
    expect(html).toContain(`id="startCue" src="data:audio/mpeg;base64,${startExpected}"`)
    expect(html).toContain(`id="endCue" src="data:audio/mpeg;base64,${endExpected}"`)
  })

  // -------------------------------------------------------------------------
  // Playback
  // -------------------------------------------------------------------------

  it('plays start cue via executeJavaScript on onReminderStart after load', () => {
    strategy.onReminderStart()
    mockWin._simulateLoad()

    expect(mockWin.webContents.executeJavaScript).toHaveBeenCalledWith('playStart()')
  })

  it('plays end cue via executeJavaScript on onReminderEnd after load', () => {
    strategy.onReminderStart()
    mockWin._simulateLoad()
    mockWin.webContents.executeJavaScript.mockClear()

    strategy.onReminderEnd()

    expect(mockWin.webContents.executeJavaScript).toHaveBeenCalledWith('playEnd()')
  })

  it('queues start cue if page not loaded yet, plays on did-finish-load', () => {
    // Covers when a break fires before the hidden window finishes
    // loading its HTML. The cue should queue, not silently drop.
    strategy.onReminderStart()

    expect(mockWin.webContents.executeJavaScript).not.toHaveBeenCalled()

    mockWin._simulateLoad()

    expect(mockWin.webContents.executeJavaScript).toHaveBeenCalledWith('playStart()')
  })

  it('queues end cue if page not loaded yet, plays on did-finish-load', () => {
    strategy.onReminderEnd()

    expect(mockWin.webContents.executeJavaScript).not.toHaveBeenCalled()

    mockWin._simulateLoad()

    expect(mockWin.webContents.executeJavaScript).toHaveBeenCalledWith('playEnd()')
  })

  it('most recent pending cue wins when multiple fire before load', () => {
    strategy.onReminderStart()
    strategy.onReminderEnd()

    mockWin._simulateLoad()

    // Last cue queued was "end", so playEnd is what fires
    expect(mockWin.webContents.executeJavaScript).toHaveBeenCalledTimes(1)
    expect(mockWin.webContents.executeJavaScript).toHaveBeenCalledWith('playEnd()')
  })

  // -------------------------------------------------------------------------
  // configure()
  // -------------------------------------------------------------------------

  it('sets initial volume on both elements at creation', () => {
    strategy.configure({ volume: 0.7 })
    strategy.onReminderStart()

    const url = mockWin.loadURL.mock.calls[0][0] as string
    const html = decodeURIComponent(url)
    expect(html).toMatch(/getElementById\('startCue'\)\.volume = 0\.7/)
    expect(html).toMatch(/getElementById\('endCue'\)\.volume = 0\.7/)
  })

  it('configure volume updates existing window via executeJavaScript', () => {
    strategy.onReminderStart()
    mockWin._simulateLoad()
    mockWin.webContents.executeJavaScript.mockClear()

    strategy.configure({ volume: 0.3 })

    const call = mockWin.webContents.executeJavaScript.mock.calls[0][0] as string
    expect(call).toContain("getElementById('startCue').volume = 0.3")
    expect(call).toContain("getElementById('endCue').volume = 0.3")
  })

  it('configure ignores out-of-range volume', () => {
    strategy.onReminderStart()
    mockWin._simulateLoad()
    mockWin.webContents.executeJavaScript.mockClear()

    strategy.configure({ volume: 1.5 })

    expect(mockWin.webContents.executeJavaScript).not.toHaveBeenCalled()
  })

  it('configure with no window does not throw', () => {
    expect(() => strategy.configure({ volume: 0.5 })).not.toThrow()
  })

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // onReminderCancel() — silent dismissal
  // -------------------------------------------------------------------------

  it('onReminderCancel does NOT play the end cue after load', () => {
    strategy.onReminderStart()
    mockWin._simulateLoad()
    mockWin.webContents.executeJavaScript.mockClear()

    strategy.onReminderCancel()

    expect(mockWin.webContents.executeJavaScript).not.toHaveBeenCalled()
  })

  it('onReminderCancel drops any pending cue queued before load', () => {
    strategy.onReminderStart()
    // Page not loaded yet — playStart is queued
    strategy.onReminderCancel()

    // Simulate load after cancellation
    mockWin._simulateLoad()

    // Nothing should play because the pending cue was cleared
    expect(mockWin.webContents.executeJavaScript).not.toHaveBeenCalled()
  })

  it('onReminderCancel does not throw when no window exists', () => {
    expect(() => strategy.onReminderCancel()).not.toThrow()
  })
})