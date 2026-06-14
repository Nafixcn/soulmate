const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('wechatAuth', {
  getPort: () => ipcRenderer.invoke('get-auth-port'),
  onLoginSuccess: (callback) => {
    ipcRenderer.on('auth-success', (_event, user) => callback(user))
  },
})
