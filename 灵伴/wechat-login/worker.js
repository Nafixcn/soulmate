// Cloudflare Worker - 微信扫码登录回调处理
// 部署: npx wrangler deploy
// 访问地址: https://your-name.workers.dev

export default {
  async fetch(request) {
    const url = new URL(request.url)

    // 回调: /callback?code=xxx&state=xxx
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      if (!code) {
        return Response.json({ error: 'missing code' }, { status: 400 })
      }

      // 用 code 换 access_token
      const appid = WECHAT_APPID
      const secret = WECHAT_SECRET
      const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appid}&secret=${secret}&code=${code}&grant_type=authorization_code`

      const tokenResp = await fetch(tokenUrl)
      const tokenData = await tokenResp.json()

      if (tokenData.errcode) {
        return Response.json({ error: tokenData.errmsg }, { status: 400 })
      }

      const { access_token, openid } = tokenData

      // 获取用户信息
      const userUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}&lang=zh_CN`
      const userResp = await fetch(userUrl)
      const userData = await userResp.json()

      // 跳转回 Electron 本地服务器
      const params = new URLSearchParams({
        openid: userData.openid || openid,
        nickname: encodeURIComponent(userData.nickname || '微信用户'),
        avatar: encodeURIComponent(userData.headimgurl || ''),
      })

      return Response.redirect(`http://localhost:${state}/callback?${params.toString()}`)
    }

    return Response.json({ status: 'wechat-auth-worker' })
  }
}
