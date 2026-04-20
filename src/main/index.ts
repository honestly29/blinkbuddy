import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { PythonBridge } from './python-bridge'
import { SessionManager } from './session-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { SettingsStore } from './settings-store'
import { SessionLogger } from './session-logger'
import {
  ReminderDispatcher,
  OverlayReminderStrategy,
  ScreenEdgeGlowStrategy,
  CornerPopupStrategy,      
  AudioCueStrategy,         
} from './reminder-strategies'

let mainWindow: BrowserWindow | null = null
let pythonBridge: PythonBridge | null = null
let sessionManager: SessionManager | null = null
let reminderDispatcher: ReminderDispatcher | null = null
let sessionLogger: SessionLogger | null = null

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

  // When the main window is closed, trigger app quit.
  // This stops the glow window from keeping Electron alive
  mainWindow.on('closed', () => {
    mainWindow = null
    app.quit()
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

  // Create reminder dispatcher with strategies
  reminderDispatcher = new ReminderDispatcher([
    new OverlayReminderStrategy(),
    new ScreenEdgeGlowStrategy(),
    new CornerPopupStrategy(),   
    new AudioCueStrategy(), 
  ])

  // Create session manager
  sessionManager = new SessionManager({
    bridge: pythonBridge,
    sendToRenderer: (channel, data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data)
      }
    },
    reminderDispatcher,
  })

  // Create settings store and session logger
  const settingsStore = new SettingsStore(app.getPath('userData'))
  sessionLogger = new SessionLogger(app.getPath('userData'))

  // Register IPC handlers before creating the window
  registerIpcHandlers(pythonBridge, sessionManager, () => mainWindow, settingsStore, sessionLogger)

  createWindow()
})

// Always quit when all windows are closed
app.on('window-all-closed', () => {
  app.quit()
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
    event.preventDefault()  // Delay quit until cleanup is done

    // Full cleanup sequence:
    // 1. Capture session summary BEFORE stop (stop resets domain state)
    // 2. Stop the session (clears intervals, unsubscribes from bridge)
    // 3. Persist the summary to disk
    // 4. Dispose reminder strategies (closes glow window)
    // 5. Kill Python process
    // 6. Re-trigger quit

    if (sessionManager?.isRunning() && sessionLogger) {
      const summary = sessionManager.getSessionSummary()
      sessionManager.stop()
      sessionLogger.append(summary)
    } else {
      sessionManager?.stop()
    }

    // Dispose reminder strategies (closes glow window if it exists)
    reminderDispatcher?.dispose()

    // Kill Python process, then re-trigger app.quit() to actually exit
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