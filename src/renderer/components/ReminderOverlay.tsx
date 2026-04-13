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
      className={`fixed inset-x-0 bottom-0 bg-amber-500 px-6 py-4 text-center text-lg font-semibold text-black transition-all duration-300 ease-in-out ${
        visible
          // Visible state: slide into view, fully opaque
          ? 'translate-y-0 opacity-100'
          // Hidden state: push off-screen below viewport, fully transparent and disable pointer events so doesn't block clicks
          : 'pointer-events-none translate-y-full opacity-0'
      }`}
      role="alert"  // ARIA live region so screen readers announce the reminder (accessibility)
    >
      Remember to blink!
    </div>
  )
}