/**
 * Preload script: exposes a secure blinkBuddy API to the renderer via contextBridge. nodeIntegration remains disabled.
 */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type BlinkBuddyAPI } from '../shared/ipc-messages'
import type { PythonEvent } from '../shared/protocol'

const api: BlinkBuddyAPI = {
  start: (args) => ipcRenderer.invoke(IPC_CHANNELS.START, args),
  stop: () => ipcRenderer.invoke(IPC_CHANNELS.STOP),
  setPreview: (args) => ipcRenderer.invoke(IPC_CHANNELS.SET_PREVIEW, args),
  listCameras: () => ipcRenderer.invoke(IPC_CHANNELS.LIST_CAMERAS),
  getSessionHistory: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_HISTORY),
  saveSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),
  loadSettings: () => ipcRenderer.invoke(IPC_CHANNELS.LOAD_SETTINGS),

  onPythonEvent: (callback: (event: PythonEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, pythonEvent: PythonEvent) => {
      callback(pythonEvent)
    }
    ipcRenderer.on(IPC_CHANNELS.PYTHON_EVENT, handler)
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.PYTHON_EVENT, handler)
    }
  },
}

contextBridge.exposeInMainWorld('blinkBuddy', api)