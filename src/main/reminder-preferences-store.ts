import fs from 'node:fs'
import path from 'node:path'
import type { ReminderPreferences, CornerPosition } from '../shared/ipc-messages'

// The factory defaults. These are used in three places:
//   1. When the preferences file doesn't exist yet (first run).
//   2. When the file is corrupted or missing fields.
//   3. As a safety net when validation rejects an invalid value.
export const DEFAULT_REMINDER_PREFERENCES: ReminderPreferences = {
  screenEdgeGlow: { enabled: true, colour: '#38bdf8', opacity: 0.3 },
  cornerPopup: { enabled: true, corner: 'bottom-right' },
  audioCue: { enabled: true, soundFile: 'dragon-studio-ding.mp3', volume: 0.5 },
}

const VALID_CORNERS: CornerPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

const VALID_SOUND_FILES = [
  'dragon-studio-ding.mp3',
  'universfield-clear-bell-chime.mp3',
  'universfield-system-notification.mp3',
]

const PREFERENCES_FILE = 'reminder-preferences.json'


/**
 * Persists reminder preferences to a JSON file in the app's userData directory.
 *
 * Used by:
 *   - index.ts on startup to decide which strategies to register.
 *   - IPC handlers when the user toggles/changes settings in the UI.
 *
 * Validation is done per-field, so a single bad value 
 * in the file doesn't wipe out the user's other valid settings.
 */
export class ReminderPreferencesStore {
  private filePath: string

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, PREFERENCES_FILE)
  }

  load(): ReminderPreferences {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      return this.validate(parsed)
    } catch {
      // Any failure (file missing, unreadable, invalid JSON) falls back to defaults.
      return this.copyDefaults()
    }
  }

  save(prefs: ReminderPreferences): void {
    fs.writeFileSync(this.filePath, JSON.stringify(prefs, null, 2), 'utf-8')
  }

  // Returns a fresh copy of the defaults.
  private copyDefaults(): ReminderPreferences {
    return {
      screenEdgeGlow: { ...DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow },
      cornerPopup: { ...DEFAULT_REMINDER_PREFERENCES.cornerPopup },
      audioCue: { ...DEFAULT_REMINDER_PREFERENCES.audioCue },
    }
  }

  // Top-level validator
  private validate(parsed: unknown): ReminderPreferences {
    if (typeof parsed !== 'object' || parsed === null) {
      return this.copyDefaults()
    }

    const obj = parsed as Record<string, unknown>

    // Validate each reminder type separetly 
    return {
      screenEdgeGlow: this.validateScreenEdgeGlow(obj.screenEdgeGlow),
      cornerPopup: this.validateCornerPopup(obj.cornerPopup),
      audioCue: this.validateAudioCue(obj.audioCue),
    }
  }

  private validateScreenEdgeGlow(raw: unknown): ReminderPreferences['screenEdgeGlow'] {
    if (typeof raw !== 'object' || raw === null) {
      return { ...DEFAULT_REMINDER_PREFERENCES.overlay }
    }
    const obj = raw as Record<string, unknown>

    const enabled =
      typeof obj.enabled === 'boolean'
        ? obj.enabled
        : DEFAULT_REMINDER_PREFERENCES.overlay.enabled

    return { enabled }
  }

  private validateScreenEdgeGlow(raw: unknown): ReminderPreferences['screenEdgeGlow'] {
    if (typeof raw !== 'object' || raw === null) {
      return { ...DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow }
    }
    const obj = raw as Record<string, unknown>

    const enabled =
      typeof obj.enabled === 'boolean'
        ? obj.enabled
        : DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow.enabled

    // Colour must be exactly "#RRGGBB".
    const colour =
      typeof obj.colour === 'string' && /^#[0-9a-fA-F]{6}$/.test(obj.colour)
        ? obj.colour
        : DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow.colour

    // Opacity must be in [0, 1] range.
    const opacity =
      typeof obj.opacity === 'number' && obj.opacity >= 0 && obj.opacity <= 1
        ? obj.opacity
        : DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow.opacity

    return { enabled, colour, opacity }
  }

  private validateCornerPopup(raw: unknown): ReminderPreferences['cornerPopup'] {
    if (typeof raw !== 'object' || raw === null) {
      return { ...DEFAULT_REMINDER_PREFERENCES.cornerPopup }
    }
    const obj = raw as Record<string, unknown>

    const enabled =
      typeof obj.enabled === 'boolean'
        ? obj.enabled
        : DEFAULT_REMINDER_PREFERENCES.cornerPopup.enabled

    const corner =
      typeof obj.corner === 'string' && VALID_CORNERS.includes(obj.corner as CornerPosition)
        ? (obj.corner as CornerPosition)
        : DEFAULT_REMINDER_PREFERENCES.cornerPopup.corner

    return { enabled, corner }
  }

  private validateAudioCue(raw: unknown): ReminderPreferences['audioCue'] {
    if (typeof raw !== 'object' || raw === null) {
      return { ...DEFAULT_REMINDER_PREFERENCES.audioCue }
    }
    const obj = raw as Record<string, unknown>

    const enabled =
      typeof obj.enabled === 'boolean'
        ? obj.enabled
        : DEFAULT_REMINDER_PREFERENCES.audioCue.enabled

    // Sound file is validated against the allowlist of MP3s.
    const soundFile =
      typeof obj.soundFile === 'string' && VALID_SOUND_FILES.includes(obj.soundFile)
        ? obj.soundFile
        : DEFAULT_REMINDER_PREFERENCES.audioCue.soundFile

    const volume =
      typeof obj.volume === 'number' && obj.volume >= 0 && obj.volume <= 1
        ? obj.volume
        : DEFAULT_REMINDER_PREFERENCES.audioCue.volume

    return { enabled, soundFile, volume }
  }
}