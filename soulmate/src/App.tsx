import React, { useEffect, useState } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppLockScreen } from './components/AppLockScreen'
import { useSettingsStore } from './store/settingsStore'
import { takeStartupWarning } from './services/dataPortability'
import { appLock } from './services/appLock'

type LockStatus = 'checking' | 'locked' | 'unlocked' | 'unavailable'

const App: React.FC = () => {
  const loadFromStorage = useSettingsStore((s) => s.loadFromStorage)
  const theme = useSettingsStore((s) => s.theme)
  const [ready, setReady] = useState(false)
  const [lockStatus, setLockStatus] = useState<LockStatus>('checking')

  const checkAppLock = React.useCallback(async () => {
    try {
      setLockStatus((await appLock.hasLock()) ? 'locked' : 'unlocked')
    } catch (error) {
      console.error('Failed to check app lock:', error)
      setLockStatus('unavailable')
    }
  }, [])

  useEffect(() => {
    const settings = loadFromStorage().catch((error) => {
      console.error('Failed to load application settings:', error)
    })
    const warning = takeStartupWarning().catch((error) => {
      console.error('Failed to load startup warning:', error)
      return null
    })
    const lock = appLock
      .hasLock()
      .then<LockStatus>((enabled) => (enabled ? 'locked' : 'unlocked'))
      .catch((error) => {
        console.error('Failed to check app lock:', error)
        return 'unavailable' as const
      })

    void Promise.all([settings, warning, lock])
      .then(([, startupWarning, initialLockStatus]) => {
        setLockStatus(initialLockStatus)
        if (!startupWarning) return
        useSettingsStore.setState({
          persistenceError: `${startupWarning.message} 原数据库保留在：${startupWarning.isolatedDatabasePath}`,
        })
      })
      .catch((error) => {
        console.error('Failed to initialize application state:', error)
      })
      .finally(() => setReady(true))
  }, [loadFromStorage])

  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--header-bg', theme.primary)
    root.setProperty('--user-bg', theme.userBubble)
    root.setProperty('--bg', theme.bg)
    root.setProperty('--ai-bg', theme.aiBubble)
    root.setProperty('--text', theme.text)
    root.setProperty('--sub', theme.subText)
    root.setProperty('--chat-bg-start', theme.chatBg)
    root.setProperty('--primary', theme.primary)
  }, [theme])

  if (!ready || lockStatus === 'checking') return null
  if (lockStatus !== 'unlocked') {
    return (
      <AppLockScreen
        unavailable={lockStatus === 'unavailable'}
        onRetry={() => {
          setLockStatus('checking')
          void checkAppLock()
        }}
        onUnlock={() => setLockStatus('unlocked')}
      />
    )
  }
  return (
    <ErrorBoundary>
      <ChatWindow />
    </ErrorBoundary>
  )
}

export default App
