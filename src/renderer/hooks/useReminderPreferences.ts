import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReminderPreferences } from '../../shared/ipc-messages'
import type { ReminderStrategyId } from '../../shared/reminder-strategies'

/**
 * Owns the state for the reminder settings panel.
 *
 * Responsibilities:
 *   - Load preferences from the main process on mount.
 *   - Apply changes optimistically: update the UI immediately, then
 *     persist; if the save fails, revert to the previous state.
 *   - Trigger test previews and display any resulting errors.
 *   - Auto-clear error banners after 3 seconds.
 */
export function useReminderPreferences() {
  // `prefs` starts as null; populated by the first useEffect once the
  // saved preferences have been loaded from the main process.  
  const [prefs, setPrefs] = useState<ReminderPreferences | null>(null)

  // The id of the strategy whose Test button is currently running,
  // or null if no test is active. 
  const [testingStrategy, setTestingStrategy] = useState<ReminderStrategyId | null>(null)

  const [testError, setTestError] = useState<string | null>(null)
  
  // Stores the auto-clear timer handle for the test-failure banner. We
  // cancel it when a new failure arrives (so the new banner gets the
  // full 3 seconds) or when the component unmounts.
  const testErrorTimer = useRef<ReturnType<typeof setTimeout>>()

  // Fetch preferences once, on mount.
  useEffect(() => {
    window.blinkBuddy.getReminderPreferences().then(setPrefs)
  }, [])

  // On unmount, cancel any pending error-clear timer so it doesn't
  // try to update a component that no longer exists.
  useEffect(() => {
    return () => {
      if (testErrorTimer.current) clearTimeout(testErrorTimer.current)
    }
  }, [])

  const updatePrefs = useCallback((nextPrefs: ReminderPreferences) => {
    // Optimistic update: apply locally first so toggles feel
    // responsive, then persist. If the save fails, revert to the
    // snapshot of the previous state.
    const prev = prefs
    setPrefs(nextPrefs)

    window.blinkBuddy.updateReminderPreferences(nextPrefs).catch(() => {
      setPrefs(prev)
    })
  }, [prefs])

  const testStrategy = useCallback((strategyId: ReminderStrategyId) => {
    setTestingStrategy(strategyId)
    setTestError(null)

    window.blinkBuddy.testReminder(strategyId)
      .then(() => {
        // Brief delay before re-enabling the test buttons, so the
        // "Testing..." button doesn't snap back the instant the reminder ends.
        setTimeout(() => setTestingStrategy(null), 500)
      })
      .catch((err: Error) => {
        setTestingStrategy(null)
        setTestError(err.message)
        // Defensive: cancel any leftover timer from a previous error so the
        // new banner gets its full 3 seconds. The UI shouldn't allow back-to-
        // back errors, but this ensures the banner duration is correct if it
        // somehow happens.
        if (testErrorTimer.current) clearTimeout(testErrorTimer.current)
        testErrorTimer.current = setTimeout(() => setTestError(null), 3000)
      })
  }, [])

  return {
    prefs,
    loading: prefs === null,
    testingStrategy,
    testError,
    updatePrefs,
    testStrategy,
  }
}