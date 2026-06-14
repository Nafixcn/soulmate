// Electron 主进程 - 本地 HTTP 服务器，接收微信回调
// 在 electron/main.cjs 中调用 startAuthServer()

const http = require('http')

let authServer = null
let authPort = 0

function startAuthServer(onAuth) {
  return new Promise((resolve, reject) => {
    authServer = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${authPort}`)

      if (url.pathname === '/callback' && req.method === 'GET') {
        const openid = url.searchParams.get('openid')
        const nickname = decodeURIComponent(url.searchParams.get('nickname') || '微信用户')
        const avatar = decodeURIComponent(url.searchParams.get('avatar') || '')

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<!DOCTYPE html><html><body style="text-align:center;padding-top:60px;font-family:sans-serif">
          <h2>✅ 登录成功</h2><p>${nickname}，欢迎回来！</p><p style="color:#999">可以关闭本页面了</p>
          <script>setTimeout(()=>window.close(),2000)</script></body></html>`)

        if (onAuth) {
          onAuth({ openid, nickname, avatar })
        }
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    authServer.on('error', reject)

    // 随机端口
    authServer.listen(0, '127.0.0.1', () => {
      authPort = authServer.address().port
      resolve(authPort)
    })
  })
}

function getAuthPort() {
  return authPort
}

function stopAuthServer() {
  if (authServer) {
    authServer.close()
    authServer = null
  }
}

module.exports = { startAuthServer, getAuthPort, stopAuthServer }
