import React, { useEffect, useState } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useSettingsStore } from './store/settingsStore'

const App: React.FC = () => {
  const loadFromStorage = useSettingsStore((s) => s.loadFromStorage)
  const theme = useSettingsStore((s) => s.theme)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadFromStorage().finally(() => setReady(true))
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

  if (!ready) return null
  return (
    <ErrorBoundary>
      <ChatWindow />
    </ErrorBoundary>
  )
}

export default App
