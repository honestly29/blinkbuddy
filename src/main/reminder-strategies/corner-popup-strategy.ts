import { app, BrowserWindow, screen } from 'electron'
import type { ReminderStrategy } from './types'
import type { CornerPosition } from '../../shared/ipc-messages'

// Window dimensions and margin are constants: the popup is always the same size, only its corner position changes.
const POPUP_WIDTH = 300
const POPUP_HEIGHT = 80
const MARGIN = 20   

// The popup's content is static. It never changes at runtime, so the HTML string is declared once and reused by every instance.
const POPUP_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; }
  html, body {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: transparent;
  }
  .popup {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-radius: 12px;
    color: #f1f5f9;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 16px;
    font-weight: 500;
    letter-spacing: 0.02em;
    pointer-events: none;
  }
</style>
</head>
<body><div class="popup">Remember to blink</div></body>
</html>`

// Runtime check list used by configure() to validate the corner value.
const VALID_CORNERS: CornerPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

export class CornerPopupStrategy implements ReminderStrategy {
  readonly id = 'corner-popup'
  private window: BrowserWindow | null = null
  private corner: CornerPosition = 'bottom-right'

  onReminderStart(): void {
    const win = this.ensureWindow()
    win.showInactive()
  }

  onReminderEnd(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide()
    }
  }

  configure(options: Record<string, unknown>): void {
    if (typeof options.corner === 'string' && VALID_CORNERS.includes(options.corner as CornerPosition)) {
      this.corner = options.corner as CornerPosition

      // If the popup is already created, move it right away rather than waiting for the next reminder.
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
  }

  // Converts a corner name into absolute screen coordinates for the popup.
  // The bounds offset matters for multi-monitor setups because the primary display might not start at (0, 0).
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

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    const { x, y } = this.computePosition(this.corner)

    // Chromeless, click-through, always-on-top setup 
    this.window = new BrowserWindow({
      x, y,
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })

    this.window.setIgnoreMouseEvents(true)
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.window.setAlwaysOnTop(true, 'screen-saver')

    // macOS bug workaround: setVisibleOnAllWorkspaces(true) hides
    // the dock icon. Re-registering the dock afterwards restores it
    if (process.platform === 'darwin' && app.dock) {
      app.dock.show()
    }
    
    this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(POPUP_HTML)}`)

    return this.window
  }
}