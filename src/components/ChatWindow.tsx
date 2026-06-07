import React, { useRef, useEffect, useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useSettingsStore } from '../store/settingsStore'
import { CharacterAvatar } from './CharacterAvatar'
import { ChatHeader } from './ChatHeader'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { PersonaEditor } from './PersonaEditor'
import { SettingsPanel } from './SettingsPanel'

export const ChatWindow: React.FC = () => {
  const {
    messages, persona, isTyping, expression, isSpeaking, error,
    sendMessage, setPersona, clearChat, clearError
  } = useChatStore()
  const { aiSettings, ttsSettings } = useSettingsStore()

  const [showEditor, setShowEditor] = React.useState(false)
  const [showSettings, setShowSettings] = React.useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  useEffect(() => {
    if (!initialized.current && messages.length === 0) {
      initialized.current = true
      const timer = setTimeout(() => {
        sendMessage('你好', aiSettings, ttsSettings)
      }, 600)
      return () => clearTimeout(timer)
    }
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
        <CharacterAvatar
          expression={expression}
          persona={persona}
          isSpeaking={isSpeaking}
          isTyping={isTyping}
        />

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
