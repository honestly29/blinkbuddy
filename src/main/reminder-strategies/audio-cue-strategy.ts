import { BrowserWindow, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type { ReminderStrategy } from './types'

const SOUND_FILENAME = 'dragon-studio-ding.mp3'

/**
 * Strategy that plays a short audio cue when the user is overdue
 * for a blink.
 *
 * Uses a hidden BrowserWindow with a preloaded <audio> element.
 * The sound file is base64-encoded and embedded directly in the
 * HTML to avoid file:// CORS restrictions from a data: origin.
 */
export class AudioCueStrategy implements ReminderStrategy {
  readonly id = 'audio-cue'
  private window: BrowserWindow | null = null
  private ready = false         // True once the HTML page has finished loading
  private pendingPlay = false   // True if onReminderStart was called before the page was ready

  onReminderStart(): void {
    this.ensureWindow()
    if (this.ready) {
      // Page is loaded, play immediately
      this.play()
    } else {
      // Page is still loading, queue the play for when did-finish-load fires
      this.pendingPlay = true
    }
  }

  onReminderEnd(): void {
    // Sound plays once and finishes on its own. So nothing to hide
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
    this.window = null
    this.ready = false
    this.pendingPlay = false
  }

  /** Tell the hidden window to play the sound by calling the play() function in its HTML. */
  private play(): void {
    if (this.window && !this.window.isDestroyed()) {
      // executeJavaScript runs code in the hidden window's context.
      // .catch(() => {}) prevents unhandled rejections from browser autoplay policies
      this.window.webContents.executeJavaScript('play()').catch(() => {})
    }
  }

  private ensureWindow(): void {
    if (this.window && !this.window.isDestroyed()) {
      return
    }

    this.ready = false

    // Read sound file and encode as base64 data URL
    const soundPath = path.join(app.getAppPath(), 'src', 'main', 'assets', 'sounds', SOUND_FILENAME)
    const soundData = fs.readFileSync(soundPath)
    const base64 = soundData.toString('base64')

    const html = `<!DOCTYPE html>
<html><body>
<audio id="cue" src="data:audio/mpeg;base64,${base64}" preload="auto"></audio>
<script>
function play() {
  var a = document.getElementById('cue');
  a.currentTime = 0;
  a.play().catch(function() {});
}
</script>
</body></html>`

    // Hidden window: only exists as an audio playback context.
    // Invisible so no show/hide, no click-through, no always-on-top 
    this.window = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    // Listen for when the HTML page finishes loading.
    // If a play was requested while the page was still loading (pendingPlay), fire it now that the page is ready.
    this.window.webContents.on('did-finish-load', () => {
      this.ready = true
      if (this.pendingPlay) {
        this.pendingPlay = false
        this.play()
      }
    })

    this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  }
}