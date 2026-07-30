import React, { useState } from 'react'
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!/^\d{4,12}$/.test(pin)) {
      setError('请输入 4-12 位数字 PIN')
      return
    }

    setChecking(true)
    setError(null)
    try {
      if (await appLock.verifyPin(pin)) {
        onUnlock()
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
                {error}
              </p>
            )}
            <button type="submit" className="tag active" disabled={checking || pin.length < 4}>
              <Unlock size={14} aria-hidden="true" /> {checking ? '验证中...' : '解锁'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
