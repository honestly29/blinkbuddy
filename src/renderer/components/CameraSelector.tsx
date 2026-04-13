import type { CameraInfo } from '../../shared/protocol'

interface CameraSelectorProps {
  cameras: CameraInfo[]   // Array of detected cameras
  selectedIndex: number   // Currently selected camera index
  disabled: boolean       // True when a monitoring session is active
  loading: boolean        // True while waiting for Python to enumerate cameras
  onChange: (index: number) => void
}

/**
 * A dropdown that lists available cameras. Shows one of three states:
 *  - Camera options (when cameras are available)
 *  - "Loading cameras..." (while waiting for Python to respond)
 *  - "Default camera" (when no cameras are detected or Python isn't running)
 */
export function CameraSelector({
  cameras,
  selectedIndex,
  disabled,
  loading,
  onChange,
}: CameraSelectorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(Number(e.target.value))
  }

  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-gray-300">Camera</label>
      <select
        value={selectedIndex}
        onChange={handleChange}
        disabled={disabled}
        className={`flex-1 ml-4 rounded bg-gray-700 px-3 py-2 text-sm text-white ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      > 
        {/* State 1: Loading - Python process is still enumerating cameras */}
        {cameras.length === 0 && loading && (
          <option value={0}>Loading cameras...</option>
        )}

        {/* State 2: Empty - no cameras found (Python not running or no webcam) */}
        {cameras.length === 0 && !loading && (
          <option value={0}>Default camera</option>
        )}

        {/* State 3: Cameras available - one <option> per detected camera */}
        {cameras.map(cam => (
          <option key={cam.index} value={cam.index}>
            {cam.name}
          </option>
        ))}
      </select>
    </div>
  )
}