/**
 * Single overview card for the Stats page.
 *
 * Renders a small dark-grey card with two or three text rows: a small
 * grey label at the top (e.g. "Total Sessions"), a large white value
 * in the middle (e.g. "12"), and an optional smaller grey subtitle
 * at the bottom (e.g. "8h 23m monitored").
 *
 * Used in a 2x2 grid at the top of StatsPage. The component takes
 * already-formatted strings rather than raw numbers, so all unit and
 * formatting stay in the parent.
 *
 * @param label - Short heading describing the stat.
 * @param value - The headline value to display, formatted as a string.
 * @param subtitle - Optional secondary line shown below the value.
 */
export function SummaryCard({
  label,
  value,
  subtitle,
}: {
  label: string
  value: string
  subtitle?: string
}) {
  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
    </div>
  )
}