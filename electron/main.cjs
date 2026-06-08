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
    title: '小希 - AI 电子女友',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.requestHeaders['Origin']) {
      details.requestHeaders['Origin'] = details.url
    }
    callback({ requestHeaders: details.requestHeaders })
  })

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*'],
        'Access-Control-Allow-Headers': ['*'],
        'Access-Control-Allow-Methods': ['*'],
      }
    })
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
  // 启动本地回调服务器（微信登录用）
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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
