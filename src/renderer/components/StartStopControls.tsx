import { useState } from 'react'

interface StartStopControlsProps {
  running: boolean
  onStart: () => Promise<void> // Promise because the underlying IPC call is async
  onStop: () => Promise<void>
}

/**
 * A single toggle button that switches between Start and Stop states.
 * Includes a loading state to prevent double-clicks
 */
export function StartStopControls({ running, onStart, onStop }: StartStopControlsProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = async () => {
    setIsLoading(true)  // Immediately disable the button to prevent double-clicks
    try {
      if (running) {
        await onStop()
      } else {
        await onStart()
      }
    } finally {
      // Reset loading state whether the call succeeds or throws
      setIsLoading(false)
    }
  }

  const baseClasses = 'w-full rounded-lg px-6 py-3 text-lg font-semibold text-white transition-colors'
  const colourClasses = running
    ? 'bg-red-600 hover:bg-red-700'   // Red for stop action
    : 'bg-green-600 hover:bg-green-700'  // Green for start action
  const disabledClasses = isLoading ? 'opacity-50 cursor-not-allowed' : ''

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}  // HTML disabled attribute prevents clicks and keyboard activation
      className={`${baseClasses} ${colourClasses} ${disabledClasses}`}
    >
      {isLoading
        ? (running ? 'Stopping...' : 'Starting...')
        : (running ? 'Stop Monitoring' : 'Start Monitoring')}
    </button>
  )
}