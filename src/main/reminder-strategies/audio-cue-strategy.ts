import { BrowserWindow, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type { ReminderStrategy } from './types'
import type { ReminderStrategyId } from '../../shared/reminder-strategies'

const VALID_SOUND_FILES = [
  'dragon-studio-ding.mp3',
  'universfield-clear-bell-chime.mp3',
  'universfield-system-notification.mp3',
]

/**
 * Plays a short sound when a reminder fires.
 *
 * Electron's main process has no audio API, so the strategy creates
 * an invisible BrowserWindow that hosts an HTML <audio> element. The
 * sound file is read from disk and embedded into the HTML as a base64
 * data URL, so the page can play it without any further file access.
 */
export class AudioCueStrategy implements ReminderStrategy {
  readonly id: ReminderStrategyId = 'audio-cue'
  private window: BrowserWindow | null = null
  private ready = false
  private pendingPlay = false
  private soundFile = 'dragon-studio-ding.mp3'
  private volume = 0.5
  // True if the current sound file failed to load. Causes ensureWindow
  // to skip the load and reminders to play nothing. Resets when the
  // user picks a different sound file.
  private failed = false

  onReminderStart(): void {
    this.ensureWindow()
    if (this.ready) {
      this.play()
    } else {
      this.pendingPlay = true
    }
  }

  onReminderEnd(): void {
    // Empty: the sound is short and plays to completion on its own. 
  }

  configure(options: Record<string, unknown>): void {
    // Changing the sound file requires rebuilding the window because
    // the file is embedded in the HTML. Dispose the existing window,
    // ensureWindow() will create a fresh one with the new file next
    // time a reminder fires. (Update the field BEFORE disposing so the
    // next ensureWindow() call reads the new filename.)
    const soundFileChanged =
      typeof options.soundFile === 'string' &&
      VALID_SOUND_FILES.includes(options.soundFile) &&
      options.soundFile !== this.soundFile

    if (soundFileChanged) {
      this.soundFile = options.soundFile as string
      this.dispose()
    }

    if (typeof options.volume === 'number' && options.volume >= 0 && options.volume <= 1) {
      this.volume = options.volume

      // Skip the live update if the file just changed: the window was
      // disposed above, and the new window will read the current
      // volume when it loads.
      if (!soundFileChanged && this.window && !this.window.isDestroyed()) {
        this.window.webContents
          .executeJavaScript(`document.getElementById('cue').volume = ${this.volume}`)
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
    this.pendingPlay = false
    this.failed = false
  }

  private play(): void {
    if (this.window && !this.window.isDestroyed()) {
      // Calls the global play() function defined in the window's HTML.
      this.window.webContents.executeJavaScript('play()').catch(() => {})
    }
  }

  private ensureWindow(): void {
    if (this.window && !this.window.isDestroyed()) {
      return
    }
    // Early exit if a previous load failed; see `failed` field above.
    if (this.failed) {
      return
    }

    this.ready = false

    // Read the sound file from disk and encode it as base64 to embed
    // in the HTML as a data URL.
    const soundPath = path.join(app.getAppPath(), 'src', 'main', 'assets', 'sounds', this.soundFile)
    let base64: string
    try {
      base64 = fs.readFileSync(soundPath).toString('base64')
    } catch (err) {
      // File missing, unreadable, or any other I/O error. Mark as
      // failed, clear any queued playback, and log one warning. The
      // app keeps running; the user just won't hear audio cues.
      this.failed = true
      this.pendingPlay = false
      console.warn(`[AudioCueStrategy] Failed to load sound "${this.soundFile}" from ${soundPath}; audio cues disabled.`, err)
      return
    }

    // The volume assignment in the inline <script> sets the current
    // volume as soon as the page loads, before any play() call. 
    const html = `<!DOCTYPE html>
        <html><body>
        <audio id="cue" src="data:audio/mpeg;base64,${base64}" preload="auto"></audio>
        <script>
        document.getElementById('cue').volume = ${this.volume};
        function play() {
        var a = document.getElementById('cue');
        a.currentTime = 0;
        a.play().catch(function() {});
        }
        </script>
        </body></html>`


    this.window = new BrowserWindow({
      // Hidden window: this is purely for audio playback, never seen. 
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })

    // did-finish-load fires after the HTML has been parsed and any
    // inline <script> has finished running. By that point, the
    // play() function exists and the volume has been set.
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