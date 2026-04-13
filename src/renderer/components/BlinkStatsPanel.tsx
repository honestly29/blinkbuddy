interface BlinkStatsPanelProps {
  blinksPerMinute: number     
  totalBlinks: number        
  sessionDurationMs: number   
}

/**
 * Converts a duration in milliseconds into formatted string.
 * Returns "MM:SS" or "H:MM:SS" for longer sessions.
 * Hours are not zero-padded (e.g. "1:05:30" not "01:05:30") 
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  
  // Zero-pad minutes and seconds to always show two digits (e.g. "02:05")
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${mm}:${ss}`
  }
  return `${mm}:${ss}`
}

// Private helper component for a single stat card
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  )
}

/**
 * Displays three session statistics in a horizontal row:
 *  - Blinks/min: rolling 60-second rate from BlinkStatsTracker
 *  - Total Blinks: lifetime count for the current session
 *  - Duration: how long the session has been running
 */
export function BlinkStatsPanel({ blinksPerMinute, totalBlinks, sessionDurationMs }: BlinkStatsPanelProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard label="Blinks/min" value={blinksPerMinute.toFixed(1)} />
      <StatCard label="Total Blinks" value={String(totalBlinks)} />
      <StatCard label="Duration" value={formatDuration(sessionDurationMs)} />
    </div>
  )
}