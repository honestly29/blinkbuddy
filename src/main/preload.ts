/**
 * Preload script: exposes a secure blinkBuddy API to the renderer
 * via contextBridge. nodeIntegration remains disabled, so this is
 * the only bridge between the renderer's web context and Node/Electron APIs.
 */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type BlinkBuddyAPI, type StateUpdate } from '../shared/ipc-messages'
import type { PythonEvent } from '../shared/protocol'

// Concrete implementation of the BlinkBuddyAPI interface. Each method
// wraps an ipcRenderer call, so the renderer never touches Electron's
// APIs directly, only this object.
const api: BlinkBuddyAPI = {
  start: (args) => ipcRenderer.invoke(IPC_CHANNELS.START, args),
  stop: () => ipcRenderer.invoke(IPC_CHANNELS.STOP),
  setPreview: (args) => ipcRenderer.invoke(IPC_CHANNELS.SET_PREVIEW, args),
  setTwentyTwenty: (args) => ipcRenderer.invoke(IPC_CHANNELS.SET_TWENTY_TWENTY, args),
  listCameras: () => ipcRenderer.invoke(IPC_CHANNELS.LIST_CAMERAS),
  getSessionHistory: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_HISTORY),
  saveSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),
  loadSettings: () => ipcRenderer.invoke(IPC_CHANNELS.LOAD_SETTINGS),
  getReminderPreferences: () => ipcRenderer.invoke(IPC_CHANNELS.GET_REMINDER_PREFERENCES),
  updateReminderPreferences: (prefs) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_REMINDER_PREFERENCES, prefs),
  testReminder: (strategyId) => ipcRenderer.invoke(IPC_CHANNELS.TEST_REMINDER, strategyId),

  // --- Event subscription methods ---
  // These use ipcRenderer.on() to listen for events pushed from the main process.
  // Each returns an unsubscribe function so the renderer can clean up listeners.
  onPythonEvent: (callback: (event: PythonEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, pythonEvent: PythonEvent) => {
      callback(pythonEvent)
    }
    ipcRenderer.on(IPC_CHANNELS.PYTHON_EVENT, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.PYTHON_EVENT, handler)
    }
  },

  onStateUpdate: (callback: (state: StateUpdate) => void) => {
    // The Session Manager pushes StateUpdate snapshots on this channel
    // every time domain state changes (blink detected, reminder triggered, etc) 
    const handler = (_event: Electron.IpcRendererEvent, state: StateUpdate) => {
      callback(state)
    }
    ipcRenderer.on(IPC_CHANNELS.STATE_UPDATE, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.STATE_UPDATE, handler)
    }
  },
}

// Expose the api object as window.blinkBuddy in the renderer process
contextBridge.exposeInMainWorld('blinkBuddy', api)