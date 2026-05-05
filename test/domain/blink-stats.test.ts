import { describe, it, expect, beforeEach } from 'vitest'
import { BlinkStatsTracker } from '../../src/domain/blink-stats'

describe('BlinkStatsTracker', () => {
  let stats: BlinkStatsTracker

  beforeEach(() => {
    stats = new BlinkStatsTracker()
  })



  describe('getBlinksPerMinute', () => {
    it('returns 0 with no blinks recorded', () => {
      expect(stats.getBlinksPerMinute(10_000)).toBe(0)
    })

    it('records 10 blinks in 30 seconds -> returns 10 (count in rolling window)', () => {
      const start = 0
      // 10 blinks spread over 30 seconds
      for (let i = 0; i < 10; i++) {
        stats.recordBlink(start + i * 3_000)
      }
      // Query at 30s - all 10 blinks are within the 60s window
      expect(stats.getBlinksPerMinute(30_000)).toBe(10)
    })

    it('blinks older than 60 seconds are excluded from the rolling window', () => {
      // Record 5 blinks at t=0s through t=4s
      for (let i = 0; i < 5; i++) {
        stats.recordBlink(i * 1_000)
      }
      // Record 3 blinks at t=62s through t=64s
      for (let i = 0; i < 3; i++) {
        stats.recordBlink(62_000 + i * 1_000)
      }

      // Query at t=65s - only the 3 recent blinks should be in window
      // (the first 5 at t=0-4s are older than 60s from now=65s)
      expect(stats.getBlinksPerMinute(65_000)).toBe(3)
    })

    it('all blinks within 60s are counted', () => {
      // Record 20 blinks over 50 seconds
      for (let i = 0; i < 20; i++) {
        stats.recordBlink(i * 2_500)
      }
      // Query at 50s - all 20 within the 60s window
      expect(stats.getBlinksPerMinute(50_000)).toBe(20)
    })
  })


  describe('getTotalBlinks', () => {
    it('returns 0 initially', () => {
      expect(stats.getTotalBlinks()).toBe(0)
    })

    it('increments correctly across the full session', () => {
      stats.recordBlink(1_000)
      stats.recordBlink(5_000)
      stats.recordBlink(10_000)
      expect(stats.getTotalBlinks()).toBe(3)
    })

    it('total count is not affected by rolling window pruning', () => {
      // Record 5 blinks early
      for (let i = 0; i < 5; i++) {
        stats.recordBlink(i * 1_000)
      }
      // Record 3 blinks later
      for (let i = 0; i < 3; i++) {
        stats.recordBlink(70_000 + i * 1_000)
      }

      // Total should be 8 even though early blinks are outside rolling window
      expect(stats.getTotalBlinks()).toBe(8)

      // Trigger pruning by querying blinks per minute
      stats.getBlinksPerMinute(75_000)

      // Total still 8
      expect(stats.getTotalBlinks()).toBe(8)
    })
  })



  describe('getInterBlinkIntervals', () => {
    it('returns empty array with no blinks', () => {
      expect(stats.getInterBlinkIntervals()).toEqual([])
    })

    it('returns empty array with one blink', () => {
      stats.recordBlink(1_000)
      expect(stats.getInterBlinkIntervals()).toEqual([])
    })

    it('returns correct gaps between consecutive blinks', () => {
      stats.recordBlink(1_000)
      stats.recordBlink(4_000)
      stats.recordBlink(10_000)

      expect(stats.getInterBlinkIntervals()).toEqual([3_000, 6_000])
    })

    it('includes intervals for all session blinks (not just rolling window)', () => {
      stats.recordBlink(0)
      stats.recordBlink(5_000)
      stats.recordBlink(70_000) // outside 60s window from t=0

      // Trigger pruning
      stats.getBlinksPerMinute(75_000)

      // Intervals should still include all 3 blinks
      expect(stats.getInterBlinkIntervals()).toEqual([5_000, 65_000])
    })
  })



  describe('reset', () => {
    it('clears all data', () => {
      stats.recordBlink(1_000)
      stats.recordBlink(5_000)
      stats.recordBlink(10_000)

      stats.reset()

      expect(stats.getTotalBlinks()).toBe(0)
      expect(stats.getBlinksPerMinute(20_000)).toBe(0)
      expect(stats.getInterBlinkIntervals()).toEqual([])
    })
  })
})