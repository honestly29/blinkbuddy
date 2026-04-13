import type { TwentyTwentyPhase } from '../../domain/types'

interface TwentyTwentyOverlayProps {
  phase: TwentyTwentyPhase   // 'idle' | 'waiting' | 'break_active'
  breakTimeRemainingMs: number  // Milliseconds left in the current break
}

/**
 * Full-screen overlay that appears during 20-20-20 breaks.
 * Displays a countdown timer and an instruction to look away from the screen.
 *
 * Only visible when phase === 'break_active'. 
 * During 'idle' and 'waiting' phases, the overlay is hidden
 *
 */
export function TwentyTwentyOverlay({ phase, breakTimeRemainingMs }: TwentyTwentyOverlayProps) {
  const active = phase === 'break_active'
  const secondsLeft = Math.ceil(breakTimeRemainingMs / 1000)

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 transition-opacity duration-500 ${
        active 
        ? 'opacity-100'  // Visible: fully opaque
        : 'pointer-events-none opacity-0'  // Hidden: fully transparent
      }`}
      role="dialog"  // role="dialog" makes screen readers announce this as a modal overlay
      aria-label="20-20-20 break"
    >
      <p className="mb-2 text-lg text-blue-300">20-20-20 Break</p>
      <p className="mb-6 text-2xl font-semibold text-white">
        Look at something 20 feet away
      </p>
      <p className="text-5xl font-bold tabular-nums text-white">{secondsLeft}s</p>
    </div>
  )
}