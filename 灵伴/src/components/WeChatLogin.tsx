import React, { useEffect } from 'react'
import { useAuthStore } from '../store/authStore'

interface Props {
  appid: string
}

export const WeChatLogin: React.FC<Props> = ({ appid }) => {
  const { user, isLoggingIn, port, setLoggingIn, setUser, setPort } = useAuthStore()

  useEffect(() => {
    if (!window.wechatAuth) return
    window.wechatAuth.getPort().then(setPort).catch(() => {})
    window.wechatAuth.onLoginSuccess((u) => setUser(u))
  }, [])

  const handleLogin = () => {
    if (!appid || !port) return
    setLoggingIn(true)

    const redirectUri = encodeURIComponent('https://YOUR_WORKER.workers.dev/callback')
    window.open(`https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appid}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_userinfo&state=${port}#wechat_redirect`, '_blank')
  }

  if (user) {
    return (
      <div className="wechat-user-info">
        {user.avatar && <img src={user.avatar} className="wechat-avatar" alt="" />}
        <span className="wechat-nickname">{user.nickname}</span>
      </div>
    )
  }

  return (
    <button className="header-btn" onClick={handleLogin} disabled={isLoggingIn || !port} title="微信登录">
      🔑
    </button>
  )
}
