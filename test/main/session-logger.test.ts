import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SessionLogger } from '../../src/main/session-logger'
import type { SessionSummary } from '../../src/shared/ipc-messages'

let tmpDir: string
let logger: SessionLogger

// Factory that creates a valid SessionSummary with sensible defaults.
const makeSummary = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionStart: '2026-03-11T10:00:00.000Z',
  sessionEnd: '2026-03-11T10:05:00.000Z',
  totalBlinks: 50,
  avgBlinksPerMinute: 10,
  remindersTriggered: 2,
  totalDurationSeconds: 300,
  twentyTwentyBreaksTaken: 0,
  longestGapBetweenBlinks: 12.5,
  blinkRateStdDev: 450,
  ...overrides,
})

beforeEach(() => {
  // Create a fresh temp directory per test, isolated from real app data.
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blinkbuddy-test-'))
  logger = new SessionLogger(tmpDir)
})

afterEach(() => {
  // Clean up temp directory after each test
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('SessionLogger', () => {
  it('returns empty array when no file exists', () => {
    // First-run scenario: sessions.json hasn't been created yet
    expect(logger.getAll()).toEqual([])
  })

  it('appends a session summary and reads it back', () => {
    // Basic round-trip: write one summary, read it back identically
    const summary = makeSummary()
    logger.append(summary)
    expect(logger.getAll()).toEqual([summary])
  })

  it('appends multiple sessions and reads all back', () => {
    // Accumulation: multiple appends build up the array without overwriting
    const s1 = makeSummary({ totalBlinks: 50 })
    const s2 = makeSummary({ totalBlinks: 80, sessionStart: '2026-03-11T11:00:00.000Z' })

    logger.append(s1)
    logger.append(s2)

    const all = logger.getAll()
    expect(all).toHaveLength(2)
    expect(all[0].totalBlinks).toBe(50)   // First appended
    expect(all[1].totalBlinks).toBe(80)   // Second appended
  })

  it('returns empty array for corrupted JSON', () => {
    // Simulate disk corruption or partial write
    fs.writeFileSync(path.join(tmpDir, 'sessions.json'), 'not json!!', 'utf-8')
    expect(logger.getAll()).toEqual([])
  })

  it('returns empty array for non-array JSON', () => {
    // Valid JSON but wrong type (object instead of array)
    fs.writeFileSync(path.join(tmpDir, 'sessions.json'), '{"key": "value"}', 'utf-8')
    expect(logger.getAll()).toEqual([])
  })

  it('recovers after corrupted file by overwriting with new append', () => {
    // append() after corruption reads [] (via getAll()),
    // pushes the new entry, and writes a valid file,
    // overwriting the corrupted data.
    fs.writeFileSync(path.join(tmpDir, 'sessions.json'), 'corrupt', 'utf-8')
    const summary = makeSummary()
    logger.append(summary)
    expect(logger.getAll()).toEqual([summary])
  })

  describe('clear', () => {
    it('empties the log file after sessions have been appended', () => {
      logger.append(makeSummary())
      logger.append(makeSummary({ totalBlinks: 80 }))

      logger.clear()

      expect(logger.getAll()).toEqual([])
      const raw = fs.readFileSync(path.join(tmpDir, 'sessions.json'), 'utf-8')
      expect(JSON.parse(raw)).toEqual([])
    })

    it('creates an empty log file when none exists', () => {
      const filePath = path.join(tmpDir, 'sessions.json')
      expect(fs.existsSync(filePath)).toBe(false)
      expect(() => logger.clear()).not.toThrow()
      expect(fs.existsSync(filePath)).toBe(true)
      expect(logger.getAll()).toEqual([])
    })
  })
})