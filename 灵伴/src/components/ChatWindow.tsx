import React, { useRef, useEffect, useCallback, useState } from 'react'
import { useChatStore } from '../store/chatStore'
import { useSettingsStore } from '../store/settingsStore'
import { Live2DCharacter } from './Live2DCharacter'
import { ChatHeader } from './ChatHeader'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { PersonaEditor } from './PersonaEditor'
import { SettingsPanel } from './SettingsPanel'
import { loadTips, getTimeGreeting, getSeasonalTip, getRandomTip } from '../services/tipsService'
import type { TipsData } from '../services/tipsService'

export const ChatWindow: React.FC = () => {
  const {
    messages, persona, isTyping, expression, isSpeaking, error,
    sendMessage, setPersona, clearChat, clearError
  } = useChatStore()
  const { aiSettings, ttsSettings } = useSettingsStore()

  const [showEditor, setShowEditor] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [tipText, setTipText] = useState('')
  const [tipVisible, setTipVisible] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const tipsRef = useRef<TipsData | null>(null)
  const greetingTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    loadTips().then((tips) => {
      tipsRef.current = tips

      const timeGreeting = getTimeGreeting(tips)
      const seasonal = getSeasonalTip(tips)
      const greeting = seasonal
        ? `${seasonal} ${timeGreeting || '今天想聊点什么呢？'}`
        : timeGreeting || '你好呀~'
      greetingTimerRef.current = setTimeout(() => {
        sendMessage(greeting, aiSettings, ttsSettings)
      }, 600)
    })

    return () => clearTimeout(greetingTimerRef.current)
  }, [])

  // 随机提示气泡（每 15 秒换一次）
  useEffect(() => {
    if (!tipsRef.current) return
    const showTip = () => {
      const tip = getRandomTip(tipsRef.current!)
      setTipText(tip)
      setTipVisible(true)
      setTimeout(() => setTipVisible(false), 5000)
    }
    showTip() // 首次立即显示
    const interval = setInterval(showTip, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 8000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const handleSend = useCallback((text: string) => {
    sendMessage(text, aiSettings, ttsSettings)
  }, [aiSettings, ttsSettings, sendMessage])

  const handleVoiceInput = useCallback((text: string) => {
    sendMessage(text, aiSettings, ttsSettings)
  }, [aiSettings, ttsSettings, sendMessage])

  return (
    <div className="chat-window">
      <ChatHeader
        persona={persona}
        onEditPersona={() => setShowEditor(true)}
        onSettings={() => setShowSettings(true)}
        onClearChat={clearChat}
      />

      <div className="chat-body">
        <div className="live2d-area">
          <Live2DCharacter
            expression={expression}
            persona={persona}
            isSpeaking={isSpeaking}
            isTyping={isTyping}
          />
          {tipVisible && tipText && (
            <div className="tip-bubble" key={tipText}>
              <span>{tipText}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="error-banner" onClick={clearError}>
            ⚠️ {error}
          </div>
        )}

        <div className="chat-messages">
          <div className="messages-container">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                persona={persona}
                ttsSettings={ttsSettings}
              />
            ))}
            {isTyping && (
              <div className="typing-indicator">
                <div className="msg-avatar">
                  <span>{persona.emoji}</span>
                </div>
                <div className="typing-dots">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>

      <ChatInput onSend={handleSend} disabled={isTyping} onVoiceInput={handleVoiceInput} />

      {showEditor && (
        <PersonaEditor
          persona={persona}
          onChange={setPersona}
          onClose={() => setShowEditor(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
