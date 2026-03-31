/**
 * Registers ipcMain.handle() endpoints that the renderer calls
 * via the contextBridge-exposed blinkBuddy API.
 */

import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-messages'
import type { StartArgs, SetPreviewArgs, UserSettings, SessionSummary } from '../shared/ipc-messages'
import type { PythonBridge } from './python-bridge'
import type { SessionManager } from './session-manager'
import type { CameraInfo } from '../shared/protocol'

/**
 * Register all IPC handlers. Call once after creating the PythonBridge
 * and SessionManager.
 */
export function registerIpcHandlers(
  bridge: PythonBridge,
  sessionManager: SessionManager,
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(IPC_CHANNELS.START, (_event, args?: StartArgs) => {
    sessionManager.start({
      cameraIndex: args?.cameraIndex ?? 0,
      previewEnabled: args?.previewEnabled ?? false,
      blinkWindowSeconds: args?.blinkWindowSeconds ?? 20,
      twentyTwentyEnabled: args?.twentyTwentyEnabled ?? true,
    })
  })

  ipcMain.handle(IPC_CHANNELS.STOP, () => {
    sessionManager.stop()
  })

  ipcMain.handle(IPC_CHANNELS.SET_PREVIEW, (_event, args: SetPreviewArgs) => {
    bridge.send({ type: 'set_preview', enabled: args.enabled })
  })

  ipcMain.handle(
    IPC_CHANNELS.LIST_CAMERAS,
    () =>
      new Promise<CameraInfo[]>((resolve) => {
        const onEvent = (event: import('../shared/protocol').PythonEvent) => {
          if (event.type === 'camera_list') {
            bridge.removeListener('event', onEvent)
            resolve(event.cameras)
          }
        }
        bridge.on('event', onEvent)
        bridge.send({ type: 'list_cameras' })

        // Timeout after 5 seconds
        setTimeout(() => {
          bridge.removeListener('event', onEvent)
          resolve([])
        }, 5000)
      }),
  )

  // Stub handlers for settings / session history
  ipcMain.handle(IPC_CHANNELS.GET_SESSION_HISTORY, (): SessionSummary[] => {
    return []
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, (_event, _settings: UserSettings) => {
    // 
  })

  ipcMain.handle(IPC_CHANNELS.LOAD_SETTINGS, (): UserSettings => {
    return {
      blinkWindowSeconds: 20,
      cameraIndex: 0,
      previewEnabled: false,
      twentyTwentyEnabled: true,
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