import type { UserSettings } from '../../shared/ipc-messages'
import type { CameraInfo } from '../../shared/protocol'
import { CameraSelector } from './CameraSelector'
import { BlinkWindowInput } from './BlinkWindowInput'

interface SettingsPanelProps {
  settings: UserSettings
  cameras: CameraInfo[]
  camerasLoading: boolean
  running: boolean         // disables controls that cannot safely change mid-session
  onBlinkWindowChange: (seconds: number) => void
  onCameraChange: (index: number) => void
  onTwentyTwentyChange: (enabled: boolean) => void
}


/**
 * Container component that composes all settings controls into a single card.
 *
 * Three of the four controls are disabled when `running` is true:
 *   - CameraSelector (can't switch cameras mid-session)
 *   - BlinkWindowInput (changing T mid-session invalidates the blink window)
 *   - 20-20-20 toggle (changing would disrupt the timer state)
 * Only PreviewToggle remains interactive during a session.
 */
export function SettingsPanel({
  settings,
  cameras,
  camerasLoading,
  running,
  onBlinkWindowChange,
  onCameraChange,
  onTwentyTwentyChange,
}: SettingsPanelProps) {
  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <h2 className="mb-4 text-lg font-semibold text-white">Settings</h2>
      <div className="space-y-4">
        {/* Camera dropdown - disabled when running */}
        <CameraSelector
          cameras={cameras}
          selectedIndex={settings.cameraIndex}
          disabled={running}
          loading={camerasLoading}
          onChange={onCameraChange}
        />

        {/* Blink window input - disabled when running */}
        <BlinkWindowInput
          value={settings.blinkWindowSeconds}
          disabled={running}
          onChange={onBlinkWindowChange}
        />

        {/* 20-20-20 toggle switch */}
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-300">20-20-20 break reminders</label>
          <button
            onClick={() => onTwentyTwentyChange(!settings.twentyTwentyEnabled)}
            className={`relative h-6 w-11 cursor-pointer rounded-full transition-colors ${
              settings.twentyTwentyEnabled ? 
              'bg-green-600' : 'bg-gray-600'
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                settings.twentyTwentyEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  )
}