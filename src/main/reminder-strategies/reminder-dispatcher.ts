import type { ReminderStrategy } from './types'

/**
 * Forwards reminder state changes to every registered strategy
 *
 * The session manager calls update() on every state change, which means
 * update() is called repeatedly while the user is overdue. The dispatcher
 * detects the actual transitions (false -> true and true -> false) and only
 * calls onReminderStart/onReminderEnd on strategies when the state changes,
 * so strategies don't need to track this themselves.
 */
export class ReminderDispatcher {
  private strategies: ReminderStrategy[]
  // Stores the last `active` value that update() was called with. Used to detect changes.
  private wasActive = false

  constructor(strategies: ReminderStrategy[] = []) {
    this.strategies = strategies
  }

  /**
   * Called by SessionManager after each state transition.
   * Compares the new `active` value with the previous one to detect transitions.
   */
  update(active: boolean): void {
    if (active && !this.wasActive) {
      // inactive -> active (reminder just became overdue)
      this.wasActive = true
      for (const s of this.strategies) {
        s.onReminderStart()
      }
    } else if (!active && this.wasActive) {
      // active -> inactive (user blinked or face lost)
      this.wasActive = false
      for (const s of this.strategies) {
        s.onReminderEnd()
      }
    }
    // If `active` matches `wasActive`, do nothing.
  }

  // Used by Session Manager to fetch the overlay strategy so it can read the strategy's `active` field.
  getStrategy<T extends ReminderStrategy>(id: string): T | undefined {
    return this.strategies.find((s) => s.id === id) as T | undefined
  }

  get isActive(): boolean {
    return this.wasActive
  }

  get strategyCount(): number {
    return this.strategies.length
  }

  // Register a new strategy at runtime. 
  // If a reminder is already showing when this is called, 
  // the new strategy is immediately started, so it catches
  // up with the strategies that were already active.
  addStrategy(strategy: ReminderStrategy): void {
    this.strategies.push(strategy)
    if (this.wasActive) {
      strategy.onReminderStart()
    }
  }

  // Remove a strategy by id. 
  // Returns true if a strategy was removed, or false if
  // no strategy with that id was registered. 
  // If a reminder is currently showing, onReminderEnd() is
  // called first so the strategy can hide its window before being disposed.
  removeStrategy(id: string): boolean {
    const index = this.strategies.findIndex((s) => s.id === id)
    if (index === -1) return false

    const strategy = this.strategies[index]

    if (this.wasActive) {
      strategy.onReminderEnd()
    }
    strategy.dispose()

    this.strategies.splice(index, 1)
    return true
  }
  
  // Force every strategy back into the inactive state. 
  // Used on session start/stop/teardown to ensure no reminder is left showing when the session ends.
  deactivate(): void {
    if (this.wasActive) {
      this.wasActive = false
      for (const s of this.strategies) {
        s.onReminderEnd()
      }
    }
  }

  // Called on app quit. Ensures every strategy's BrowserWindow and other
  // resources are released before Electron exits.
  dispose(): void {
    this.deactivate()
    for (const s of this.strategies) {
      s.dispose()
    }
  }
}