// Import Electron APIs
// app manages the application lifecycle
// BrowserWindow is used to create and control application windows
import { app, BrowserWindow } from 'electron'

// Node utility for safely building file paths across OSs
import path from 'node:path'

// Keep a global reference to the window.
// If this is not stored, the window can be garbage collected and close unexpectedly.
let mainWindow: BrowserWindow | null = null


// create the main application window
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

  // For delvelopment stage 
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    // In production, load the built HTML file instead
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'))
  }
}


// When Electron finishes initialising, create the main window
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  // On macOS, apps can stay active even after all windows close.
  // On other platforms we quit the application.
  if (process.platform !== 'darwin') {
    app.quit()
  }
  // Clear the window reference
  mainWindow = null
})

// macOS specific behaviour.
// When the dock icon is clicked and no windows exist, recreate the window.
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})