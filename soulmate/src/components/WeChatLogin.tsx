import React, { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { WECHAT_APPID, WECHAT_WORKER } from '../config/wechat'
import { LogIn } from 'lucide-react'

interface WeChatUser {
  openid: string
  nickname: string
  avatar: string
}

interface Props {
  onLogin?: (user: WeChatUser) => void
}

export const WeChatLogin: React.FC<Props> = ({ onLogin }) => {
  const [user, setUser] = React.useState<WeChatUser | null>(null)
  const [loggingIn, setLoggingIn] = React.useState(false)
  const [port, setPort] = React.useState(0)
  const onLoginRef = useRef(onLogin)
  onLoginRef.current = onLogin

  useEffect(() => {
    invoke<number>('get_auth_port').then(setPort).catch(() => {})
    const unlisten = listen<WeChatUser>('auth-success', (event) => {
      setUser(event.payload)
      setLoggingIn(false)
      onLoginRef.current?.(event.payload)
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  const handleLogin = () => {
    if (!WECHAT_APPID || !port) return
    setLoggingIn(true)
    const redirectUri = encodeURIComponent(`https://${WECHAT_WORKER}/callback`)
    window.open(
      `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${WECHAT_APPID}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_userinfo&state=${port}#wechat_redirect`,
      '_blank'
    )
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
    <button className="header-btn" onClick={handleLogin} disabled={loggingIn || !port} title="微信登录">
      <LogIn size={18} />
    </button>
  )
}
