import React, { useEffect, useState } from 'react'
import { KeyRound, RefreshCw, Unlock } from 'lucide-react'
import { appLock } from '../services/appLock'

interface Props {
  unavailable?: boolean
  onRetry: () => void
  onUnlock: () => void
}

export const AppLockScreen: React.FC<Props> = ({ unavailable = false, onRetry, onUnlock }) => {
  const [pin, setPin] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockedUntil, setBlockedUntil] = useState(0)
  const [now, setNow] = useState(0)
  const retryAfterSeconds = Math.max(0, Math.ceil((blockedUntil - now) / 1000))

  useEffect(() => {
    if (retryAfterSeconds <= 0) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [retryAfterSeconds])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!/^\d{4,12}$/.test(pin)) {
      setError('请输入 4-12 位数字 PIN')
      return
    }

    setChecking(true)
    setError(null)
    if (retryAfterSeconds === 0) setBlockedUntil(0)
    try {
      const result = await appLock.verifyPin(pin)
      if (result.unlocked) {
        onUnlock()
      } else if (result.retryAfterMs > 0) {
        const nextBlockedUntil = Date.now() + result.retryAfterMs
        setNow(Date.now())
        setBlockedUntil(nextBlockedUntil)
        setError(`尝试次数过多，请在 ${Math.ceil(result.retryAfterMs / 1000)} 秒后再试`)
        setPin('')
      } else {
        setError('PIN 不正确')
        setPin('')
      }
    } catch (verifyError) {
      console.error('Failed to verify app lock:', verifyError)
      setError('无法访问系统钥匙串')
    } finally {
      setChecking(false)
    }
  }

  return (
    <main className="app-lock-screen">
      <section className="app-lock-panel" aria-labelledby="app-lock-title">
        <KeyRound size={28} aria-hidden="true" />
        <h1 id="app-lock-title">灵伴已锁定</h1>
        {unavailable ? (
          <>
            <p role="alert">无法访问系统钥匙串</p>
            <button type="button" className="tag active" onClick={onRetry}>
              <RefreshCw size={14} aria-hidden="true" /> 重试
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label htmlFor="app-lock-pin">PIN</label>
            <input
              id="app-lock-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
              autoFocus
            />
            {error && (
              <p className="app-lock-error" role="alert">
                {retryAfterSeconds > 0 ? `尝试次数过多，请在 ${retryAfterSeconds} 秒后再试` : error}
              </p>
            )}
            <button type="submit" className="tag active" disabled={checking || pin.length < 4 || retryAfterSeconds > 0}>
              <Unlock size={14} aria-hidden="true" />{' '}
              {checking ? '验证中...' : retryAfterSeconds > 0 ? `${retryAfterSeconds} 秒后重试` : '解锁'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
