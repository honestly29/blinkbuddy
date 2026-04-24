import { app, BrowserWindow, screen } from 'electron'
import type { ReminderStrategy } from './types'
import type { CornerPosition } from '../../shared/ipc-messages'

// --- Layout constants ---
const POPUP_WIDTH = 400
const POPUP_HEIGHT = 140
const MARGIN = 20   // Gap between the popup and the nearest screen edges
const BREAK_SECONDS = 20

const POPUP_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: transparent;
  }
  .popup {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 2px solid rgba(245, 158, 11, 0.9);
    border-radius: 14px;
    color: #f1f5f9;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    pointer-events: none;
    padding: 16px;
    gap: 4px;
  }
  .title {
    font-size: 20px;
    font-weight: 600;
    color: #fbbf24;
    letter-spacing: 0.02em;
  }
  .subtitle {
    font-size: 14px;
    color: #cbd5e1;
  }
  .count {
    font-size: 36px;
    font-weight: 700;
    color: #f8fafc;
    font-variant-numeric: tabular-nums;
    margin-top: 4px;
  }
</style>
</head>
<body>
<div class="popup">
  <div class="title">20-20-20 Break</div>
  <div class="subtitle">Look 20 ft away</div>
  <div class="count"><span id="count">${BREAK_SECONDS}</span>s</div>
</div>
<script>
// --- Inline countdown logic ---
var _count = ${BREAK_SECONDS};
var _interval = null;
function _tick() {
  _count = _count - 1;
  var el = document.getElementById('count');
  // Clamp the displayed value to 0
  if (el) el.textContent = _count < 0 ? 0 : _count;
  // Stop ticking once we hit zero
  if (_count <= 0 && _interval) { clearInterval(_interval); _interval = null; }
}
// Exposed globally so the main process can call it via executeJavaScript
// to restart the countdown when the window is reused for a later break.
function resetCountdown() {
  _count = ${BREAK_SECONDS};
  var el = document.getElementById('count');
  if (el) el.textContent = _count;
  // Always clear the old interval before starting a new one
  if (_interval) clearInterval(_interval);
  _interval = setInterval(_tick, 1000);
}
// Start the first countdown when the page loads
resetCountdown();
</script>
</body>
</html>`

const VALID_CORNERS: CornerPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

export class TwentyTwentyPopupStrategy implements ReminderStrategy {
  readonly id = 'twenty-twenty-popup'
  // The BrowserWindow is lazily created on first show and reused while the app is running
  private window: BrowserWindow | null = null
  private corner: CornerPosition = 'bottom-right'
  // Tracks whether the embedded page has finished loading.
  private ready = false

  onReminderStart(): void {
    const win = this.ensureWindow()
    if (this.ready) {
      win.webContents.executeJavaScript('resetCountdown()').catch(() => {})
    }
    win.showInactive()
  }

  onReminderEnd(): void {
    // Hide rather than close.
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide()
    }
  }

  configure(options: Record<string, unknown>): void {
    // Guard against malformed or missing corner values.
    if (typeof options.corner === 'string' && VALID_CORNERS.includes(options.corner as CornerPosition)) {
      this.corner = options.corner as CornerPosition

      // If the window already exists, reposition it live
      if (this.window && !this.window.isDestroyed()) {
        const { x, y } = this.computePosition(this.corner)
        this.window.setPosition(x, y)
      }
    }
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
    this.window = null
    this.ready = false
  }

  /**
   * Compute the popup's top-left (x, y) based on the chosen corner. */
  private computePosition(corner: CornerPosition): { x: number; y: number } {
    const bounds = screen.getPrimaryDisplay().bounds

    switch (corner) {
      case 'top-left':
        return { x: bounds.x + MARGIN, y: bounds.y + MARGIN }
      case 'top-right':
        return { x: bounds.x + bounds.width - POPUP_WIDTH - MARGIN, y: bounds.y + MARGIN }
      case 'bottom-left':
        return { x: bounds.x + MARGIN, y: bounds.y + bounds.height - POPUP_HEIGHT - MARGIN }
      case 'bottom-right':
        return { x: bounds.x + bounds.width - POPUP_WIDTH - MARGIN, y: bounds.y + bounds.height - POPUP_HEIGHT - MARGIN }
    }
  }

  /**
   * Create the window on first use, or return the existing one. */
  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    // Reset ready flag
    this.ready = false

    const { x, y } = this.computePosition(this.corner)

    this.window = new BrowserWindow({
      x,
      y,
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
      type: 'panel',
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    this.window.setIgnoreMouseEvents(true)
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.window.setAlwaysOnTop(true, 'screen-saver')
    // macOS bug workaround: setVisibleOnAllWorkspaces(true) can cause the dock icon to vanish.
    // Calling app.dock.show() re-registers it.
    if (process.platform === 'darwin' && app.dock) {
      app.dock.show()
    }

    this.window.webContents.on('did-finish-load', () => {
      this.ready = true
    })

    this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(POPUP_HTML)}`)

    return this.window
  }
}