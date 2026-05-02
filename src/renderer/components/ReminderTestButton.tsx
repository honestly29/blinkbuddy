/**
 * "Test" button next to a reminder strategy toggle.
 *
 * Lets the user fire a preview of a reminder strategy without waiting for a real 
 * overdue blink.
 * Used in ReminderSettingsPanel so users can visually see how a strategy works 
 * before relying on it and test out different configurations.
 *
 * The button is disabled in two cases:
 *   1. Another strategy is currently being tested. Only one test can run
 *      at a time so previews don't overlap.
 *   2. A real monitoring session is running. Firing a test reminder during
 *      a live session could interrupt real reminders.
 *
 * While a strategy is being tested, its label changes to "Testing..."
 *
 * @param strategyId - Identifier for this strategy (e.g. "overlay",
 *   "audio-cue"). Passed back to onTest when clicked.
 * @param testingStrategy - The strategyId currently being tested, or null
 *   if no test is running. Shared across all ReminderTestButtons so they
 *   can collectively disable themselves.
 * @param running - Whether a real monitoring session is active.
 * @param onTest - Called with strategyId when the user clicks the button.
 */
export function ReminderTestButton({
  strategyId,
  testingStrategy,
  running,
  onTest,
}: {
  strategyId: string
  testingStrategy: string | null
  running: boolean
  onTest: (id: string) => void
}) {
  // Is this specific button's strategy the one currently being tested?
  const isTesting = testingStrategy === strategyId

  // Disable if any test is running or if monitoring is live
  // Note: this includes the case where isTesting is true, so the
  // user can't double-click to fire two tests of the same strategy.
  const isDisabled = testingStrategy !== null || running

  return (
    <button
      onClick={() => onTest(strategyId)}
      disabled={isDisabled}
      className={`rounded bg-gray-600 px-3 py-1 text-xs text-gray-200 transition-colors ${
        isDisabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-gray-500'
      }`}
    >
      {isTesting ? 'Testing...' : 'Test'}
    </button>
  )
}