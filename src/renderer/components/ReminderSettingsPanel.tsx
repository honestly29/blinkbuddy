import type { ReactNode } from 'react'
import { useReminderPreferences } from '../hooks/useReminderPreferences'
import type { ReminderPreferences, CornerPosition } from '../../shared/ipc-messages'

const SOUND_LABELS: Record<string, string> = {
  'dragon-studio-ding.mp3': 'Ding',
  'universfield-clear-bell-chime.mp3': 'Bell Chime',
  'universfield-system-notification.mp3': 'System Notification',
}

const SOUND_FILES = Object.keys(SOUND_LABELS)

const CORNERS: { value: CornerPosition; label: string }[] = [
  { value: 'top-left', label: '\u2196' },
  { value: 'top-right', label: '\u2197' },
  { value: 'bottom-left', label: '\u2199' },
  { value: 'bottom-right', label: '\u2198' },
]

function Tooltip({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute -top-9 right-0 z-10 whitespace-nowrap rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
      {children}
    </span>
  )
}

// Toggle switch button
function ToggleSwitch({
  value,
  onChange,
  locked = false,
}: {
  value: boolean
  onChange: (v: boolean) => void
  locked?: boolean
}) {
  const button = (
    <button
      onClick={() => onChange(!value)}
      disabled={locked}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        value ? 'bg-green-600' : 'bg-gray-600'
      } ${locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )

  if (!locked) return button

  return (
    <span className="group relative">
      {button}
      <Tooltip>At least one reminder must be enabled.</Tooltip>
    </span>
  )
}

// The Test button is disabled in two situations: while any strategy is
// currently being tested, and while a monitoring session is running.
function TestButton({
  strategyId,
  testingStrategy,
  running,
  onTest,
}: {
  strategyId: string
  testingStrategy: string | null
  running: boolean
  onTest: (id: string) => void
}) {
  const isTesting = testingStrategy === strategyId
  const isDisabled = testingStrategy !== null || running

  return (
    <button
      onClick={() => onTest(strategyId)}
      disabled={isDisabled}
      className={`rounded bg-gray-600 px-3 py-1 text-xs text-gray-200 transition-colors ${
        isDisabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-gray-500'
      }`}
    >
      {isTesting ? 'Testing...' : 'Test'}
    </button>
  )
}

// Shared header row reused by all four strategy cards
function CardHeader({
  label,
  enabled,
  locked,
  strategyId,
  testingStrategy,
  running,
  onToggle,
  onTest,
}: {
  label: string
  enabled: boolean
  locked: boolean
  strategyId: string
  testingStrategy: string | null
  running: boolean
  onToggle: (v: boolean) => void
  onTest: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 text-sm text-gray-300">{label}</span>
      <ToggleSwitch value={enabled} onChange={onToggle} locked={locked} />
      <TestButton strategyId={strategyId} testingStrategy={testingStrategy} running={running} onTest={onTest} />
    </div>
  )
}

export function ReminderSettingsPanel({ running }: { running: boolean }) {
  const { prefs, loading, testingStrategy, testError, updatePrefs, testStrategy } =
    useReminderPreferences()

  // Show a "Loading..." placeholder until the initial preferences arrive from the main process. 
  if (loading) {
    return (
      <div className="rounded-lg bg-gray-800 p-4">
        <h2 className="mb-4 text-lg font-semibold text-white">Reminders</h2>
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  const p = prefs as ReminderPreferences

  const enabledCount =
    Number(p.overlay.enabled) +
    Number(p.screenEdgeGlow.enabled) +
    Number(p.cornerPopup.enabled) +
    Number(p.audioCue.enabled)
  const isLastEnabled = (enabled: boolean) => enabled && enabledCount === 1

  const update = (patch: Partial<ReminderPreferences>) => {
    updatePrefs({ ...p, ...patch })
  }

  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <h2 className="mb-4 text-lg font-semibold text-white">Reminders</h2>

      {testError && (
        <div className="mb-3 rounded bg-red-900/50 px-3 py-2 text-sm text-red-300">
          {testError}
        </div>
      )}

      <div className="space-y-3">
        {/* In-app overlay */}
        <div className="rounded-lg bg-gray-700/50 p-3">
          <CardHeader
            label="In-app overlay"
            enabled={p.overlay.enabled}
            locked={isLastEnabled(p.overlay.enabled)}
            strategyId="overlay"
            testingStrategy={testingStrategy}
            running={running}
            onToggle={(v) => update({ overlay: { enabled: v } })}
            onTest={testStrategy}
          />
        </div>

        {/* Screen edge glow */}
        <div className="rounded-lg bg-gray-700/50 p-3 space-y-3">
          <CardHeader
            label="Screen edge glow"
            enabled={p.screenEdgeGlow.enabled}
            locked={isLastEnabled(p.screenEdgeGlow.enabled)}
            strategyId="screen-edge-glow"
            testingStrategy={testingStrategy}
            running={running}
            onToggle={(v) => update({ screenEdgeGlow: { ...p.screenEdgeGlow, enabled: v } })}
            onTest={testStrategy}
          />
          {/* Only render the secondary controls when the strategy is enabled. */}
          {p.screenEdgeGlow.enabled && (
            <>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-300">Colour</label>
                <input
                  type="color"
                  value={p.screenEdgeGlow.colour}
                  onChange={(e) => update({ screenEdgeGlow: { ...p.screenEdgeGlow, colour: e.target.value } })}
                  className="h-8 w-8 cursor-pointer rounded border border-gray-600 bg-transparent"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-300">Opacity</label>
                
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(p.screenEdgeGlow.opacity * 100)}
                  onChange={(e) => update({ screenEdgeGlow: { ...p.screenEdgeGlow, opacity: Number(e.target.value) / 100 } })}
                  className="flex-1 accent-blue-600"
                />
                <span className="w-10 text-right text-sm text-gray-400">
                  {Math.round(p.screenEdgeGlow.opacity * 100)}%
                </span>
              </div>
            </>
          )}
        </div>

        {/* Corner popup */}
        <div className="rounded-lg bg-gray-700/50 p-3 space-y-3">
          <CardHeader
            label="Corner popup"
            enabled={p.cornerPopup.enabled}
            locked={isLastEnabled(p.cornerPopup.enabled)}
            strategyId="corner-popup"
            testingStrategy={testingStrategy}
            running={running}
            onToggle={(v) => update({ cornerPopup: { ...p.cornerPopup, enabled: v } })}
            onTest={testStrategy}
          />
          {p.cornerPopup.enabled && (
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-300">Position</label>
              {/* Button's for the four corners. */}
              <div className="flex">
                {CORNERS.map((c, i) => {
                  const isFirst = i === 0
                  const isLast = i === CORNERS.length - 1
                  const isActive = p.cornerPopup.corner === c.value
                  return (
                    <button
                      key={c.value}
                      onClick={() => update({ cornerPopup: { ...p.cornerPopup, corner: c.value } })}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                        isFirst ? 'rounded-l-lg' : ''
                      } ${isLast ? 'rounded-r-lg' : ''} ${
                        isActive ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
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

        {/* Audio cue */}
        <div className="rounded-lg bg-gray-700/50 p-3 space-y-3">
          <CardHeader
            label="Audio cue"
            enabled={p.audioCue.enabled}
            locked={isLastEnabled(p.audioCue.enabled)}
            strategyId="audio-cue"
            testingStrategy={testingStrategy}
            running={running}
            onToggle={(v) => update({ audioCue: { ...p.audioCue, enabled: v } })}
            onTest={testStrategy}
          />
          {p.audioCue.enabled && (
            <>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-300">Sound</label>
                <select
                  value={p.audioCue.soundFile}
                  onChange={(e) => update({ audioCue: { ...p.audioCue, soundFile: e.target.value } })}
                  className="ml-4 flex-1 rounded bg-gray-700 px-3 py-2 text-sm text-white"
                >
                  {SOUND_FILES.map((file) => (
                    <option key={file} value={file}>{SOUND_LABELS[file]}</option>
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
                  onChange={(e) => update({ audioCue: { ...p.audioCue, volume: Number(e.target.value) / 100 } })}
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