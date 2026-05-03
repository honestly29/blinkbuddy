import { useReminderPreferences } from '../hooks/useReminderPreferences'
import type { ReminderPreferences, CornerPosition } from '../../shared/ipc-messages'
import { ReminderCardHeader } from './ReminderCardHeader'


// Display names for the audio cue files. Keys must match the
// filenames in src/renderer/assets/sounds/ 
const SOUND_LABELS: Record<string, string> = {
  'dragon-studio-ding.mp3': 'Ding',
  'universfield-clear-bell-chime.mp3': 'Bell Chime',
  'universfield-system-notification.mp3': 'System Notification',
}

const SOUND_FILES = Object.keys(SOUND_LABELS)

// The four corner-popup positions, with arrow emojis for the picker
// buttons. Order here is the order the buttons render in the UI.
const CORNERS: { value: CornerPosition; label: string }[] = [
  { value: 'top-left', label: '\u2196' },
  { value: 'top-right', label: '\u2197' },
  { value: 'bottom-left', label: '\u2199' },
  { value: 'bottom-right', label: '\u2198' },
]


/**
 * Settings panel for the three reminder strategies.
 *
 * Renders one card per strategy. Each card has a shared header 
 * (label + on/off toggle + test button via ReminderCardHeader)
 * and, when enabled, strategy-specific controls below it
 * (colour, opacity, corner position, sound, volume).
 *
 * State is owned by the useReminderPreferences hook, not by this component.
 * The panel displays the current preferences in the form controls
 * (toggles, sliders, dropdowns) and calls `updatePrefs` when the user
 * changes a value, or `testStrategy` when they click a test button. 
 * The hook handles the actual updates and re-triggers a render with the new values.
 *
 * Business rule: at least one reminder must always remain enabled. When
 * exactly one strategy is on, its toggle is `locked` so the user can't
 * turn it off without first enabling another. The lock is enforced
 * visually by ReminderToggleSwitch and computed here via `isLastEnabled`.
 *
 * @param running - Whether a real monitoring session is currently active.
 *   Forwarded to each card's test button so previews can't be fired
 *   during live monitoring.
 */
export function ReminderSettingsPanel({ running }: { running: boolean }) {
  const { prefs, loading, testingStrategy, testError, updatePrefs, testStrategy } =
    useReminderPreferences()

  // Preferences load asynchronously from the Electron main process on mount.
  // Show a placeholder until they arrive so we don't render controls with
  // missing values.
  if (loading) {
    return (
      <div className="rounded-lg bg-gray-800 p-4">
        <h2 className="mb-4 text-lg font-semibold text-white">Reminders</h2>
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  // After the loading guard above, prefs is guaranteed to be populated.
  // The cast `as ReminderPreferences` tells TypeScript to drop the null case.
  const p = prefs as ReminderPreferences

  // Count how many strategies are currently enabled. Used to decide
  // whether to lock the last enabled toggle.
  let enabledCount = 0
  if (p.screenEdgeGlow.enabled) enabledCount++
  if (p.cornerPopup.enabled) enabledCount++
  if (p.audioCue.enabled) enabledCount++
  const isLastEnabled = (enabled: boolean) => enabled && enabledCount === 1


  // Apply a partial update to prefs without affecting other strategies' 
  // settings. Every control goes through this so we never accidentally 
  // overwrite the whole object.
  const update = (patch: Partial<ReminderPreferences>) => {
    updatePrefs({ ...p, ...patch })
  }

  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <h2 className="mb-4 text-lg font-semibold text-white">Reminders</h2>

      {/* Render an error banner when testStrategy() has failed. */}
      {testError && (
        <div className="mb-3 rounded bg-red-900/50 px-3 py-2 text-sm text-red-300">
          {testError}
        </div>
      )}
      <div className="space-y-3">
        {/* Screen edge glow: header + colour picker + opacity slider when
            enabled. */}
        <div className="rounded-lg bg-gray-700/50 p-3 space-y-3">
          <ReminderCardHeader
            label="Screen edge glow"
            enabled={p.screenEdgeGlow.enabled}
            locked={isLastEnabled(p.screenEdgeGlow.enabled)}
            strategyId="screen-edge-glow"
            testingStrategy={testingStrategy}
            running={running}
            onToggle={(v) =>
              update({
                screenEdgeGlow: { ...p.screenEdgeGlow, enabled: v },
              })
            }
            onTest={testStrategy}
          />
          {p.screenEdgeGlow.enabled && (
            <>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-300">Colour</label>
                <input
                  type="color"
                  value={p.screenEdgeGlow.colour}
                  onChange={(e) =>
                    update({
                      screenEdgeGlow: { ...p.screenEdgeGlow, colour: e.target.value },
                    })
                  }
                  className="h-8 w-8 cursor-pointer rounded border border-gray-600 bg-transparent"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-300">Opacity</label>
                {/* The stored opacity is 0-1, but the slider works in 0-100. Multiply when reading out, divide when reading in. */}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(p.screenEdgeGlow.opacity * 100)}
                  onChange={(e) =>
                    update({
                      screenEdgeGlow: {
                        ...p.screenEdgeGlow,
                        opacity: Number(e.target.value) / 100,
                      },
                    })
                  }
                  className="flex-1 accent-blue-600"
                />
                <span className="w-10 text-right text-sm text-gray-400">
                  {Math.round(p.screenEdgeGlow.opacity * 100)}%
                </span>
              </div>
            </>
          )}
        </div>

        {/* Corner popup: header + corner picker (4 arrow buttons) when
            enabled. */}
        <div className="rounded-lg bg-gray-700/50 p-3 space-y-3">
          <ReminderCardHeader
            label="Corner popup"
            enabled={p.cornerPopup.enabled}
            locked={isLastEnabled(p.cornerPopup.enabled)}
            strategyId="corner-popup"
            testingStrategy={testingStrategy}
            running={running}
            onToggle={(v) =>
              update({
                cornerPopup: { ...p.cornerPopup, enabled: v },
              })
            }
            onTest={testStrategy}
          />
          {p.cornerPopup.enabled && (
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-300">Position</label>
              <div className="flex">
                {CORNERS.map((c, i) => {
                  // First and last buttons get rounded outer corners 
                  // Middle buttons stay square.
                  const isFirst = i === 0
                  const isLast = i === CORNERS.length - 1
                  const isActive = p.cornerPopup.corner === c.value
                  return (
                    <button
                      key={c.value}
                      onClick={() =>
                        update({
                          cornerPopup: { ...p.cornerPopup, corner: c.value },
                        })
                      }
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                        isFirst ? 'rounded-l-lg' : ''
                      } ${isLast ? 'rounded-r-lg' : ''} ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                      }`}
                      title={c.value}
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Audio cue: header + sound dropdown + volume slider when
            enabled. */}
        <div className="rounded-lg bg-gray-700/50 p-3 space-y-3">
          <ReminderCardHeader
            label="Audio cue"
            enabled={p.audioCue.enabled}
            locked={isLastEnabled(p.audioCue.enabled)}
            strategyId="audio-cue"
            testingStrategy={testingStrategy}
            running={running}
            onToggle={(v) =>
              update({
                audioCue: { ...p.audioCue, enabled: v },
              })
            }
            onTest={testStrategy}
          />
          {p.audioCue.enabled && (
            <>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-300">Sound</label>
                <select
                  value={p.audioCue.soundFile}
                  onChange={(e) =>
                    update({
                      audioCue: { ...p.audioCue, soundFile: e.target.value },
                    })
                  }
                  className="ml-4 flex-1 rounded bg-gray-700 px-3 py-2 text-sm text-white"
                >
                  {SOUND_FILES.map((file) => (
                    <option key={file} value={file}>
                      {SOUND_LABELS[file]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-300">Volume</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(p.audioCue.volume * 100)}
                  onChange={(e) =>
                    update({
                      audioCue: {
                        ...p.audioCue,
                        volume: Number(e.target.value) / 100,
                      },
                    })
                  }
                  className="flex-1 accent-blue-600"
                />
                <span className="w-10 text-right text-sm text-gray-400">
                  {Math.round(p.audioCue.volume * 100)}%
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}