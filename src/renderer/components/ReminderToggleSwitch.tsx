import { Tooltip } from './Tooltip'

/**
 * Toggle switch for enabling/disabling a reminder strategy.
 *
 * Renders a sliding pill-style switch (green when on, grey when off).
 * When `locked` is true, the switch is disabled and shows a tooltip on hover
 * explaining why. The locked state is used in ReminderSettingsPanel to
 * prevent the user from turning off the last enabled reminder, since at
 * least one reminder must remain on at all times.
 *
 * @param value - Current on/off state of the toggle.
 * @param onChange - Called with the new value when the user clicks.
 * @param locked - If true, the toggle is disabled and shows a tooltip.
 */

export function ReminderToggleSwitch({
  value,
  onChange,
  locked = false,
}: {
  value: boolean
  onChange: (v: boolean) => void
  locked?: boolean
}) {
  const button = (
    <button
      onClick={() => onChange(!value)}
      disabled={locked}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        value ? 'bg-green-600' : 'bg-gray-600'
      } ${locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
     {/* The sliding white circle. translate-x-5 moves it to the right when `value` is true, giving the on/off animation. */}
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )

  // When unlocked, just render the bare button (no tooltip or wrapper).
  if (!locked) return button

  // When locked, wrap the button so the Tooltip can hover above it.
  // The wrapper needs `relative` (so Tooltip's absolute positioning anchors
  // here) and `group` (so hovering the wrapper triggers Tooltip's
  // group-hover styles).
  return (
    <span className="group relative">
      {button}
      <Tooltip>At least one reminder must be enabled.</Tooltip>
    </span>
  )
}