import React, { useRef, useEffect, useCallback, useState } from 'react'
import { useChatStore } from '../store/chatStore'
import { useSettingsStore } from '../store/settingsStore'
import { invoke } from '@tauri-apps/api/core'
import { ChatHeader } from './ChatHeader'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { PersonaEditor } from './PersonaEditor'
import { PersonaManager } from './PersonaManager'
import { SettingsPanel } from './SettingsPanel'
import { SearchPanel } from './SearchPanel'
import { AlertTriangle, Search, Download } from 'lucide-react'

const PETALS = ['🌸', '💮', '🏵️', '🌺', '✿', '❀', '🌸', '💮']
const petalCount = 12

const GREETINGS = [
  '哥哥在干嘛呀~',
  '有点想你了呢…',
  '今天天气不错，出去走走吧~',
  '你吃饭了吗？别饿着哦',
  '我刚才看了个有趣的视频！',
  '工作累不累呀，休息一下吧',
  '晚上好~今天过得开心吗？',
  '给你分享一首歌吧 🎵',
  '你知道吗，我刚刚学会了一个新词~',
  '春天来了，樱花开了呢 🌸',
  '要不要听个笑话？',
  '我学会了一道新菜的做法！',
  '今天心情怎么样呀？',
  '突然好想抱抱你…',
  '中午了，记得吃午饭哦',
  '你猜我今天做了什么梦~',
  '有人说晚上聊天特别有感觉',
  '我最近在看一本书，挺有意思的',
]

function scheduleDailyGreetings(addGreeting: (text: string) => void) {
  const now = new Date()
  const count = 4 + Math.floor(Math.random() * 3)
  const usedHours = new Set<number>()
  const timers: ReturnType<typeof setTimeout>[] = []

  for (let i = 0; i < count; i++) {
    let hour: number
    do {
      hour = 9 + Math.floor(Math.random() * 13)
    } while (usedHours.has(hour))
    usedHours.add(hour)

    const min = Math.floor(Math.random() * 50)
    const target = new Date(now)
    target.setHours(hour, min, 0, 0)
    if (target <= now) target.setDate(target.getDate() + 1)

    const delay = target.getTime() - now.getTime()
    const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
    timers.push(setTimeout(() => {
      addGreeting(greeting)
      showNotification(greeting)
    }, delay))
  }

  return timers
}

function showNotification(body: string) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission === 'granted') {
    new Notification('灵伴', { body, silent: false })
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification('灵伴', { body, silent: false })
    })
  }
}

function exportChat(messages: { role: string; content: string; timestamp: number }[], personaName: string): void {
  const lines = messages.map(m => {
    const time = new Date(m.timestamp).toLocaleString('zh-CN')
    const sender = m.role === 'user' ? '我' : personaName
    return `[${time}] ${sender}：${m.content}`
  })
  const md = `# 与${personaName}的聊天记录\n\n导出时间：${new Date().toLocaleString('zh-CN')}\n\n---\n\n${lines.join('\n\n')}`
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `soulmate-chat-${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(url)
}

export const ChatWindow: React.FC = () => {
  const messages = useChatStore(s => s.messages)
  const isTyping = useChatStore(s => s.isTyping)
  const error = useChatStore(s => s.error)
  const streamingContent = useChatStore(s => s.streamingContent)
  const streamingThinking = useChatStore(s => s.streamingThinking)
  const sendMessage = useChatStore(s => s.sendMessage)
  const clearChat = useChatStore(s => s.clearChat)
  const clearError = useChatStore(s => s.clearError)
  const loadMessages = useChatStore(s => s.loadMessages)
  const deleteFrom = useChatStore(s => s.deleteFrom)
  const regenerate = useChatStore(s => s.regenerate)
  const { aiSettings, ttsSettings, persona, personas, activePersonaIndex, setPersona, switchPersona } = useSettingsStore()

  const [showEditor, setShowEditor] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showManagePersonas, setShowManagePersonas] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [streamingThinkOpen, setStreamingThinkOpen] = useState(true)
  const [petals] = useState(() =>
    Array.from({ length: petalCount }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 12,
      duration: 8 + Math.random() * 10,
      size: 14 + Math.random() * 14,
      emoji: PETALS[Math.floor(Math.random() * PETALS.length)],
    }))
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const loaded = useRef(false)
  const greetingTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const messagesRef = useRef<HTMLDivElement>(null)

  const addGreeting = useCallback((text: string) => {
    const msg = {
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: text,
      timestamp: Date.now()
    }
    useChatStore.setState(s => ({
      messages: [...s.messages, msg]
    }))
    invoke('save_message', { message: msg }).catch(e => {
      console.error('Failed to save greeting:', e)
    })
  }, [])

  useEffect(() => {
    loadMessages().finally(() => { loaded.current = true })
  }, [loadMessages])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isTyping, streamingContent])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const showInitialGreeting = () => {
      useChatStore.setState({ messages: [greeting] })
      invoke('save_message', { message: greeting }).catch(e => {
        console.error('Failed to save initial greeting:', e)
      })
    }

    const greeting = {
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: '你好呀~今天想聊点什么呢？',
      timestamp: Date.now()
    }

    const interval = setInterval(() => {
      const msgs = useChatStore.getState().messages
      if (loaded.current && msgs.length === 0) {
        showInitialGreeting()
        clearInterval(interval)
      }
      if (msgs.length > 0) {
        clearInterval(interval)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (error) { const t = setTimeout(clearError, 8000); return () => clearTimeout(t) }
  }, [error, clearError])

  useEffect(() => {
    greetingTimers.current = scheduleDailyGreetings(addGreeting)
    return () => {
      greetingTimers.current.forEach(clearTimeout)
      greetingTimers.current = []
    }
  }, [addGreeting])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowEditor(false)
        setShowSettings(false)
        setShowManagePersonas(false)
        setShowSearch(false)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch(prev => !prev)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault()
        exportChat(messages, persona.name)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [messages, persona.name])

  const handleSend = useCallback((text: string) => sendMessage(text, persona, aiSettings, ttsSettings), [persona, aiSettings, ttsSettings, sendMessage])

  const handleDeleteFrom = useCallback((ts: number) => {
    deleteFrom(ts)
  }, [deleteFrom])

  const handleRegenerate = useCallback(() => {
    regenerate(persona, aiSettings, ttsSettings)
  }, [persona, aiSettings, ttsSettings, regenerate])

  const scrollToMessage = useCallback((timestamp: number) => {
    const el = messagesRef.current?.querySelector(`[data-ts="${timestamp}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('msg-highlight')
      setTimeout(() => el.classList.remove('msg-highlight'), 2000)
    }
  }, [])

  const lastAssistantIdx = messages.reduce((acc, m, i) => m.role === 'assistant' ? i : acc, -1)

  return (
    <div className="chat-window">
      <div className="sakura-petals">
        {petals.map(p => (
          <div key={p.id} className="sakura-petal" style={{
            left: `${p.left}%`, animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`, fontSize: p.size,
          }}>{p.emoji}</div>
        ))}
      </div>
      <ChatHeader
        persona={persona} personas={personas} activePersonaIndex={activePersonaIndex}
        onEditPersona={() => setShowEditor(true)}
        onManagePersonas={() => setShowManagePersonas(true)}
        onSettings={() => setShowSettings(true)}
        onClearChat={clearChat}
        onSwitchPersona={switchPersona}
      />
      <div className="chat-body">
        {error && <div className="error-banner" onClick={clearError}><AlertTriangle size={14} /> {error}</div>}
        {showSearch && <SearchPanel messages={messages} onClose={() => setShowSearch(false)} onScrollTo={scrollToMessage} />}
        <div className="chat-toolbar">
          <button className="toolbar-btn" onClick={() => setShowSearch(!showSearch)} title="搜索 (Ctrl+F)">
            <Search size={14} />
          </button>
          <button className="toolbar-btn" onClick={() => exportChat(messages, persona.name)} title="导出 (Ctrl+E)">
            <Download size={14} />
          </button>
        </div>
        <div className="chat-messages" ref={messagesRef}>
          <div className="messages-container">
            {messages.map((msg, idx) => (
              <div key={msg.id} data-ts={msg.timestamp}>
                <MessageBubble
                  message={msg}
                  persona={persona}
                  onDelete={handleDeleteFrom}
                  onRegenerate={idx === lastAssistantIdx ? handleRegenerate : undefined}
                  isLast={idx === lastAssistantIdx}
                />
              </div>
            ))}
            {isTyping && !streamingContent && (
              <div className="typing-indicator">
                <div className="msg-avatar">
                  {persona.avatar
                    ? <img src={persona.avatar} className="avatar-img-msg" alt="" />
                    : <span>{persona.emoji}</span>
                  }
                </div>
                <div className="typing-dots"><span></span><span></span><span></span></div>
              </div>
            )}
            {isTyping && streamingContent && (
              <div className="msg-row">
                <div className="msg-avatar">
                  {persona.avatar
                    ? <img src={persona.avatar} className="avatar-img-msg" alt="" />
                    : <span>{persona.emoji}</span>
                  }
                </div>
                <div className="msg-body">
                  {streamingThinking && (
                    <div className="thinking-wrapper">
                      <div className="thinking-toggle" onClick={() => setStreamingThinkOpen(!streamingThinkOpen)}>
                        <span className="think-arrow">{streamingThinkOpen ? '▾' : '▸'}</span>
                        思考过程
                      </div>
                      {streamingThinkOpen && <div className="thinking-block">{streamingThinking}</div>}
                    </div>
                  )}
                  <div className="msg-bubble ai-bubble streaming-markdown">
                    {streamingContent}<span className="cursor-blink">|</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>
      <ChatInput onSend={handleSend} disabled={isTyping} />
      {showEditor && <PersonaEditor persona={persona} onChange={setPersona} onClose={() => setShowEditor(false)} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showManagePersonas && (
        <PersonaManager
          personas={personas}
          activeIndex={activePersonaIndex}
          onAdd={(p) => useSettingsStore.getState().addPersona(p)}
          onUpdate={(i, p) => useSettingsStore.getState().updatePersona(i, p)}
          onRemove={(i) => useSettingsStore.getState().removePersona(i)}
          onSwitch={switchPersona}
          onClose={() => setShowManagePersonas(false)}
        />
      )}
    </div>
  )
}
