import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReminderPreferences } from '../../shared/ipc-messages'

/**
 * Owns the state for the reminder settings panel.
 *
 * Responsibilities:
 *   - Load preferences from the main process on mount.
 *   - Apply changes: update local state immediately then
 *     persist. If the save fails, revert to the previous
 *     state.
 *   - Trigger 3-second test previews and display any resulting errors.
 *   - Auto-clear error banners after 3 seconds.
 */
export function useReminderPreferences() {
  // `prefs === null` means the initial load hasn't finished yet.  
  const [prefs, setPrefs] = useState<ReminderPreferences | null>(null)

  // The id of the strategy whose Test button is currently running, or null if no test is active. 
  const [testingStrategy, setTestingStrategy] = useState<string | null>(null)

  const [testError, setTestError] = useState<string | null>(null)
  // Timer for clearing the error banners after 3 seconds. 
  const testErrorTimer = useRef<ReturnType<typeof setTimeout>>()

  // Fetch preferences once, on mount.
  useEffect(() => {
    window.blinkBuddy.getReminderPreferences().then(setPrefs)
  }, [])

  useEffect(() => {
    return () => {
      if (testErrorTimer.current) clearTimeout(testErrorTimer.current)
    }
  }, [])

  const updatePrefs = useCallback((nextPrefs: ReminderPreferences) => {
    // Update the UI immediately so toggles feel responsive, then try to persist. 
    // If the save fails revert to the snapshot of the previous state.
    const prev = prefs
    setPrefs(nextPrefs)

    window.blinkBuddy.updateReminderPreferences(nextPrefs).catch(() => {
      setPrefs(prev)
    })
  }, [prefs])

  const testStrategy = useCallback((strategyId: string) => {
    setTestingStrategy(strategyId)
    setTestError(null)

    window.blinkBuddy.testReminder(strategyId)
      .then(() => {
        setTimeout(() => setTestingStrategy(null), 500)
      })
      .catch((err: Error) => {
        setTestingStrategy(null)
        setTestError(err.message)
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