interface StatusPanelProps {
  running: boolean
  faceDetected: boolean
}

/**
 * A status badge that shows one of three states:
 *  - Stopped (grey)           - session is not running
 *  - Face Detected (green)    - session is running and camera sees a face
 *  - No Face Detected (red)   - session is running but no face is  visible
 */
export function StatusPanel({ running, faceDetected }: StatusPanelProps) {
  // State 1: Not running - show a grey badge with no indicator dot
  if (!running) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-gray-700 px-3 py-1 text-sm font-medium text-gray-300">
        Stopped
      </span>
    )
  }

  // State 2: Running + face visible - green badge with a green indicator dot
  if (faceDetected) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-green-900/50 px-3 py-1 text-sm font-medium text-green-300">
        <span className="h-2 w-2 rounded-full bg-green-400" />
        Face Detected
      </span>
    )
  }

  // State 3: Running + no face - red badge warns user that detection is paused 
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-red-900/50 px-3 py-1 text-sm font-medium text-red-300">
      <span className="h-2 w-2 rounded-full bg-red-400" />
      No Face Detected
    </span>
  )
}