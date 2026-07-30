import React, { useCallback, useState, useMemo } from 'react'
import { useChatStore } from '../store/chatStore'
import { useSettingsStore } from '../store/settingsStore'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChatLifecycle } from '../hooks/useChatLifecycle'
import { useChatScroll } from '../hooks/useChatScroll'
import { useChatShortcuts } from '../hooks/useChatShortcuts'
import { exportFullChatTranscript } from '../services/chatExport'
import { ChatHeader } from './ChatHeader'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { PersonaEditor } from './PersonaEditor'
import { PersonaManager } from './PersonaManager'
import { SettingsPanel } from './SettingsPanel'
import { SearchPanel } from './SearchPanel'
import { AlertTriangle, Search, Download } from 'lucide-react'

const petalCount = 12

function petalRandom(index: number, salt: number): number {
  const value = Math.sin((index + 1) * (salt + 1) * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

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
  const revealMessage = useChatStore((s) => s.revealMessage)
  const hasMore = useChatStore((s) => s.hasMore)
  const isLoadingMore = useChatStore((s) => s.isLoadingMore)
  const isLoadingConversation = useChatStore((s) => s.isLoadingConversation)
  const deleteFrom = useChatStore((s) => s.deleteFrom)
  const regenerate = useChatStore((s) => s.regenerate)
  const {
    aiSettings,
    ttsSettings,
    persona,
    personas,
    activePersonaIndex,
    setPersona,
    switchPersona,
    theme,
    aiConfigured,
    persistenceError,
    clearPersistenceError,
    userProfile,
    greetingSettings,
  } = useSettingsStore()

  const [showEditor, setShowEditor] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showManagePersonas, setShowManagePersonas] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [streamingThinkOpen, setStreamingThinkOpen] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const streamingThinkingId = React.useId()
  const [petals] = useMemo(() => {
    const arr = Array.from({ length: petalCount }, (_, i) => ({
      id: i,
      left: petalRandom(i, 0) * 100,
      delay: petalRandom(i, 1) * 12,
      duration: 8 + petalRandom(i, 2) * 10,
      size: 14 + petalRandom(i, 3) * 14,
      emoji: theme.petals[Math.floor(petalRandom(i, 4) * theme.petals.length)],
    }))
    return [arr] as const
  }, [theme.petals])
  useChatLifecycle({
    personaId: persona.id,
    error,
    clearError,
    loadMessages,
    preferredAddress: userProfile.preferredAddress,
    interests: userProfile.interests,
    greetingSettings,
  })

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
  const handleExport = useCallback(() => {
    void exportFullChatTranscript(persona.id, persona.name)
      .then(() => setActionError(null))
      .catch((exportError) => {
        console.error('Failed to export chat:', exportError)
        setActionError('导出失败，请稍后重试')
      })
  }, [persona.id, persona.name])

  useChatShortcuts({ closeOverlays, toggleSearch, exportChat: handleExport })

  const handleSend = useCallback(
    (text: string) => {
      if (!aiConfigured) {
        setShowSettings(true)
        return Promise.resolve()
      }
      return sendMessage(text, persona, aiSettings, ttsSettings)
    },
    [persona, aiSettings, ttsSettings, aiConfigured, sendMessage],
  )

  const handleSearchResult = useCallback(
    async (messageId: string) => {
      const revealed = await revealMessage(messageId)
      if (!revealed) return false
      requestAnimationFrame(() => scrollToMessage(messageId))
      return true
    },
    [revealMessage, scrollToMessage],
  )

  const handleDeleteFrom = useCallback(
    (messageId: string) => {
      deleteFrom(messageId)
    },
    [deleteFrom],
  )

  const handleClearChat = useCallback(() => {
    if (messages.length === 0 || !window.confirm('清空当前角色的全部聊天记录？')) return
    void clearChat()
  }, [clearChat, messages.length])

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
        onClearChat={handleClearChat}
        onSwitchPersona={switchPersona}
      />
      <div className="chat-main">
        <div className="chat-body">
          {error && (
            <button type="button" className="error-banner" onClick={clearError} aria-label={`关闭错误提示：${error}`}>
              <AlertTriangle size={14} /> {error}
            </button>
          )}
          {persistenceError && (
            <button
              type="button"
              className="error-banner"
              onClick={clearPersistenceError}
              aria-label={`关闭存储错误提示：${persistenceError}`}
            >
              <AlertTriangle size={14} /> {persistenceError}
            </button>
          )}
          {actionError && (
            <button
              type="button"
              className="error-banner"
              onClick={() => setActionError(null)}
              aria-label={`关闭操作错误提示：${actionError}`}
            >
              <AlertTriangle size={14} /> {actionError}
            </button>
          )}
          {showSearch && (
            <SearchPanel personaId={persona.id} onClose={() => setShowSearch(false)} onScrollTo={handleSearchResult} />
          )}
          <div className="chat-toolbar">
            <button
              type="button"
              className="toolbar-btn"
              onClick={toggleSearch}
              title="搜索 (Ctrl+F)"
              aria-label="搜索聊天消息"
            >
              <Search size={14} />
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={handleExport}
              title="导出 (Ctrl+E)"
              aria-label="导出聊天记录"
            >
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
                        <button
                          type="button"
                          className="thinking-toggle"
                          onClick={() => setStreamingThinkOpen(!streamingThinkOpen)}
                          aria-expanded={streamingThinkOpen}
                          aria-controls={streamingThinkingId}
                        >
                          <span className="think-arrow" aria-hidden="true">
                            {streamingThinkOpen ? '▾' : '▸'}
                          </span>
                          思考过程
                        </button>
                        {streamingThinkOpen && (
                          <div id={streamingThinkingId} className="thinking-block">
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
