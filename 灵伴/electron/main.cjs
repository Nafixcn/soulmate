const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { startAuthServer, getAuthPort, stopAuthServer } = require('./auth-server')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 780,
    minWidth: 360,
    minHeight: 600,
    title: '灵伴 SoulMate',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.setMenuBarVisibility(false)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  try {
    await startAuthServer((user) => {
      if (mainWindow) {
        mainWindow.webContents.send('auth-success', user)
      }
    })
    console.log('Auth server started on port', getAuthPort())
  } catch (e) {
    console.error('Failed to start auth server:', e)
  }

  ipcMain.handle('get-auth-port', () => getAuthPort())

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  app.on('before-quit', () => stopAuthServer())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
