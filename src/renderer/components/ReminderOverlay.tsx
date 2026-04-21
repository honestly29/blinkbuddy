interface ReminderOverlayProps {
  visible: boolean
}

/**
 * A fixed-position amber banner that slides up from the bottom of the screen
 * when the user hasn't blinked for too long (the "overdue" state from the reminder state machine).
 *
 * The component is ALWAYS rendered in the DOM (never conditionally mounted).
 * Visibility is controlled purely through CSS transforms and opacity.
 */
export function ReminderOverlay({ visible }: ReminderOverlayProps) {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-10 bg-amber-500 px-6 py-4 text-center text-lg font-semibold text-black transition-all duration-300 ease-in-out ${
        visible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-full opacity-0'
      }`}
      role="alert"
    >
      Remember to blink!
    </div>
  )
}