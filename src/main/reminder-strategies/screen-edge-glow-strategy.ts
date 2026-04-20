import { BrowserWindow, screen } from 'electron'
import type { ReminderStrategy } from './types'

/**
 * Converts a 6-digit hex string like "#38bdf8" into its red, green, and blue channel values.
 * We need this because the colour picker gives hex but CSS
 * box-shadow needs rgba(...) to include an alpha channel for the opacity.
 *
 * The parse skips the leading "#" and reads the rest as a base-16 number.
 * The top 8 bits are red, the middle 8 are green, and the bottom 8 are blue.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

/**
 * Renders a coloured glow around the edges of the primary display when a reminder fires.
 * The glow lives in a transparent, click-through BrowserWindow
 * that covers the whole screen.
 */
export class ScreenEdgeGlowStrategy implements ReminderStrategy {
  readonly id = 'screen-edge-glow'
  // The window is created lazily on the first reminder 
  // and kept alive after that, so subsequent reminders just call .show() 
  // cost of a new BrowserWindow every time.
  private window: BrowserWindow | null = null
  private colour = '#38bdf8'
  private opacity = 0.3

  onReminderStart(): void {
    const win = this.ensureWindow()
    win.show()
  }

  onReminderEnd(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide()
    }
  }

  configure(options: Record<string, unknown>): void {
    let changed = false

    if (typeof options.colour === 'string') {
      this.colour = options.colour
      changed = true
    }
    if (typeof options.opacity === 'number') {
      this.opacity = options.opacity
      changed = true
    }
    
    // If the window already exists, patch its CSS in place instead of reloading the page.
    if (changed && this.window && !this.window.isDestroyed()) {
      const { r, g, b } = hexToRgb(this.colour)
      this.window.webContents.executeJavaScript(
        `document.querySelector('.glow').style.boxShadow = 'inset 0 0 120px 60px rgba(${r}, ${g}, ${b}, ${this.opacity})'`,
      ).catch(() => {})

    }
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
    this.window = null
  }

  // Builds the HTML loaded into the glow window. 
  // Called once, when the window is first created.
  // Later colour/opacity changes update the existing DOM
  // via executeJavaScript rather than rebuilding this string.
  private buildGlowHtml(): string {
    const { r, g, b } = hexToRgb(this.colour)
    return `<!DOCTYPE html>
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
    /* inset box-shadow creates the glow effect on the inside edges of the
       window. 120px blur + 60px spread gives a soft gradient from the edge. */
    box-shadow: inset 0 0 120px 60px rgba(${r}, ${g}, ${b}, ${this.opacity});
    pointer-events: none;
  }
</style>
</head>
<body><div class="glow"></div></body>
</html>`
  }

  // Returns the window, creating it on first call. Subsequent calls return the existing window.
  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    // Cover the entire primary display
    const { x, y, width, height } = screen.getPrimaryDisplay().bounds

    this.window = new BrowserWindow({
      x, y, width, height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })

    this.window.setIgnoreMouseEvents(true)
    // `visibleOnFullScreen: true` keeps the glow visible even when the user is in a fullscreen app
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    // 'screen-saver' is the highest level, so nothing else can cover the glow.
    this.window.setAlwaysOnTop(true, 'screen-saver')
    // Load the HTML inline via a data: URL.
    this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.buildGlowHtml())}`)

    return this.window
  }
}