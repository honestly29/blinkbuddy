import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ReminderPreferencesStore, DEFAULT_REMINDER_PREFERENCES } from '../../src/main/reminder-preferences-store'

let tmpDir: string
let store: ReminderPreferencesStore

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blinkbuddy-test-'))
  store = new ReminderPreferencesStore(tmpDir)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writePrefs(prefs: unknown): void {
  fs.writeFileSync(
    path.join(tmpDir, 'reminder-preferences.json'),
    JSON.stringify(prefs),
    'utf-8',
  )
}

describe('ReminderPreferencesStore', () => {
  // -- Defaults & round-trip --

  it('returns defaults when no file exists', () => {
    expect(store.load()).toEqual(DEFAULT_REMINDER_PREFERENCES)
  })

  it('round-trips save and load', () => {
    const prefs = {
      screenEdgeGlow: { enabled: false, colour: '#ff0000', opacity: 0.8 },
      cornerPopup: { enabled: true, corner: 'top-left' as const },
      audioCue: { enabled: false, soundFile: 'universfield-clear-bell-chime.mp3', volume: 0.3 },
    }
    store.save(prefs)
    expect(store.load()).toEqual(prefs)
  })

  it('returns defaults for corrupted JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'reminder-preferences.json'), 'not json!!', 'utf-8')
    expect(store.load()).toEqual(DEFAULT_REMINDER_PREFERENCES)
  })

  it('returns defaults for non-object JSON', () => {
    writePrefs('hello')
    expect(store.load()).toEqual(DEFAULT_REMINDER_PREFERENCES)
  })

  it('returns defaults for null JSON', () => {
    writePrefs(null)
    expect(store.load()).toEqual(DEFAULT_REMINDER_PREFERENCES)
  })

  // -- Sub-object level --

  it('fills missing sub-objects with defaults', () => {
    writePrefs({ cornerPopup: { enabled: false, corner: 'top-left' } })
    const loaded = store.load()
    expect(loaded.cornerPopup.enabled).toBe(false)
    expect(loaded.cornerPopup.corner).toBe('top-left')
    expect(loaded.screenEdgeGlow).toEqual(DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow)
    expect(loaded.audioCue).toEqual(DEFAULT_REMINDER_PREFERENCES.audioCue)
  })

  it('falls back sub-object when it is not an object', () => {
    writePrefs({ screenEdgeGlow: 'broken', cornerPopup: 42 })
    const loaded = store.load()
    expect(loaded.screenEdgeGlow).toEqual(DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow)
    expect(loaded.cornerPopup).toEqual(DEFAULT_REMINDER_PREFERENCES.cornerPopup)
  })

  // -- screenEdgeGlow field validation --

  it('falls back colour for invalid hex format', () => {
    writePrefs({ screenEdgeGlow: { enabled: true, colour: 'red', opacity: 0.5 } })
    expect(store.load().screenEdgeGlow.colour).toBe(DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow.colour)
  })

  it('falls back colour for shorthand hex', () => {
    writePrefs({ screenEdgeGlow: { enabled: true, colour: '#fff', opacity: 0.5 } })
    expect(store.load().screenEdgeGlow.colour).toBe(DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow.colour)
  })

  it('falls back colour for non-string', () => {
    writePrefs({ screenEdgeGlow: { enabled: true, colour: 123, opacity: 0.5 } })
    expect(store.load().screenEdgeGlow.colour).toBe(DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow.colour)
  })

  it('falls back opacity for negative value', () => {
    writePrefs({ screenEdgeGlow: { enabled: true, colour: '#ff0000', opacity: -0.1 } })
    expect(store.load().screenEdgeGlow.opacity).toBe(DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow.opacity)
  })

  it('falls back opacity for value above 1', () => {
    writePrefs({ screenEdgeGlow: { enabled: true, colour: '#ff0000', opacity: 1.5 } })
    expect(store.load().screenEdgeGlow.opacity).toBe(DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow.opacity)
  })

  it('falls back opacity for non-number', () => {
    writePrefs({ screenEdgeGlow: { enabled: true, colour: '#ff0000', opacity: 'high' } })
    expect(store.load().screenEdgeGlow.opacity).toBe(DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow.opacity)
  })

  it('preserves valid enabled when colour is invalid', () => {
    writePrefs({ screenEdgeGlow: { enabled: false, colour: 'bad', opacity: 0.5 } })
    const glow = store.load().screenEdgeGlow
    expect(glow.enabled).toBe(false)
    expect(glow.colour).toBe(DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow.colour)
    expect(glow.opacity).toBe(0.5)
  })

  // -- cornerPopup field validation --

  it('falls back corner for invalid string', () => {
    writePrefs({ cornerPopup: { enabled: true, corner: 'center' } })
    expect(store.load().cornerPopup.corner).toBe(DEFAULT_REMINDER_PREFERENCES.cornerPopup.corner)
  })

  it('falls back corner for non-string', () => {
    writePrefs({ cornerPopup: { enabled: true, corner: 99 } })
    expect(store.load().cornerPopup.corner).toBe(DEFAULT_REMINDER_PREFERENCES.cornerPopup.corner)
  })

  // -- audioCue field validation --

  it('falls back soundFile for unknown filename', () => {
    writePrefs({ audioCue: { enabled: true, soundFile: 'unknown.mp3', volume: 0.5 } })
    expect(store.load().audioCue.soundFile).toBe(DEFAULT_REMINDER_PREFERENCES.audioCue.soundFile)
  })

  it('falls back soundFile for non-string', () => {
    writePrefs({ audioCue: { enabled: true, soundFile: 42, volume: 0.5 } })
    expect(store.load().audioCue.soundFile).toBe(DEFAULT_REMINDER_PREFERENCES.audioCue.soundFile)
  })

  it('falls back volume for negative value', () => {
    writePrefs({ audioCue: { enabled: true, soundFile: 'dragon-studio-ding.mp3', volume: -0.1 } })
    expect(store.load().audioCue.volume).toBe(DEFAULT_REMINDER_PREFERENCES.audioCue.volume)
  })

  it('falls back volume for value above 1', () => {
    writePrefs({ audioCue: { enabled: true, soundFile: 'dragon-studio-ding.mp3', volume: 2 } })
    expect(store.load().audioCue.volume).toBe(DEFAULT_REMINDER_PREFERENCES.audioCue.volume)
  })

  it('falls back volume for non-number', () => {
    writePrefs({ audioCue: { enabled: true, soundFile: 'dragon-studio-ding.mp3', volume: 'loud' } })
    expect(store.load().audioCue.volume).toBe(DEFAULT_REMINDER_PREFERENCES.audioCue.volume)
  })

  it('preserves valid volume when soundFile is invalid', () => {
    writePrefs({ audioCue: { enabled: true, soundFile: 'nope.wav', volume: 0.7 } })
    const cue = store.load().audioCue
    expect(cue.soundFile).toBe(DEFAULT_REMINDER_PREFERENCES.audioCue.soundFile)
    expect(cue.volume).toBe(0.7)
  })

  // -- Cross-sub-object preservation --

  it('preserves valid sub-objects alongside broken ones', () => {
    writePrefs({
      screenEdgeGlow: 'broken',
      cornerPopup: { enabled: true, corner: 'top-right' },
      audioCue: null,
    })
    const loaded = store.load()
    
    expect(loaded.screenEdgeGlow).toEqual(DEFAULT_REMINDER_PREFERENCES.screenEdgeGlow)
    expect(loaded.cornerPopup).toEqual({ enabled: true, corner: 'top-right' })
    expect(loaded.audioCue).toEqual(DEFAULT_REMINDER_PREFERENCES.audioCue)
  })

  // -- Existing user upgrade --

  it('returns all defaults for empty object', () => {
    writePrefs({})
    expect(store.load()).toEqual(DEFAULT_REMINDER_PREFERENCES)
  })
})
