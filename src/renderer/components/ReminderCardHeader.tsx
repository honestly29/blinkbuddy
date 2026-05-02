import { ReminderToggleSwitch } from './ReminderToggleSwitch'
import { ReminderTestButton } from './ReminderTestButton'

/**
 * Header row shared by all four reminder strategy cards in
 * ReminderSettingsPanel.
 *
 * Lays out three elements in a single row: the strategy's name on the left,
 * the on/off toggle and the "Test" button on the right. 
 * Each of the four reminder cards uses this component for its top row and
 * any strategy-specific controls (colour picker, sound dropdown, etc.)
 * live below it inside the card.
 * 
 * This component has no logic and no internal data of its own. It's just
 * a layout wrapper for the label, toggle, and test buttons, that forwards
 * the props toReminderToggleSwitch and ReminderTestButton.
 *
 * @param label - Name of the strategy (e.g. "Audio cue").
 * @param enabled - Whether this strategy is currently turned on.
 * @param locked - If true, the toggle can't be turned off (used to
 *   prevent disabling the last enabled reminder).
 * @param strategyId - Identifier passed to onTest when the test button
 *   is clicked (e.g. "overlay", "audio-cue").
 * @param testingStrategy - The strategyId currently being tested, or
 *   null. Shared across all cards so only one test runs at a time.
 * @param running - Whether a real monitoring session is active. Disables
 *   the test button so a preview doesn't interrupt live monitoring.
 * @param onToggle - Called with the new on/off value when the toggle
 *   is clicked.
 * @param onTest - Called with strategyId when the test button is clicked.
 */
export function ReminderCardHeader({
  label,
  enabled,
  locked,
  strategyId,
  testingStrategy,
  running,
  onToggle,
  onTest,
}: {
  label: string
  enabled: boolean
  locked: boolean
  strategyId: string
  testingStrategy: string | null
  running: boolean
  onToggle: (v: boolean) => void
  onTest: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      {/* flex-1 makes the label take all remaining space, pushing the 
      toggle and test button to the right edge of the row. */}
      <span className="flex-1 text-sm text-gray-300">{label}</span>
      <ReminderToggleSwitch value={enabled} onChange={onToggle} locked={locked} />
      <ReminderTestButton strategyId={strategyId} testingStrategy={testingStrategy} running={running} onTest={onTest} />
    </div>
  )
}