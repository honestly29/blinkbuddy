import { BrowserWindow, screen } from 'electron'
import type { ReminderStrategy } from './types'

const POPUP_WIDTH = 300
const POPUP_HEIGHT = 80
const MARGIN = 20    // Gap between the popup and the screen edge

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

/**
 * Strategy that shows a small popup in the bottom-right corner
 * of the screen when the user is overdue for a blink.
 *
 * Uses a frameless, transparent, always-on-top, click-through
 * BrowserWindow so it is visible even when the app is minimised
 * and all clicks pass through to underlying windows.
 */
export class CornerPopupStrategy implements ReminderStrategy {
  readonly id = 'corner-popup'
  private window: BrowserWindow | null = null

  onReminderStart(): void {
    const win = this.ensureWindow()
    win.show()
  }

  onReminderEnd(): void {
    // Hide (not destroy) so the window can be reused on the next reminder
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide()
    }
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
    this.window = null
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    const bounds = screen.getPrimaryDisplay().bounds

    // Position the popup in the bottom-right corner with a margin.
    this.window = new BrowserWindow({
      x: bounds.x + bounds.width - POPUP_WIDTH - MARGIN,
      y: bounds.y + bounds.height - POPUP_HEIGHT - MARGIN,
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
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
    this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(POPUP_HTML)}`)

    return this.window
  }
}