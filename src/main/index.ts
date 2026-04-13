import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { PythonBridge } from './python-bridge'
import { SessionManager } from './session-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { SettingsStore } from './settings-store'

let mainWindow: BrowserWindow | null = null
let pythonBridge: PythonBridge | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,  // Security: prevent renderer from accessing Node.js APIs
      contextIsolation: true,  // Security: isolate preload from renderer context
    },
  })

  // In development, load from Vite's dev server (with HMR).
  // In production, load the built HTML file from disk.
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'))
  }
}

app.whenReady().then(() => {
  // Create and spawn the Python bridge
  pythonBridge = new PythonBridge()
  pythonBridge.spawn()

  // Create session manager with a sendToRenderer callback that
  // forwards state updates to the Electron window via webContents.send()
  const sessionManager = new SessionManager({
    bridge: pythonBridge,
    sendToRenderer: (channel, data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data)
      }
    },
  })

  // Create settings store pointing at Electron's per-platform userData directory.
  // e.g. ~/Library/Application Support/BlinkBuddy/ on macOS
  const settingsStore = new SettingsStore(app.getPath('userData'))

  // Register IPC handlers before creating the window so they're ready by the time the renderer loads and calls loadSettings/listCameras
  registerIpcHandlers(pythonBridge, sessionManager, () => mainWindow, settingsStore)

  createWindow()
})

app.on('window-all-closed', () => {
  // On macOS, apps typically stay open even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit()
  }
  mainWindow = null
})

app.on('activate', () => {
  // On macOS, re-create the window when the dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// -- Graceful shutdown: ensure Python process is killed before exit --

let isQuitting = false

app.on('before-quit', (event) => {
  if (pythonBridge && !isQuitting) {
    isQuitting = true
    event.preventDefault()  // Delay quit until Python process exits
    pythonBridge.kill().finally(() => {
      pythonBridge = null
      app.quit()  // Now actually quit after Python is cleaned up
    })
  }
})

// Ensure Python is killed if Node process exits unexpectedly
function cleanupSync() {
  if (pythonBridge) {
    pythonBridge.killSync()
    pythonBridge = null
  }
}

process.on('exit', cleanupSync)
process.on('SIGTERM', () => { cleanupSync(); process.exit() })
process.on('SIGINT', () => { cleanupSync(); process.exit() })