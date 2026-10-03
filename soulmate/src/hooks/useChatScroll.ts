import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message } from '../types'

interface ChatScrollOptions {
  personaId: string
  messages: Message[]
  isTyping: boolean
  hasMore: boolean
  isLoadingMore: boolean
  loadEarlierMessages: () => Promise<void>
}

function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export function useChatScroll({
  personaId,
  messages,
  isTyping,
  hasMore,
  isLoadingMore,
  loadEarlierMessages,
}: ChatScrollOptions) {
  const messagesRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const loadingEarlierRef = useRef(false)
  const scrollPersonaRef = useRef(personaId)
  const followingRef = useRef(true)
  const scrollFrameRef = useRef<number | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [awayPersonaId, setAwayPersonaId] = useState<string | null>(null)
  const isAwayFromLatest = awayPersonaId === personaId
  const setIsAwayFromLatest = useCallback((away: boolean) => setAwayPersonaId(away ? personaId : null), [personaId])

  const followLatest = useCallback(() => {
    if (!followingRef.current || loadingEarlierRef.current || scrollFrameRef.current !== null) return
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null
      if (!followingRef.current || loadingEarlierRef.current) return
      // Repeated smooth scrolling would continually restart the animation during a stream.
      bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
    })
  }, [])

  useEffect(() => {
    scrollPersonaRef.current = personaId
    loadingEarlierRef.current = false
    followingRef.current = true
    followLatest()
  }, [personaId, followLatest])

  useEffect(() => {
    const element = messagesRef.current
    if (!element) return

    const handleScroll = () => {
      const nearBottom = element.scrollHeight - element.clientHeight - element.scrollTop <= 80
      followingRef.current = nearBottom
      setIsAwayFromLatest(!nearBottom)
      if (element.scrollTop >= 40 || !hasMore || isLoadingMore || loadingEarlierRef.current) return

      const previousHeight = element.scrollHeight
      const loadingPersonaId = scrollPersonaRef.current
      loadingEarlierRef.current = true
      void loadEarlierMessages().finally(() => {
        requestAnimationFrame(() => {
          if (loadingPersonaId !== scrollPersonaRef.current) return
          loadingEarlierRef.current = false
          if (!element.isConnected) return
          element.scrollTop += element.scrollHeight - previousHeight
        })
      })
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => element.removeEventListener('scroll', handleScroll)
  }, [hasMore, isLoadingMore, loadEarlierMessages, setIsAwayFromLatest])

  useEffect(() => {
    followLatest()
  }, [messages, isTyping, followLatest])

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current)
      scrollFrameRef.current = null
      if (highlightTimerRef.current !== null) clearTimeout(highlightTimerRef.current)
    },
    [],
  )

  const scrollToMessage = useCallback(
    (messageId: string) => {
      const message = messagesRef.current?.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)
      if (!message) return

      followingRef.current = false
      setIsAwayFromLatest(true)
      message.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'center' })
      message.classList.add('msg-highlight')
      if (highlightTimerRef.current !== null) clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = setTimeout(() => message.classList.remove('msg-highlight'), 2000)
    },
    [setIsAwayFromLatest],
  )

  const returnToLatest = useCallback(() => {
    followingRef.current = true
    setIsAwayFromLatest(false)
    // Restore follow mode before the next streamed chunk arrives.
    bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
  }, [setIsAwayFromLatest])

  return { messagesRef, bottomRef, scrollToMessage, followLatest, isAwayFromLatest, returnToLatest }
}
