/**
 * Registers ipcMain.handle() endpoints that the renderer calls
 * via the contextBridge-exposed blinkBuddy API.
 * 
 * Each handler corresponds to one method on the BlinkBuddyAPI interface
 * (defined in ipc-messages.ts) and is invoked by ipcRenderer.invoke() in the preload script.
 */

import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-messages'
import type { StartArgs, SetPreviewArgs, UserSettings, SessionSummary } from '../shared/ipc-messages'
import type { PythonBridge } from './python-bridge'
import type { SessionManager } from './session-manager'
import type { SettingsStore } from './settings-store'
import type { SessionLogger } from './session-logger'
import type { CameraInfo } from '../shared/protocol'


/** 
 * Register all IPC handlers. Call once after creating all dependencies.
 * 
 * Accepts five injected dependencies (bridge, sessionManager,
 * getMainWindow, settingsStore, sessionLogger).
 */
export function registerIpcHandlers(
  bridge: PythonBridge,
  sessionManager: SessionManager,
  getMainWindow: () => BrowserWindow | null,
  settingsStore: SettingsStore,
  sessionLogger: SessionLogger,
): void {
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
    // This is the only setting that can be changed mid-session.
    bridge.send({ type: 'set_preview', enabled: args.enabled })
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

  // Forward Python events to the renderer
  bridge.on('event', (pythonEvent) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.PYTHON_EVENT, pythonEvent)
    }
  })
}