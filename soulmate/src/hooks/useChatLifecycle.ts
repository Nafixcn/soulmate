import { useCallback, useEffect } from 'react'
import { useChatStore } from '../store/chatStore'
import { buildGroundedGreeting, scheduleDailyGreetings, showGreetingNotification } from '../services/greetingService'
import { conversationGateway } from '../services/conversationGateway'
import type { GreetingSettings, Message } from '../types'

const INITIAL_GREETING = '你好呀~今天想聊点什么呢？'

interface ChatLifecycleOptions {
  personaId: string
  error: string | null
  clearError: () => void
  loadMessages: (personaId: string) => Promise<void>
  preferredAddress: string
  interests: string
  greetingSettings: GreetingSettings
}

export function useChatLifecycle({
  personaId,
  error,
  clearError,
  loadMessages,
  preferredAddress,
  interests,
  greetingSettings,
}: ChatLifecycleOptions): void {
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
        await conversationGateway.saveMessage(personaId, message)
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

  useEffect(
    () =>
      scheduleDailyGreetings(greetingSettings, () => {
        const state = useChatStore.getState()
        if (state.activePersonaId !== personaId) return
        const lastUserMessage = [...state.messages].reverse().find((message) => message.role === 'user')?.content
        const greeting = buildGroundedGreeting({ preferredAddress, interests, lastUserMessage })
        void addGreeting(greeting)
        showGreetingNotification(greeting)
      }),
    [addGreeting, greetingSettings, interests, personaId, preferredAddress],
  )
}
