import { useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useChatStore } from '../store/chatStore'
import { scheduleDailyGreetings } from '../services/greetingService'
import type { Message } from '../types'

const INITIAL_GREETING = '你好呀~今天想聊点什么呢？'

interface ChatLifecycleOptions {
  personaId: string
  error: string | null
  clearError: () => void
  loadMessages: (personaId: string) => Promise<void>
}

export function useChatLifecycle({ personaId, error, clearError, loadMessages }: ChatLifecycleOptions): void {
  const addGreeting = useCallback(
    async (content: string) => {
      const message: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
        timestamp: Date.now(),
      }

      useChatStore.setState((state) =>
        state.activePersonaId === personaId ? { messages: [...state.messages, message] } : state,
      )
      try {
        await invoke('save_message', { personaId, message })
      } catch (saveError) {
        console.error('Failed to save greeting:', saveError)
      }
    },
    [personaId],
  )

  useEffect(() => {
    let cancelled = false

    void loadMessages(personaId).then(() => {
      const state = useChatStore.getState()
      if (cancelled || state.activePersonaId !== personaId || state.messages.length > 0) return
      void addGreeting(INITIAL_GREETING)
    })

    return () => {
      cancelled = true
    }
  }, [addGreeting, loadMessages, personaId])

  useEffect(() => {
    if (!error) return
    const timerId = setTimeout(clearError, 8000)
    return () => clearTimeout(timerId)
  }, [error, clearError])

  useEffect(() => scheduleDailyGreetings((greeting) => void addGreeting(greeting)), [addGreeting])
}
