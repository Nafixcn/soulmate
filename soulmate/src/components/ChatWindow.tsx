import React, { useRef, useEffect, useCallback, useState } from 'react'
import { useChatStore } from '../store/chatStore'
import { useSettingsStore } from '../store/settingsStore'
import { ChatHeader } from './ChatHeader'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { PersonaEditor } from './PersonaEditor'
import { SettingsPanel } from './SettingsPanel'
import { AlertTriangle } from 'lucide-react'

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
  const dayStart = new Date(now)
  dayStart.setHours(8, 0, 0, 0)
  if (now > dayStart) dayStart.setDate(dayStart.getDate() + 1)

  const count = 4 + Math.floor(Math.random() * 3) // 4-6
  const usedHours = new Set<number>()

  for (let i = 0; i < count; i++) {
    let hour: number
    do {
      hour = 9 + Math.floor(Math.random() * 13) // 9 AM - 9 PM
    } while (usedHours.has(hour))
    usedHours.add(hour)

    const min = Math.floor(Math.random() * 50)
    const target = new Date(now)
    target.setHours(hour, min, 0, 0)
    if (target <= now) target.setDate(target.getDate() + 1)

    const delay = target.getTime() - now.getTime()
    const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
    setTimeout(() => addGreeting(greeting), delay)
  }
}

export const ChatWindow: React.FC = () => {
  const store = useChatStore()
  const { messages, isTyping, error, streamingContent, streamingThinking,
    sendMessage, clearChat, clearError, loadMessages } = store
  const { aiSettings, ttsSettings, persona, setPersona } = useSettingsStore()

  const [showEditor, setShowEditor] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
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
  const greetingTimer = useRef(false)

  const addGreeting = useCallback((text: string) => {
    const id = crypto.randomUUID()
    useChatStore.setState(s => ({
      messages: [...s.messages, { id, role: 'assistant' as const, content: text, timestamp: Date.now() }]
    }))
  }, [])

  useEffect(() => { loadMessages() }, [loadMessages])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isTyping, streamingContent])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    if (messages.length === 0) {
      useChatStore.setState({
        messages: [{
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: '你好呀~今天想聊点什么呢？',
          timestamp: Date.now()
        }]
      })
    }
  }, [messages.length])

  useEffect(() => {
    if (error) { const t = setTimeout(clearError, 8000); return () => clearTimeout(t) }
  }, [error, clearError])

  useEffect(() => {
    if (greetingTimer.current) return
    greetingTimer.current = true
    scheduleDailyGreetings(addGreeting)
  }, [addGreeting])

  const handleSend = useCallback((text: string) => sendMessage(text, persona, aiSettings, ttsSettings), [persona, aiSettings, ttsSettings, sendMessage])

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
        <ChatHeader persona={persona} onEditPersona={() => setShowEditor(true)}
        onSettings={() => setShowSettings(true)} onClearChat={clearChat} />
      <div className="chat-body">
        {error && <div className="error-banner" onClick={clearError}><AlertTriangle size={14} /> {error}</div>}
        <div className="chat-messages">
          <div className="messages-container">
            {messages.map((msg) => <MessageBubble key={msg.id} message={msg} persona={persona} />)}
            {isTyping && !streamingContent && (
              <div className="typing-indicator">
                <div className="msg-avatar"><span>{persona.emoji}</span></div>
                <div className="typing-dots"><span></span><span></span><span></span></div>
              </div>
            )}
            {isTyping && streamingContent && (
              <div className="msg-row">
                <div className="msg-avatar"><span>{persona.emoji}</span></div>
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
                  <div className="msg-bubble ai-bubble">{streamingContent}<span className="cursor-blink">|</span></div>
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
    </div>
  )
}
