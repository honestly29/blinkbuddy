interface BlinkWindowInputProps {
  value: number
  disabled: boolean
  onChange: (seconds: number) => void
}

/**
 * Numeric input for the blink window duration (T seconds).
 * Valid range: 5-300 seconds, matching the Implementation Plan specification.
 *
 * Uses a "clamp-on-blur" validation strategy: any number can be typed during editing,
 * but out-of-range values are corrected when the user clicks away from the input. 
 */
export function BlinkWindowInput({ value, disabled, onChange }: BlinkWindowInputProps) {
  // Called on every keystroke. Converts the input string to a number and passes it through if valid. 
  // NaN values (empty string, letters) are silently ignored, leaving the previous value in place.
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = Number(e.target.value)
    if (!Number.isNaN(num)) {
      onChange(num)
    }
  }

  // Called when the input loses focus. Clamps the value to [5, 300] and rounds to the nearest integer.
  const handleBlur = () => {
    const clamped = Math.max(5, Math.min(300, Math.round(value)))
    if (clamped !== value) {
      onChange(clamped)
    }
  }

  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-gray-300">Blink window (seconds)</label>
      <input
        type="number"
        min={5}
        max={300}
        step={1}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        className={`w-20 rounded bg-gray-700 px-3 py-2 text-sm text-white ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      />
    </div>
  )
}