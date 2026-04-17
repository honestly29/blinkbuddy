import { BrowserWindow, screen } from 'electron'
import type { ReminderStrategy } from './types'

/**
 * Inline HTML for the glow effect. Uses an inset box-shadow to create
 * a glow around all screen edges. The colour is a light blue at 30%
 * opacity.
 */

const GLOW_HTML = `<!DOCTYPE html>
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
  .glow {
    position: fixed;
    inset: 0;
    box-shadow: inset 0 0 120px 60px rgba(56, 189, 248, 0.3);
    pointer-events: none;
  }
</style>
</head>
<body><div class="glow"></div></body>
</html>`

/**
 * Strategy that renders a light blue glow around the screen edges
 * when the user is overdue for a blink.
 *
 * Uses a frameless, transparent, always-on-top, click-through
 * BrowserWindow so the glow is visible even when the app is minimised
 * and all clicks pass through to underlying windows.
 *
 * The window is lazily created on first onReminderStart() and then
 * shown/hidden on subsequent calls (not created/destroyed each time).
 */
export class ScreenEdgeGlowStrategy implements ReminderStrategy {
  readonly id = 'screen-edge-glow'
  private window: BrowserWindow | null = null

  onReminderStart(): void {
    // Lazy creation: only build the window the first time it's needed
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
    // Permanently close the window and release its resources.
    // Called on app quit, not on session stop.
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
    this.window = null  // Clear the reference
  }

  /**
   * Get or create the glow window. 
   * The window is created once and reused across reminders to avoid the 
   * overhead of window creation on every blink-overdue event.
   */
  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    const { x, y, width, height } = screen.getPrimaryDisplay().bounds

    this.window = new BrowserWindow({
      x,
      y,
      width,
      height,
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

    // Make all mouse events pass through to the windows underneath.
    this.window.setIgnoreMouseEvents(true)
    // Make the glow visible on all macOS workspaces, including fullscreen ones.
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    // 'screen-saver' allows window to render above fullscreen apps.
    this.window.setAlwaysOnTop(true, 'screen-saver')
    // Load the glow HTML as a data URL.
    this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(GLOW_HTML)}`)

    return this.window
  }
}