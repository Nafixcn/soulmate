import { useCallback, useEffect, useRef } from 'react'
import type { Message } from '../types'

interface ChatScrollOptions {
  messages: Message[]
  isTyping: boolean
  streamingContent: string
  hasMore: boolean
  isLoadingMore: boolean
  loadEarlierMessages: () => Promise<void>
}

export function useChatScroll({
  messages,
  isTyping,
  streamingContent,
  hasMore,
  isLoadingMore,
  loadEarlierMessages,
}: ChatScrollOptions) {
  const messagesRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const loadingEarlierRef = useRef(false)

  useEffect(() => {
    const element = messagesRef.current
    if (!element) return

    const handleScroll = () => {
      if (element.scrollTop >= 40 || !hasMore || isLoadingMore || loadingEarlierRef.current) return

      const previousHeight = element.scrollHeight
      loadingEarlierRef.current = true
      void loadEarlierMessages().finally(() => {
        requestAnimationFrame(() => {
          element.scrollTop += element.scrollHeight - previousHeight
          loadingEarlierRef.current = false
        })
      })
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => element.removeEventListener('scroll', handleScroll)
  }, [hasMore, isLoadingMore, loadEarlierMessages])

  useEffect(() => {
    if (!loadingEarlierRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isTyping, streamingContent])

  const scrollToMessage = useCallback((messageId: string) => {
    const message = messagesRef.current?.querySelector(`[data-message-id="${messageId}"]`)
    if (!message) return

    message.scrollIntoView({ behavior: 'smooth', block: 'center' })
    message.classList.add('msg-highlight')
    setTimeout(() => message.classList.remove('msg-highlight'), 2000)
  }, [])

  return { messagesRef, bottomRef, scrollToMessage }
}
