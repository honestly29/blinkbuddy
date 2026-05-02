/**
 * Small tooltip that appears above its parent on hover.
 *
 * Used by ReminderToggleSwitch to explain why the last enabled 
 * reminder can't be disable, because at least one reminder must always be on.
 * 
 * The parent element must have both `group` and `relative` Tailwind 
 * classes for the hover-trigger and positioning to work.
 *
 * @example
 *   <span className="group relative">
 *     <button disabled>...</button>
 *     <Tooltip>This is locked because...</Tooltip>
 *   </span>
 */

import type { ReactNode } from 'react'

export function Tooltip({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute -top-9 right-0 z-10 whitespace-nowrap rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
      {children}
    </span>
  )
}