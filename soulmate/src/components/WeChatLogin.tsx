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
  const onLoginRef = useRef(onLogin)
  onLoginRef.current = onLogin

  useEffect(() => {
    const unlisten = listen<WeChatUser>('auth-success', (event) => {
      setUser(event.payload)
      setLoggingIn(false)
      onLoginRef.current?.(event.payload)
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  const handleLogin = async () => {
    if (!WECHAT_APPID) return
    setLoggingIn(true)
    try {
      const authPort = await invoke<number>('start_auth_server')
      const redirectUri = encodeURIComponent(`https://${WECHAT_WORKER}/callback`)
      window.open(
        `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${WECHAT_APPID}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_userinfo&state=${authPort}#wechat_redirect`,
        '_blank',
      )
    } catch (e) {
      console.error('Failed to start auth:', e)
      setLoggingIn(false)
    }
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
    <button className="header-btn" onClick={handleLogin} disabled={loggingIn} title="微信登录">
      <LogIn size={18} />
    </button>
  )
}
