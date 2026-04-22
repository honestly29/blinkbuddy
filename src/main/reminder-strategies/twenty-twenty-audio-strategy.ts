import { BrowserWindow, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type { ReminderStrategy } from './types'

// Sound file names in src/main/assets/sounds.
const START_SOUND_FILE = 'universfield-clear-bell-chime.mp3'
const END_SOUND_FILE = 'universfield-system-notification.mp3'
const DEFAULT_VOLUME = 0.5

type PendingCue = 'start' | 'end' | null

export class TwentyTwentyAudioStrategy implements ReminderStrategy {
  readonly id = 'twenty-twenty-audio'
  private window: BrowserWindow | null = null
  private ready = false
  // Holds the single most recent cue requested before the page is ready.
  private pendingPlay: PendingCue = null
  private volume = DEFAULT_VOLUME

  onReminderStart(): void {
    this.ensureWindow()
    if (this.ready) {
      this.play('start')
    } else {
      // Page still loading - queue the cue to play once ready.
      this.pendingPlay = 'start'
    }
  }

  onReminderEnd(): void {
    this.ensureWindow()
    if (this.ready) {
      this.play('end')
    } else {
      this.pendingPlay = 'end'
    }
  }

  /**
 * User cancelled the break. The dispatcher calls this instead of onReminderEnd, so no end cue plays. 
 * Also drop any start cue that's still queued but hasn't played yet 
 * (possible if the cancel arrives during the narrow window before the audio page finishes loading).
 */
  onReminderCancel(): void {
    this.pendingPlay = null
  }

  configure(options: Record<string, unknown>): void {
    // Validate volume is in the [0, 1] range audio elements accept.
    if (typeof options.volume === 'number' && options.volume >= 0 && options.volume <= 1) {
      this.volume = options.volume

      // Live-update both audio elements in the existing window so a
      // volume change mid-session takes effect on the very next cue.
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents
          .executeJavaScript(
            `document.getElementById('startCue').volume = ${this.volume}; document.getElementById('endCue').volume = ${this.volume};`,
          )
          .catch(() => {})
      }
    }
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
    this.window = null
    this.ready = false
    this.pendingPlay = null
  }

  /** Trigger the hidden audio page to play the start or end audio cue. */
  private play(which: 'start' | 'end'): void {
    if (this.window && !this.window.isDestroyed()) {
      const fn = which === 'start' ? 'playStart()' : 'playEnd()'
      this.window.webContents.executeJavaScript(fn).catch(() => {})
    }
  }

  private ensureWindow(): void {
    if (this.window && !this.window.isDestroyed()) {
      return
    }

    this.ready = false

    // Load both sounds off disk once and embed them as base64 data URIs.
    const soundsDir = path.join(app.getAppPath(), 'src', 'main', 'assets', 'sounds')
    const startBase64 = fs.readFileSync(path.join(soundsDir, START_SOUND_FILE)).toString('base64')
    const endBase64 = fs.readFileSync(path.join(soundsDir, END_SOUND_FILE)).toString('base64')

    const html = `<!DOCTYPE html>
<html><body>
<audio id="startCue" src="data:audio/mpeg;base64,${startBase64}" preload="auto"></audio>
<audio id="endCue" src="data:audio/mpeg;base64,${endBase64}" preload="auto"></audio>
<script>
// Set initial volume on both elements at load time so the very first cue plays at the configured level.
document.getElementById('startCue').volume = ${this.volume};
document.getElementById('endCue').volume = ${this.volume};
function playStart() {
  var a = document.getElementById('startCue');
  a.currentTime = 0;
  a.play().catch(function() {});
}
function playEnd() {
  var a = document.getElementById('endCue');
  a.currentTime = 0;
  a.play().catch(function() {});
}
</script>
</body></html>`

    // Hidden BrowserWindow 
    this.window = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    this.window.webContents.on('did-finish-load', () => {
      this.ready = true
      if (this.pendingPlay !== null) {
        const which = this.pendingPlay
        this.pendingPlay = null
        this.play(which)
      }
    })

    this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  }
}