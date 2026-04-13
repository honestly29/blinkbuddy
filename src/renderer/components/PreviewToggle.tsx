interface PreviewToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
}

// Two side-by-side buttons for toggling camera preview.
export function PreviewToggle({ enabled, onChange }: PreviewToggleProps) {
  const base = 'px-4 py-2 text-sm font-medium transition-colors'
  const active = 'bg-blue-600 text-white'   // blue highlight
  const inactive = 'bg-gray-700 text-gray-300 hover:bg-gray-600'  // grey for unselected option

  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-gray-300">Camera preview</label>
      <div className="flex">
        {/* Left button: "Disabled" - active (blue) when preview is off */}
        <button
          onClick={() => onChange(false)}
          className={`${base} rounded-l-lg ${!enabled ? active : inactive}`}
        >
          Disabled
        </button>
        {/* Right button: "Enabled" - active (blue) when preview is on */}
        <button
          onClick={() => onChange(true)}
          className={`${base} rounded-r-lg ${enabled ? active : inactive}`}
        >
          Enabled
        </button>
      </div>
    </div>
  )
}