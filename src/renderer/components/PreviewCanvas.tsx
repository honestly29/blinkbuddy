import { useState, useEffect } from 'react'
import type { PreviewFrameEvent } from '../../shared/protocol'

interface PreviewCanvasProps {
  visible: boolean  // True only when both previewEnabled AND running are true
}

// Displays live face mesh preview frames from the Python detector.
export function PreviewCanvas({ visible }: PreviewCanvasProps) {
  // Stores the latest preview frame, or null if none received yet.
  // Each incoming preview_frame event replaces the previous one.
  const [frame, setFrame] = useState<PreviewFrameEvent | null>(null)

  useEffect(() => {
    // When not visible: clear any old frame data and skip subscribing.
    if (!visible) {
      setFrame(null)
      return
    }

    // Subscribe to all Python events and then filter for preview_frame only.
    const unsubscribe = window.blinkBuddy.onPythonEvent((event) => {
      if (event.type === 'preview_frame') {
        setFrame(event)
      }
    })

    // Return the unsubscribe function as useEffect cleanup.
    return unsubscribe
    
  }, [visible]) // Re-run when visible changes

  // Render nothing if hidden or if no frame has arrived yet.
  if (!visible || !frame) {
    return null
  }

  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <h2 className="mb-2 text-lg font-semibold text-white">Camera Preview</h2>
      {/* Data URI embeds the JPEG directly in the src attribute.
          The browser decodes the base64 string and renders the image
          natively, with no HTTP request or file path needed. */}
      <img
        src={`data:image/jpeg;base64,${frame.data}`}
        width={frame.width}
        height={frame.height}
        alt="Camera preview with face mesh overlay"
        className="rounded"
      />
    </div>
  )
}