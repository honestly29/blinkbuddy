/**
 * Registers ipcMain.handle() endpoints that the renderer calls
 * via the contextBridge-exposed blinkBuddy API.
 * 
 * Each handler corresponds to one method on the BlinkBuddyAPI interface
 * (defined in ipc-messages.ts) and is invoked by ipcRenderer.invoke() in the preload script.
 */

import { ipcMain, dialog, type BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import { IPC_CHANNELS } from '../shared/ipc-messages'
import type {
  StartArgs,
  SetPreviewArgs,
  SetTwentyTwentyArgs,
  UserSettings,
  SessionSummary,
  ReminderPreferences,
  StateUpdate,
  ExportSessionsResult,
  ClearSessionsResult,
} from '../shared/ipc-messages'
import { buildSessionsCsv, defaultExportFilename } from './csv-export'
import type { PythonBridge } from './python-bridge'
import type { SessionManager } from './session-manager'
import type { SettingsStore } from './settings-store'
import type { SessionLogger } from './session-logger'
import type { ReminderPreferencesStore } from './reminder-preferences-store'
import type { CameraInfo } from '../shared/protocol'
import type { ReminderStrategy } from './reminder-strategies/types'
import { ReminderDispatcher, OverlayReminderStrategy, ScreenEdgeGlowStrategy, CornerPopupStrategy, AudioCueStrategy } from './reminder-strategies'

// Maps each strategy id to a function that constructs a fresh instance of that strategy. 
// Used when we need to create a strategy from just its id:
// either to register one that the user has just enabled, or to build an instance for the Test Reminder feature.
const STRATEGY_FACTORIES: Record<string, () => ReminderStrategy> = {
  'overlay': () => new OverlayReminderStrategy(),
  'screen-edge-glow': () => new ScreenEdgeGlowStrategy(),
  'corner-popup': () => new CornerPopupStrategy(),
  'audio-cue': () => new AudioCueStrategy(),
}

// Returns only the settings relevant to a given strategy from the full ReminderPreferences object.
// The returned object is what gets handed to strategy.configure().
function getStrategyConfig(prefs: ReminderPreferences, id: string): Record<string, unknown> {
  switch (id) {
    case 'overlay': return {}
    case 'screen-edge-glow': return { colour: prefs.screenEdgeGlow.colour, opacity: prefs.screenEdgeGlow.opacity }
    case 'corner-popup': return { corner: prefs.cornerPopup.corner }
    case 'audio-cue': return { soundFile: prefs.audioCue.soundFile, volume: prefs.audioCue.volume }
    default: return {}
  }
}

/**
 * Applies a single strategy's enabled flag and configuration to the live dispatcher.
 * There are four cases, handled uniformly here:
 *   1. Enabled + already registered: update the existing instance.
 *   2. Enabled + not registered: create it, configure it, register it.
 *   3. Disabled + registered: remove and dispose it.
 *   4. Disabled + not registered: nothing to do.
 */
function applyStrategyPreference(
  dispatcher: ReminderDispatcher,
  id: string,
  enabled: boolean,
  factory: () => ReminderStrategy,
  config: Record<string, unknown>,
): void {
  const existing = dispatcher.getStrategy(id)

  if (enabled) {
    if (existing) {
      // Case 1: already running, just apply the new configuration to it.
      existing.configure(config)
    } else {
      // Case 2: create a new instance and configure it *before* adding it to the dispatcher. 
      const strategy = factory()
      strategy.configure(config)
      dispatcher.addStrategy(strategy)
    }
  } else {
    if (existing) {
      // Case 3: remove and dispose. 
      dispatcher.removeStrategy(id)
    }
    // Case 4: no-op (already disabled and not registered).
  }
}





/** 
 * Register all IPC handlers. Call once after creating all dependencies.
 */
export function registerIpcHandlers(
  bridge: PythonBridge,
  sessionManager: SessionManager,
  getMainWindow: () => BrowserWindow | null,
  settingsStore: SettingsStore,
  sessionLogger: SessionLogger,
  reminderPreferencesStore: ReminderPreferencesStore,
  reminderDispatcher: ReminderDispatcher,
  twentyTwentyDispatcher: ReminderDispatcher,
): void {

  // Tracks currently-running test previews
  const activeTests = new Map<string, ReminderStrategy>()
  
  // -- Session control handlers --
  ipcMain.handle(IPC_CHANNELS.START, (_event, args?: StartArgs) => {
    sessionManager.start({
      // Forward the user's settings to the Session Manager.
      cameraIndex: args?.cameraIndex ?? 0,
      previewEnabled: args?.previewEnabled ?? false,
      blinkWindowSeconds: args?.blinkWindowSeconds ?? 10,
      twentyTwentyEnabled: args?.twentyTwentyEnabled ?? true,
    })
  })

  /**
   * STOP handler: captures the session summary BEFORE calling stop().
   *
   *   1. getSessionSummary() - capture metrics while domain objects are still active
   *   2. stop() - resets timers and pushes final "stopped" state to renderer
   *   3. sessionLogger.append() - persist the captured summary to disk
   */
  ipcMain.handle(IPC_CHANNELS.STOP, () => {
    if (sessionManager.isRunning()) {
      const summary = sessionManager.getSessionSummary()
      sessionManager.stop()
      sessionLogger.append(summary)
    } else {
      sessionManager.stop()
    }
  })

  // -- Python bridge command handlers --
  ipcMain.handle(IPC_CHANNELS.SET_PREVIEW, (_event, args: SetPreviewArgs) => {
    // Send the command directly to the Python process via stdin.
    bridge.send({ type: 'set_preview', enabled: args.enabled })
  })

  ipcMain.handle(IPC_CHANNELS.SET_TWENTY_TWENTY, (_event, args: SetTwentyTwentyArgs) => {
    sessionManager.setTwentyTwentyEnabled(args.enabled)
  })

  ipcMain.handle(
    IPC_CHANNELS.LIST_CAMERAS,
    () =>
      new Promise<CameraInfo[]>((resolve) => {
        // Register listener for the camera_list response.
        const onEvent = (event: import('../shared/protocol').PythonEvent) => {
          if (event.type === 'camera_list') {
            bridge.removeListener('event', onEvent)
            resolve(event.cameras)
          }
        }
        bridge.on('event', onEvent)
        // Ask the Python process to enumerate available cameras
        bridge.send({ type: 'list_cameras' })

        // Timeout after 5 seconds
        setTimeout(() => {
          bridge.removeListener('event', onEvent)
          resolve([])
        }, 5000)
      }),
  )

  // Delegates to the session logger
  ipcMain.handle(IPC_CHANNELS.GET_SESSION_HISTORY, (): SessionSummary[] => {
    return sessionLogger.getAll()
  })

  // -- Settings persistence handlers --
  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, (_event, settings: UserSettings) => {
    settingsStore.save(settings)
  })

  ipcMain.handle(IPC_CHANNELS.LOAD_SETTINGS, (): UserSettings => {
    return settingsStore.load()
  })

  ipcMain.handle(IPC_CHANNELS.GET_REMINDER_PREFERENCES, (): ReminderPreferences => {
    return reminderPreferencesStore.load()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_REMINDER_PREFERENCES, (_event, prefs: ReminderPreferences) => {
    // We reject any request that would disable all four
    // reminder strategies. 
    const enabledCount = [
      prefs.overlay.enabled,
      prefs.screenEdgeGlow.enabled,
      prefs.cornerPopup.enabled,
      prefs.audioCue.enabled,
    ].filter(Boolean).length

    if (enabledCount === 0) {
      throw new Error('At least one reminder strategy must be enabled')
    }

    // Save to disk first, then apply to the live dispatcher. .
    reminderPreferencesStore.save(prefs)

    // Apply each strategy's new settings to the live dispatcher.
    applyStrategyPreference(reminderDispatcher, 'overlay', prefs.overlay.enabled, () => new OverlayReminderStrategy(), {})

    applyStrategyPreference(reminderDispatcher, 'screen-edge-glow', prefs.screenEdgeGlow.enabled, () => new ScreenEdgeGlowStrategy(), { colour: prefs.screenEdgeGlow.colour, opacity: prefs.screenEdgeGlow.opacity })

    applyStrategyPreference(reminderDispatcher, 'corner-popup', prefs.cornerPopup.enabled, () => new CornerPopupStrategy(), { corner: prefs.cornerPopup.corner })

    applyStrategyPreference(reminderDispatcher, 'audio-cue', prefs.audioCue.enabled, () => new AudioCueStrategy(), { soundFile: prefs.audioCue.soundFile, volume: prefs.audioCue.volume })

    // The 20-20-20 break strategies inherit the corner/volume settings from the blink reminder preferences.
    twentyTwentyDispatcher.getStrategy('twenty-twenty-popup')?.configure({ corner: prefs.cornerPopup.corner })
    twentyTwentyDispatcher.getStrategy('twenty-twenty-audio')?.configure({ volume: prefs.audioCue.volume })
  })

  ipcMain.handle(IPC_CHANNELS.TEST_REMINDER, async (_event, strategyId: string) => {
    if (strategyId === 'overlay') {
      const win = getMainWindow()
      if (!win || win.isDestroyed()) return

      const overlayTestUpdate: StateUpdate = {
        type: 'state_update',
        running: false,
        reminderState: 'idle',
        shouldShowReminder: true,
        blinksPerMinute: 0,
        totalBlinks: 0,
        sessionDurationMs: 0,
        faceDetected: false,
        twentyTwentyState: { phase: 'idle', timeUntilBreakMs: 0, breakTimeRemainingMs: 0 },
        remindersTriggered: 0,
      }

      win.webContents.send(IPC_CHANNELS.STATE_UPDATE, overlayTestUpdate)
      await new Promise((resolve) => setTimeout(resolve, 3000))

      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.STATE_UPDATE, { ...overlayTestUpdate, shouldShowReminder: false })
      }
      return
    }

    // -- Non-overlay strategies --
    const factory = STRATEGY_FACTORIES[strategyId]
    if (!factory) {
      throw new Error(`Unknown strategy "${strategyId}"`)
    }

    // If a previous test for this same strategy is still running cancel it before starting a new one
    const previous = activeTests.get(strategyId)
    if (previous) {
      previous.onReminderEnd()
      previous.dispose()
      activeTests.delete(strategyId)
    }

    // Create a fresh, temporary instance configured from the saved preferences. 
    // We can't reuse the registered instance because the
    // user might be testing a strategy they have currently disabled, so
    // no registered instance exists at all.
    const prefs = reminderPreferencesStore.load()
    const config = getStrategyConfig(prefs, strategyId)
    const strategy = factory()
    strategy.configure(config)

    activeTests.set(strategyId, strategy)

    strategy.onReminderStart()
    await new Promise((resolve) => setTimeout(resolve, 3000))

    if (activeTests.get(strategyId) === strategy) {
      strategy.onReminderEnd()
      strategy.dispose()
      activeTests.delete(strategyId)
    }
  })
  
  ipcMain.handle(IPC_CHANNELS.EXPORT_SESSIONS_CSV, async (): Promise<ExportSessionsResult> => {
    // Read sessions before opening the dialog so we don't ask 
    // the user where to save if there's nothing to export.
    const sessions = sessionLogger.getAll()
    if (sessions.length === 0) {
      return { status: 'no-sessions' }
    }

    // If the main window is gone raise error rather than crash.
    const win = getMainWindow()
    if (!win || win.isDestroyed()) {
      return { status: 'error', message: 'No window available' }
    }

    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultExportFilename(),
      // The filter restricts the file extension dropdown 
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })

    if (result.canceled || !result.filePath) {
      return { status: 'cancelled' }
    }

    try {
      await fs.writeFile(result.filePath, buildSessionsCsv(sessions), 'utf-8')
      return { status: 'saved', filePath: result.filePath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { status: 'error', message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.CLEAR_SESSIONS, async (): Promise<ClearSessionsResult> => {
    const win = getMainWindow()
    if (!win || win.isDestroyed()) {
      return { status: 'error', message: 'No window available' }
    }

    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Cancel', 'Clear'],
      defaultId: 0,
      cancelId: 0,
      title: 'Clear all session data?',
      message: 'This will permanently delete all logged sessions.',
      detail: 'This action cannot be undone.',
    })

    if (response !== 1) {
      return { status: 'cancelled' }
    }

    try {
      sessionLogger.clear()
      return { status: 'cleared' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { status: 'error', message }
    }
  })

  // Forward Python events to the renderer
  bridge.on('event', (pythonEvent) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.PYTHON_EVENT, pythonEvent)
    }
  })
}