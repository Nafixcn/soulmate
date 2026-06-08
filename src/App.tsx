import React, { useEffect, useState } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { useSettingsStore } from './store/settingsStore'
import { useAuthStore } from './store/authStore'

const App: React.FC = () => {
  const loadFromStorage = useSettingsStore(s => s.loadFromStorage)
  const loadUser = useAuthStore(s => s.loadFromStorage)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadFromStorage()
    loadUser()
    setReady(true)
  }, [loadFromStorage, loadUser])

  if (!ready) return null

  return <ChatWindow />
}

export default App
