import { BrowserWindow, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type { ReminderStrategy } from './types'

const VALID_SOUND_FILES = [
  'dragon-studio-ding.mp3',
  'universfield-clear-bell-chime.mp3',
  'universfield-system-notification.mp3',
]

/**
 * Plays a short sound when a reminder fires.
 *
 * Electron's main process has no direct audio API, so this class creates
 * an invisible BrowserWindow that contains an HTML <audio> element. The
 * sound file is embedded as base64 inside the HTML, which means we don't
 * have to reference the sound file by filesystem path at runtime.
 */
export class AudioCueStrategy implements ReminderStrategy {
  readonly id = 'audio-cue'
  private window: BrowserWindow | null = null
  private ready = false
  private pendingPlay = false
  private soundFile = 'dragon-studio-ding.mp3'
  private volume = 0.5
  // Flipped to true if the sound file can't be loaded.
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
    // Changing the sound file means the current window's HTML is stale,
    // so we dispose the window and let ensureWindow() rebuild it with the new file next time a reminder fires.
    const soundFileChanged =
      typeof options.soundFile === 'string' &&
      VALID_SOUND_FILES.includes(options.soundFile) &&
      options.soundFile !== this.soundFile

    if (soundFileChanged) {
      // Update the field BEFORE disposing, so the next
      // call to ensureWindow() reads the new filename from this.soundFile.
      this.soundFile = options.soundFile as string
      this.dispose()
    }

    if (typeof options.volume === 'number' && options.volume >= 0 && options.volume <= 1) {
      this.volume = options.volume

      // Only update the existing window's volume if the file did not change. 
      // If it did change, the window was already disposed above
      // and the new window will read the current volume when it loads.
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
    // Early exit if a previous load failed
    if (this.failed) {
      return
    }

    this.ready = false

    // Read the sound file from disk and embed it directly into the HTML as a base64 data URL.
    const soundPath = path.join(app.getAppPath(), 'src', 'main', 'assets', 'sounds', this.soundFile)
    let base64: string
    try {
      base64 = fs.readFileSync(soundPath).toString('base64')
    } catch (err) {
      // File missing, unreadable, or any other I/O error. 
      // Mark as failed, clear any queued playback, and log one warning.
      // The app keeps running - the user just won't hear audio cues.
      this.failed = true
      this.pendingPlay = false
      console.warn(`[AudioCueStrategy] Failed to load sound "${this.soundFile}" from ${soundPath}; audio cues disabled.`, err)
      return
    }

    // The volume assignment at the top of the <script> tag sets the current volume as soon as the page loads. 
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
      // show: false keeps this window invisible. 
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })

    // did-finish-load fires after the HTML has been parsed and any top-level <script> has finished running. 
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