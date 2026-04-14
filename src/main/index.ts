import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { PythonBridge } from './python-bridge'
import { SessionManager } from './session-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { SettingsStore } from './settings-store'
import { SessionLogger } from './session-logger'

let mainWindow: BrowserWindow | null = null
let pythonBridge: PythonBridge | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

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

  // Create session manager
  const sessionManager = new SessionManager({
    bridge: pythonBridge,
    sendToRenderer: (channel, data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data)
      }
    },
  })

  // Create settings store and session logger which point at the same userData directory
  const settingsStore = new SettingsStore(app.getPath('userData'))
  const sessionLogger = new SessionLogger(app.getPath('userData'))

  // Pass all five dependencies to the IPC handler registrar
  registerIpcHandlers(pythonBridge, sessionManager, () => mainWindow, settingsStore, sessionLogger)

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
  mainWindow = null
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

let isQuitting = false

app.on('before-quit', (event) => {
  if (pythonBridge && !isQuitting) {
    isQuitting = true
    event.preventDefault()
    pythonBridge.kill().finally(() => {
      pythonBridge = null
      app.quit()
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