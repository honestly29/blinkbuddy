import { app, BrowserWindow, screen } from 'electron'
import type { ReminderStrategy } from './types'
import type { ReminderStrategyId } from '../../shared/reminder-strategies'

/**
 * Converts a 6-digit hex string like "#38bdf8" into red, green, and
 * blue channel values. Needed because the colour picker gives us hex,
 * but CSS box-shadow needs rgba(...) to combine the colour with an
 * alpha channel for the opacity.
 *
 * The parse skips the leading "#" and reads the rest as a base-16
 * number. The top 8 bits are red, the middle 8 are green, and the
 * bottom 8 are blue.
 */
function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}


/**
 * Renders a coloured glow around the edges of the primary display
 * when a reminder fires. The glow lives in a transparent,
 * click-through BrowserWindow that covers the whole screen.
 */
export class ScreenEdgeGlowStrategy implements ReminderStrategy {
  readonly id: ReminderStrategyId = 'screen-edge-glow'

  // Created on the first reminder and kept alive after that, so later
  // reminders just call showInactive() rather than creating a new 
  // BrowserWindow each time which takes more time.
  private window: BrowserWindow | null = null
  private colour = '#38bdf8'
  private opacity = 0.3

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
    let changed = false

    if (typeof options.colour === 'string') {
      this.colour = options.colour
      changed = true
    }
    if (typeof options.opacity === 'number') {
      this.opacity = options.opacity
      changed = true
    }
    
    // If the window already exists, change just the box-shadow CSS on the
    // existing page instead of reloading the page from scratch (which would
    // briefly flicker).
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

  // Builds the HTML that gets loaded into the glow window. Called once
  // when the window is first created. Later colour or opacity changes
  // run JavaScript inside the page (via webContents.executeJavaScript)
  // to update the existing element's CSS, which is faster than reloading
  // the whole page and avoids a visual flicker.
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

  // Returns the window, creating it on first call.
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

    // Make the window click-through so it doesn't intercept user input.
    this.window.setIgnoreMouseEvents(true)

    // visibleOnFullScreen keeps the glow visible if the user is in a
    // fullscreen app
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    // 'screen-saver' is the highest z-level, so nothing else can cover
    // the glow.
    this.window.setAlwaysOnTop(true, 'screen-saver')

    // macOS workaround: setVisibleOnAllWorkspaces(true) appears to
    // hide the dock icon. Calling app.dock.show() afterwards restores
    // it.
    if (process.platform === 'darwin' && app.dock) {
      app.dock.show()
    }

    // Load the HTML inline via a data: URL rather than from a file.
    this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.buildGlowHtml())}`)

    return this.window
  }
}