import React, { useEffect, useState } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useSettingsStore } from './store/settingsStore'

const App: React.FC = () => {
  const loadFromStorage = useSettingsStore(s => s.loadFromStorage)
  const [ready, setReady] = useState(false)

  useEffect(() => { loadFromStorage(); setReady(true) }, [loadFromStorage])

  if (!ready) return null
  return <ErrorBoundary><ChatWindow /></ErrorBoundary>
}

export default App
