import React, { useCallback, useState, useMemo } from 'react'
import { useChatStore } from '../store/chatStore'
import { useSettingsStore } from '../store/settingsStore'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChatLifecycle } from '../hooks/useChatLifecycle'
import { useChatScroll } from '../hooks/useChatScroll'
import { useChatShortcuts } from '../hooks/useChatShortcuts'
import { downloadChatTranscript } from '../services/chatExport'
import { ChatHeader } from './ChatHeader'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { PersonaEditor } from './PersonaEditor'
import { PersonaManager } from './PersonaManager'
import { SettingsPanel } from './SettingsPanel'
import { SearchPanel } from './SearchPanel'
import { AlertTriangle, Search, Download } from 'lucide-react'

const petalCount = 12

export const ChatWindow: React.FC = () => {
  const messages = useChatStore((s) => s.messages)
  const isTyping = useChatStore((s) => s.isTyping)
  const error = useChatStore((s) => s.error)
  const streamingContent = useChatStore((s) => s.streamingContent)
  const streamingThinking = useChatStore((s) => s.streamingThinking)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const clearChat = useChatStore((s) => s.clearChat)
  const clearError = useChatStore((s) => s.clearError)
  const loadMessages = useChatStore((s) => s.loadMessages)
  const loadEarlierMessages = useChatStore((s) => s.loadEarlierMessages)
  const hasMore = useChatStore((s) => s.hasMore)
  const isLoadingMore = useChatStore((s) => s.isLoadingMore)
  const isLoadingConversation = useChatStore((s) => s.isLoadingConversation)
  const deleteFrom = useChatStore((s) => s.deleteFrom)
  const regenerate = useChatStore((s) => s.regenerate)
  const { aiSettings, ttsSettings, persona, personas, activePersonaIndex, setPersona, switchPersona, theme } =
    useSettingsStore()

  const [showEditor, setShowEditor] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showManagePersonas, setShowManagePersonas] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [streamingThinkOpen, setStreamingThinkOpen] = useState(true)
  const [petals] = useMemo(() => {
    const arr = Array.from({ length: petalCount }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 12,
      duration: 8 + Math.random() * 10,
      size: 14 + Math.random() * 14,
      emoji: theme.petals[Math.floor(Math.random() * theme.petals.length)],
    }))
    return [arr] as const
  }, [theme.petals])
  useChatLifecycle({ personaId: persona.id, error, clearError, loadMessages })

  const { messagesRef, bottomRef, scrollToMessage } = useChatScroll({
    messages,
    isTyping,
    streamingContent,
    hasMore,
    isLoadingMore,
    loadEarlierMessages,
  })

  const closeOverlays = useCallback(() => {
    setShowEditor(false)
    setShowSettings(false)
    setShowManagePersonas(false)
    setShowSearch(false)
  }, [])

  const toggleSearch = useCallback(() => setShowSearch((visible) => !visible), [])
  const handleExport = useCallback(() => downloadChatTranscript(messages, persona.name), [messages, persona.name])

  useChatShortcuts({ closeOverlays, toggleSearch, exportChat: handleExport })

  const handleSend = useCallback(
    (text: string) => sendMessage(text, persona, aiSettings, ttsSettings),
    [persona, aiSettings, ttsSettings, sendMessage],
  )

  const handleDeleteFrom = useCallback(
    (messageId: string) => {
      deleteFrom(messageId)
    },
    [deleteFrom],
  )

  const handleRegenerate = useCallback(
    (aiMessageId: string) => {
      regenerate(persona, aiSettings, ttsSettings, aiMessageId)
    },
    [persona, aiSettings, ttsSettings, regenerate],
  )

  return (
    <div className="chat-window">
      <div className="sakura-petals">
        {petals.map((p) => (
          <div
            key={p.id}
            className="sakura-petal"
            style={{
              left: `${p.left}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              fontSize: p.size,
            }}
          >
            {p.emoji}
          </div>
        ))}
      </div>
      <ChatHeader
        persona={persona}
        personas={personas}
        activePersonaIndex={activePersonaIndex}
        onEditPersona={() => setShowEditor(true)}
        onManagePersonas={() => setShowManagePersonas(true)}
        onSettings={() => setShowSettings(true)}
        onClearChat={clearChat}
        onSwitchPersona={switchPersona}
      />
      <div className="chat-main">
        <div className="chat-body">
          {error && (
            <div className="error-banner" onClick={clearError}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {showSearch && (
            <SearchPanel personaId={persona.id} onClose={() => setShowSearch(false)} onScrollTo={scrollToMessage} />
          )}
          <div className="chat-toolbar">
            <button className="toolbar-btn" onClick={toggleSearch} title="搜索 (Ctrl+F)">
              <Search size={14} />
            </button>
            <button className="toolbar-btn" onClick={handleExport} title="导出 (Ctrl+E)">
              <Download size={14} />
            </button>
          </div>
          <div className="chat-messages" ref={messagesRef}>
            <div className="messages-container">
              {isLoadingMore && <div className="loading-more">加载更早的消息中...</div>}
              {messages.map((msg) => (
                <div key={msg.id} data-message-id={msg.id}>
                  <MessageBubble
                    message={msg}
                    persona={persona}
                    onDelete={handleDeleteFrom}
                    onRegenerate={handleRegenerate}
                  />
                </div>
              ))}
              {isTyping && !streamingContent && (
                <div className="typing-indicator">
                  <div className="msg-avatar">
                    {persona.avatar ? (
                      <img src={persona.avatar} className="avatar-img-msg" alt="" />
                    ) : (
                      <span>{persona.emoji}</span>
                    )}
                  </div>
                  <div className="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
              {isTyping && streamingContent && (
                <div className="msg-row">
                  <div className="msg-avatar">
                    {persona.avatar ? (
                      <img src={persona.avatar} className="avatar-img-msg" alt="" />
                    ) : (
                      <span>{persona.emoji}</span>
                    )}
                  </div>
                  <div className="msg-body">
                    {streamingThinking && (
                      <div className="thinking-wrapper">
                        <div className="thinking-toggle" onClick={() => setStreamingThinkOpen(!streamingThinkOpen)}>
                          <span className="think-arrow">{streamingThinkOpen ? '▾' : '▸'}</span>
                          思考过程
                        </div>
                        {streamingThinkOpen && (
                          <div className="thinking-block">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingThinking}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="msg-bubble ai-bubble streaming-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                      <span className="cursor-blink">|</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        </div>
        <ChatInput onSend={handleSend} disabled={isTyping || isLoadingConversation} />
      </div>
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
