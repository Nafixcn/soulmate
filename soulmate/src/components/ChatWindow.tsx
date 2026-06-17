import React, { useRef, useEffect, useCallback, useState } from 'react'
import { useChatStore } from '../store/chatStore'
import { useSettingsStore } from '../store/settingsStore'
import { ChatHeader } from './ChatHeader'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { PersonaEditor } from './PersonaEditor'
import { SettingsPanel } from './SettingsPanel'
import { AlertTriangle } from 'lucide-react'

export const ChatWindow: React.FC = () => {
  const store = useChatStore()
  const { messages, persona, isTyping, error, streamingContent, streamingThinking,
    sendMessage, setPersona, clearChat, clearError, loadMessages } = store
  const { aiSettings, ttsSettings } = useSettingsStore()

  const [showEditor, setShowEditor] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

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

  const handleSend = useCallback((text: string) => sendMessage(text, aiSettings, ttsSettings), [aiSettings, ttsSettings, sendMessage])

  return (
    <div className="chat-window">
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
                  {streamingThinking && <div className="thinking-block">{streamingThinking}</div>}
                  <div className="msg-bubble ai-bubble">{streamingContent}<span className="cursor-blink">|</span></div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>
      <ChatInput onSend={handleSend} disabled={isTyping} onVoiceInput={handleSend} />
      {showEditor && <PersonaEditor persona={persona} onChange={setPersona} onClose={() => setShowEditor(false)} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}
