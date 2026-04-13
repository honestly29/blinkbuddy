import fs from 'node:fs'
import path from 'node:path'
import type { UserSettings } from '../shared/ipc-messages'

// defaults for all user-configurable settings
// Exported so tests can reference these values without hardcoding them
export const DEFAULT_SETTINGS: UserSettings = {
  blinkWindowSeconds: 20,
  cameraIndex: 0,
  previewEnabled: false,
  twentyTwentyEnabled: true,
}

// Filename within Electron's userData directory (e.g. ~/Library/Application Support/BlinkBuddy/)
const SETTINGS_FILE = 'settings.json'

// Reads and writes user preferences to a JSON file on disk.
export class SettingsStore {
  private filePath: string

  constructor(userDataPath: string) {
    // Build the full path
    this.filePath = path.join(userDataPath, SETTINGS_FILE)
  }

   /**
   * Load settings from disk. Returns defaults if the file doesn't exist (first run)
   * or contains invalid JSON (corruption, manual editing).
   * The try/catch handles both cases so the app always starts cleanly.
   */
  load(): UserSettings {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      // Validate each field independently; invalid fields fall back
      // to defaults while preserving the user's other valid preferences
      return this.validate(parsed)
    } catch {
      // File doesn't exist (first run) or JSON is malformed
      return { ...DEFAULT_SETTINGS }
    }
  }

  // Write settings to disk synchronously
  // The (null, 2) arguments produce indented JSON for human readability
  save(settings: UserSettings): void {
    fs.writeFileSync(this.filePath, JSON.stringify(settings, null, 2), 'utf-8')
  }


  /**
   * Per-field validation: each field is checked independently so that
   * one corrupted value (e.g. blinkWindowSeconds set to -5 by manual editing)
   * falls back to its default without discarding the user's other valid preferences.
   */
  private validate(parsed: unknown): UserSettings {
    // Guard: reject anything that isn't a plain object
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_SETTINGS }
    }

    // Cast to a generic record so we can access properties by name
    const obj = parsed as Record<string, unknown>

    // Blink window: must be a number within the allowed range [5, 300]
    const blinkWindowSeconds =
      typeof obj.blinkWindowSeconds === 'number' &&
      obj.blinkWindowSeconds >= 5 &&
      obj.blinkWindowSeconds <= 300
        ? obj.blinkWindowSeconds
        : DEFAULT_SETTINGS.blinkWindowSeconds

    // Camera index: must be a non-negative integer (camera indices are 0, 1, 2, ...)
    const cameraIndex =
      typeof obj.cameraIndex === 'number' &&
      Number.isInteger(obj.cameraIndex) &&
      obj.cameraIndex >= 0
        ? obj.cameraIndex
        : DEFAULT_SETTINGS.cameraIndex

    // Preview: must be a strict boolean (not "true" or 1)
    const previewEnabled =
      typeof obj.previewEnabled === 'boolean'
        ? obj.previewEnabled
        : DEFAULT_SETTINGS.previewEnabled

    // 20-20-20: must be a strict boolean
    const twentyTwentyEnabled =
      typeof obj.twentyTwentyEnabled === 'boolean'
        ? obj.twentyTwentyEnabled
        : DEFAULT_SETTINGS.twentyTwentyEnabled

    return { blinkWindowSeconds, cameraIndex, previewEnabled, twentyTwentyEnabled }
  }
}