import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { PythonBridge } from './python-bridge'
import { SessionManager } from './session-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { SettingsStore } from './settings-store'
import { ReminderPreferencesStore } from './reminder-preferences-store'
import { SessionLogger } from './session-logger'
import { ReminderDispatcher, OverlayReminderStrategy, ScreenEdgeGlowStrategy, CornerPopupStrategy, AudioCueStrategy } from './reminder-strategies'
import type { ReminderStrategy } from './reminder-strategies/types'

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

  mainWindow.on('closed', () => {
    mainWindow = null
    app.quit()
  })

  // In development Vite serves the renderer over HTTP with hot reload,
  // in production we load the bundled static HTML from disk instead.
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

  // -- Load reminder preferences and build the strategy list --
  const reminderPreferencesStore = new ReminderPreferencesStore(app.getPath('userData'))
  const prefs = reminderPreferencesStore.load()

  const strategies: ReminderStrategy[] = []

  if (prefs.overlay.enabled) {
    strategies.push(new OverlayReminderStrategy())
  }

  if (prefs.screenEdgeGlow.enabled) {
    const s = new ScreenEdgeGlowStrategy()
    // Configure before adding, so the strategy has its saved 
    // settings applied before the dispatcher can call
    // onReminderStart on it.
    s.configure({ colour: prefs.screenEdgeGlow.colour, opacity: prefs.screenEdgeGlow.opacity })
    strategies.push(s)
  }

  if (prefs.cornerPopup.enabled) {
    const s = new CornerPopupStrategy()
    s.configure({ corner: prefs.cornerPopup.corner })
    strategies.push(s)
  }

  if (prefs.audioCue.enabled) {
    const s = new AudioCueStrategy()
    s.configure({ soundFile: prefs.audioCue.soundFile, volume: prefs.audioCue.volume })
    strategies.push(s)
  }

  // Create reminder dispatcher with strategies
  reminderDispatcher = new ReminderDispatcher(strategies)

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
  registerIpcHandlers(pythonBridge, sessionManager, () => mainWindow, settingsStore, sessionLogger, reminderPreferencesStore, reminderDispatcher)

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