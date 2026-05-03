import { BrowserWindow, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type { ReminderStrategy } from './types'
import type { ReminderStrategyId } from '../../shared/reminder-strategies'

// Sound file names in src/main/assets/sounds.
const START_SOUND_FILE = 'universfield-clear-bell-chime.mp3'
const END_SOUND_FILE = 'universfield-system-notification.mp3'
const DEFAULT_VOLUME = 0.5

type PendingCue = 'start' | 'end' | null

export class TwentyTwentyAudioStrategy implements ReminderStrategy {
  readonly id: ReminderStrategyId = 'twenty-twenty-audio'
  private window: BrowserWindow | null = null
  private ready = false
  // Holds a cue requested before the audio page has finished loading.
  // Used on the first cue of a session; did-finish-load plays it once
  // the page is ready.
  private pendingPlay: PendingCue = null
  private volume = DEFAULT_VOLUME
  // True if the sound files failed to load. ensureWindow early-returns
  // and cues are silently skipped. The sounds are hardcoded, so unlike
  // the audio-cue strategy there's no recovery until dispose is called.
  private failed = false


  onReminderStart(): void {
    this.ensureWindow()
    if (this.ready) {
      this.play('start')
    } else {
      this.pendingPlay = 'start'  // queue if not ready
    }
  }

  onReminderEnd(): void {
    this.ensureWindow()
    if (this.ready) {
      this.play('end')
    } else {
      this.pendingPlay = 'end'  // queue if not ready
    }
  }


  /**
  * User cancelled the break. The dispatcher calls this instead of
  * onReminderEnd, so no end cue plays. Also drops any pending cue,
  * since cancel means we want silence regardless of what was queued. */
  onReminderCancel(): void {
    this.pendingPlay = null
  }

  configure(options: Record<string, unknown>): void {
    // Validate volume is in the [0, 1] range audio elements accept.
    if (typeof options.volume === 'number' && options.volume >= 0 && options.volume <= 1) {
      this.volume = options.volume

      // Volume changes apply immediately to both audio elements, so the
      // next cue plays at the new volume (whether that's the end cue of
      // the current break, or any cue in a future break).
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
    this.failed = false
  }

  // Triggers the start or end cue to play in the hidden audio page.
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
    if (this.failed) {
      return
    }

    this.ready = false

    // Load both sounds off disk once and embed them as base64 data URIs.
    const soundsDir = path.join(app.getAppPath(), 'src', 'main', 'assets', 'sounds')
    let startBase64: string
    let endBase64: string
    try {
      startBase64 = fs.readFileSync(path.join(soundsDir, START_SOUND_FILE)).toString('base64')
      endBase64 = fs.readFileSync(path.join(soundsDir, END_SOUND_FILE)).toString('base64')
    } catch (err) {
      this.failed = true
      this.pendingPlay = null
      console.warn(`[TwentyTwentyAudioStrategy] Failed to load break sounds from ${soundsDir}; 20-20-20 audio cues disabled.`, err)
      return
    }

    const html = `<!DOCTYPE html>
<html><body>
<audio id="startCue" src="data:audio/mpeg;base64,${startBase64}" preload="auto"></audio>
<audio id="endCue" src="data:audio/mpeg;base64,${endBase64}" preload="auto"></audio>
<script>
// Set initial volume on both elements at load time so the very first
// cue plays at the configured level.
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

    // Hidden window: this is purely for audio playback, never seen.
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