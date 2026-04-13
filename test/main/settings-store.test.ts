import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SettingsStore, DEFAULT_SETTINGS } from '../../src/main/settings-store'

let tmpDir: string
let store: SettingsStore

beforeEach(() => {
  // Create a fresh temporary directory for each test
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blinkbuddy-test-'))
  store = new SettingsStore(tmpDir)
})

afterEach(() => {
  // Clean up the temp directory after each test to prevent disk clutter
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('SettingsStore', () => {
  it('returns defaults when no file exists', () => {
    // First-run scenario: settings.json hasn't been created yet
    expect(store.load()).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips save and load', () => {
    // Verify that saving then loading returns the exact same values
    const settings = {
      blinkWindowSeconds: 30,
      cameraIndex: 1,
      previewEnabled: true,
      twentyTwentyEnabled: false,
    }

    store.save(settings)
    expect(store.load()).toEqual(settings)
  })

  it('returns defaults for corrupted JSON', () => {
    // Simulate a corrupted file (e.g. disk error, partial write)
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), 'not json!!', 'utf-8')
    expect(store.load()).toEqual(DEFAULT_SETTINGS)
  })

  it('returns defaults for non-object JSON', () => {
    // A valid JSON value that isn't an object (e.g. a string, number, array)
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), '"hello"', 'utf-8')
    expect(store.load()).toEqual(DEFAULT_SETTINGS)
  })

  // -- Per-field validation tests --
  // These verify that one invalid field falls back to its default
  // without affecting other valid fields in the same file.
  it('falls back per-field for out-of-range blinkWindowSeconds', () => {
    const settings = { ...DEFAULT_SETTINGS, blinkWindowSeconds: -5 }
    store.save(settings)
    const loaded = store.load()
    expect(loaded.blinkWindowSeconds).toBe(DEFAULT_SETTINGS.blinkWindowSeconds)  // Fell back
    expect(loaded.cameraIndex).toBe(DEFAULT_SETTINGS.cameraIndex)  // Preserved
  })

  it('falls back per-field for blinkWindowSeconds above max', () => {
    const settings = { ...DEFAULT_SETTINGS, blinkWindowSeconds: 500 }
    store.save(settings)
    expect(store.load().blinkWindowSeconds).toBe(DEFAULT_SETTINGS.blinkWindowSeconds)
  })

  it('falls back per-field for negative cameraIndex', () => {
    const settings = { ...DEFAULT_SETTINGS, cameraIndex: -1 }
    store.save(settings)
    expect(store.load().cameraIndex).toBe(DEFAULT_SETTINGS.cameraIndex)
  })

  it('falls back per-field for non-integer cameraIndex', () => {
    // Camera indices must be whole numbers (0, 1, 2, ...), not floats
    const settings = { ...DEFAULT_SETTINGS, cameraIndex: 1.5 }
    store.save(settings as any)
    expect(store.load().cameraIndex).toBe(DEFAULT_SETTINGS.cameraIndex)
  })

  it('falls back per-field for non-boolean previewEnabled', () => {
    // Write a string "yes" instead of boolean true to simulate a manual edit
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({ ...DEFAULT_SETTINGS, previewEnabled: 'yes' }),
      'utf-8',
    )
    expect(store.load().previewEnabled).toBe(DEFAULT_SETTINGS.previewEnabled)
  })

  it('preserves valid fields when other fields are invalid', () => {
    // Only the invalid field (blinkWindowSeconds) should fall back.
    // The three valid fields must be preserved as-is.
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({
        blinkWindowSeconds: -5,      // Invalid: below minimum
        cameraIndex: 2,              // Valid
        previewEnabled: true,        // Valid
        twentyTwentyEnabled: false,  // Valid
      }),
      'utf-8',
    )
    const loaded = store.load()
    expect(loaded.blinkWindowSeconds).toBe(DEFAULT_SETTINGS.blinkWindowSeconds)   // Fell back
    expect(loaded.cameraIndex).toBe(2)  // Preserved
    expect(loaded.previewEnabled).toBe(true)  // Preserved
    expect(loaded.twentyTwentyEnabled).toBe(false)  // Preserved
  })
})