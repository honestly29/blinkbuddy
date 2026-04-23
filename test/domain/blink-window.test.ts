import { describe, it, expect, beforeEach } from 'vitest'
import { BlinkWindow } from '../../src/domain/blink-window'

describe('BlinkWindow', () => {
  let window: BlinkWindow

  beforeEach(() => {
    window = new BlinkWindow(20) // 20-second window
  })

  it('isOverdue returns false immediately after reset()', () => {
    const now = 1000
    window.reset(now)
    expect(window.isOverdue(now)).toBe(false)
  })

  it('isOverdue returns true after T seconds with no blinks', () => {
    const start = 1000
    window.reset(start)
    // 20 seconds later (20_000 ms)
    expect(window.isOverdue(start + 20_000)).toBe(true)
  })

  it('isOverdue returns false just before T seconds', () => {
    const start = 1000
    window.reset(start)
    expect(window.isOverdue(start + 19_999)).toBe(false)
  })

  it('isOverdue at exactly T seconds returns true (boundary)', () => {
    const start = 0
    window.reset(start)
    expect(window.isOverdue(20_000)).toBe(true)
  })

  it('recordBlink resets the overdue timer', () => {
    const start = 0
    window.reset(start)
    // 15 seconds in - not overdue
    expect(window.isOverdue(15_000)).toBe(false)

    // Record a blink at 15s
    window.recordBlink(15_000)

    // 10 seconds after blink (25s total) - not overdue (only 10s since last blink)
    expect(window.isOverdue(25_000)).toBe(false)

    // 20 seconds after blink (35s total) - overdue
    expect(window.isOverdue(35_000)).toBe(true)
  })

  it('setWindowSeconds clamps below minimum (5)', () => {
    window.setWindowSeconds(2)
    expect(window.getWindowSeconds()).toBe(5)
  })

  it('setWindowSeconds clamps above maximum (300)', () => {
    window.setWindowSeconds(500)
    expect(window.getWindowSeconds()).toBe(300)
  })

  it('setWindowSeconds accepts values within range', () => {
    window.setWindowSeconds(60)
    expect(window.getWindowSeconds()).toBe(60)
  })

  it('setWindowSeconds affects overdue calculation', () => {
    window.setWindowSeconds(10) // 10-second window
    const start = 0
    window.reset(start)

    expect(window.isOverdue(9_999)).toBe(false)
    expect(window.isOverdue(10_000)).toBe(true)
  })

  it('rapid blink sequence does not produce false overdue', () => {
    const start = 0
    window.reset(start)

    // Blink every 2 seconds for 30 seconds
    for (let t = 2_000; t <= 30_000; t += 2_000) {
      window.recordBlink(t)
      expect(window.isOverdue(t)).toBe(false)
    }

    // Still not overdue at 30s since last blink was at 30s
    expect(window.isOverdue(30_000)).toBe(false)

    // Overdue 20s after the last blink
    expect(window.isOverdue(50_000)).toBe(true)
  })

  it('uses default window of 20 seconds', () => {
    const defaultWindow = new BlinkWindow()
    expect(defaultWindow.getWindowSeconds()).toBe(20)
  })

  it('isStarted is false on a freshly constructed window', () => {
    expect(window.isStarted()).toBe(false)
  })

  it('isOverdue returns false on an unstarted window for any timestamp', () => {
    expect(window.isOverdue(0)).toBe(false)
    expect(window.isOverdue(1_000_000)).toBe(false)
    expect(window.isOverdue(Number.MAX_SAFE_INTEGER)).toBe(false)
  })

  it('reset() starts the clock', () => {
    window.reset(1000)
    expect(window.isStarted()).toBe(true)
  })

  it('recordBlink() starts the clock', () => {
    window.recordBlink(1000)
    expect(window.isStarted()).toBe(true)
  })
})