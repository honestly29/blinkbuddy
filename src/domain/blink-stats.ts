/**
 * Rolling window blink counter with per-minute rate calculation
 * and inter-blink interval tracking.
 *
 * All timestamps in milliseconds.
 */

const ROLLING_WINDOW_MS = 60_000 // 60 seconds

export class BlinkStatsTracker {
  /** All blink timestamps for the session (for inter-blink intervals). */
  private allBlinks: number[] = []

  /** Rolling window of recent blink timestamps (last 60s). */
  private recentBlinks: number[] = []

  /** Session total blink count. */
  private totalCount = 0

  /** Record a blink at the given timestamp. */
  recordBlink(timestamp: number): void {
    this.allBlinks.push(timestamp)
    this.recentBlinks.push(timestamp)
    this.totalCount++
  }

  /**
   * Returns the rolling blink rate (blinks per minute).
   * Only counts blinks within the last 60 seconds.
   */
  getBlinksPerMinute(now: number): number {
    this.pruneOldBlinks(now)

    if (this.recentBlinks.length === 0) {
      return 0
    }

    // Count blinks in the rolling window
    return this.recentBlinks.length
  }

  /** Returns the total number of blinks in the session. */
  getTotalBlinks(): number {
    return this.totalCount
  }

  /**
   * Returns the gaps (in ms) between consecutive blinks across the
   * entire session (not just the rolling window).
   */
  getInterBlinkIntervals(): number[] {
    const intervals: number[] = []
    for (let i = 1; i < this.allBlinks.length; i++) {
      intervals.push(this.allBlinks[i] - this.allBlinks[i - 1])
    }
    return intervals
  }

  /** Clears all recorded data. */
  reset(): void {
    this.allBlinks = []
    this.recentBlinks = []
    this.totalCount = 0
  }

  /** Remove blinks older than 60 seconds from the rolling window. */
  private pruneOldBlinks(now: number): void {
    const cutoff = now - ROLLING_WINDOW_MS
    // recentBlinks is always in chronological order, so find the first index that is >= cutoff and slice.
    let firstValid = 0
    while (firstValid < this.recentBlinks.length && this.recentBlinks[firstValid] < cutoff) {
      firstValid++
    }
    if (firstValid > 0) {
      this.recentBlinks = this.recentBlinks.slice(firstValid)
    }
  }
}