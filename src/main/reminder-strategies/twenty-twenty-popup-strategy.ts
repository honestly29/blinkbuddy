import { app, BrowserWindow, screen } from 'electron'
import type { ReminderStrategy } from './types'
import type { CornerPosition } from '../../shared/ipc-messages'
import type { ReminderStrategyId } from '../../shared/reminder-strategies'

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
  // Show 0 (not a negative number) and stop the timer once we hit zero.
  if (el) el.textContent = _count < 0 ? 0 : _count;
  if (_count <= 0 && _interval) { clearInterval(_interval); _interval = null; }
}
// Called from the main process via executeJavaScript to restart the
// countdown when the window is reused for a later break.
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
  readonly id: ReminderStrategyId = 'twenty-twenty-popup'
  // Created on the first break and kept alive after that for reuse.
  private window: BrowserWindow | null = null
  private corner: CornerPosition = 'bottom-right'
  // True once the popup's HTML and inline script have finished loading.
  private ready = false

  onReminderStart(): void {
    const win = this.ensureWindow()
    // On the first break the page is still loading; the inline
    // script will start the countdown automatically when ready. On
    // later breaks the page is already there and we restart the
    // countdown via the resetCountdown() function.
    if (this.ready) {
      win.webContents.executeJavaScript('resetCountdown()').catch(() => {})
    }
    win.showInactive()
  }

  onReminderEnd(): void {
    // Hide rather than close so the window can be reused on the next
    // break without rebuilding it (which would be slow).
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide()
    }
  }

  configure(options: Record<string, unknown>): void {
    // Validate the corner before assigning. The input crossed IPC, which
    // means it could arrive as the wrong type or a misspelled string;
    // reject anything that isn't one of the four valid corners.
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

  // Compute the popup's top-left (x, y) based on the chosen corner. 
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

  // Create the window on first use, or return the existing one. 
  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    // Reset to false because we're about to load a fresh page; the
    // did-finish-load handler will set it back to true once ready.
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

    // Click-through so the popup doesn't intercept user input.
    this.window.setIgnoreMouseEvents(true)

    // Keep the popup visible if the user is in a fullscreen app.
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    // 'screen-saver' is the highest z-level, so nothing else can cover
    // the popup.
    this.window.setAlwaysOnTop(true, 'screen-saver')
    
    // macOS workaround: setVisibleOnAllWorkspaces(true) appears to hide
    // the dock icon. Calling app.dock.show() afterwards restores it.
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