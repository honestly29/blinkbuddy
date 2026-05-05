/**
 * Tracks blinks during a session and exposes per-minute rate plus
 * inter-blink intervals.
 *
 * Two arrays are kept: `recentBlinks` for the rolling 60-second window
 * (used by the live blink-rate display), and `allBlinks` for the whole
 * session (used to compute inter-blink intervals at session end).
 *
 * All timestamps are Unix timestamps in milliseconds.
 */

const ROLLING_WINDOW_MS = 60_000 

export class BlinkStatsTracker {
  /** Every blink in the session, kept so we can compute inter-blink
   *  intervals at the end. */
  private allBlinks: number[] = []

  /** Blinks in the last 60 seconds, kept separately so the live blink
   *  rate doesn't have to scan the whole session every tick. */
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
   * Returns the count of blinks in the last 60 seconds.
   */
  getBlinksPerMinute(now: number): number {
    this.pruneOldBlinks(now)
    if (this.recentBlinks.length === 0) {
      return 0
    }
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

  /**
   * Drop blinks older than 60 seconds from the rolling window. Iterates
   * over the array from the front and slices off the old entries.
   */
  private pruneOldBlinks(now: number): void {
    const cutoff = now - ROLLING_WINDOW_MS
    // recentBlinks is in oldest-first order, so once we find the
    // first blink within the window, everything before it is sliced off.
    let firstValid = 0
    while (firstValid < this.recentBlinks.length && this.recentBlinks[firstValid] < cutoff) {
      firstValid++
    }
    if (firstValid > 0) {
      this.recentBlinks = this.recentBlinks.slice(firstValid)
    }
  }
}