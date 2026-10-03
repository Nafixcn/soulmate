import React, { useCallback, useState } from 'react'
import { useChatStore } from '../store/chatStore'
import { useSettingsStore } from '../store/settingsStore'
import { useChatLifecycle } from '../hooks/useChatLifecycle'
import { useChatScroll } from '../hooks/useChatScroll'
import { useChatShortcuts } from '../hooks/useChatShortcuts'
import { exportFullChatTranscript } from '../services/chatExport'
import { ChatHeader } from './ChatHeader'
import { MessageBubble } from './MessageBubble'
import { StreamingMessage } from './StreamingMessage'
import { ChatInput } from './ChatInput'
import { PersonaManager } from './PersonaManager'
import { SettingsPanel } from './SettingsPanel'
import { SearchPanel } from './SearchPanel'
import {
  AlertTriangle,
  Search,
  Download,
  Brain,
  BookOpen,
  Cpu,
  Sparkles,
  ArrowDown,
  Heart,
  Sun,
  ArrowUpRight,
} from 'lucide-react'
import { getModelDisplayName } from '../domain/modelProvider'

export const ChatWindow: React.FC = () => {
  const messages = useChatStore((s) => s.messages)
  const userMsgCount = useChatStore((s) => s.userMsgCount)
  const isTyping = useChatStore((s) => s.isTyping)
  const error = useChatStore((s) => s.error)
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
  const switchAlternative = useChatStore((s) => s.switchAlternative)
  const {
    aiSettings,
    appIcon,
    ttsSettings,
    persona,
    personas,
    activePersonaIndex,
    switchPersona,
    aiConfigured,
    persistenceError,
    clearPersistenceError,
    userProfile,
    greetingSettings,
  } = useSettingsStore()

  const [personaWorkspace, setPersonaWorkspace] = useState<'closed' | 'library' | 'current'>('closed')
  const [showSettings, setShowSettings] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<'ai' | 'memory'>('ai')
  const [showSearch, setShowSearch] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  useChatLifecycle({
    personaId: persona.id,
    error,
    clearError,
    loadMessages,
    preferredAddress: userProfile.preferredAddress,
    interests: userProfile.interests,
    greetingSettings,
  })

  const { messagesRef, bottomRef, scrollToMessage, followLatest, isAwayFromLatest, returnToLatest } = useChatScroll({
    personaId: persona.id,
    messages,
    isTyping,
    hasMore,
    isLoadingMore,
    loadEarlierMessages,
  })

  const closeOverlays = useCallback(() => {
    setPersonaWorkspace('closed')
    setShowSettings(false)
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
        setSettingsInitialTab('ai')
        setShowSettings(true)
        return Promise.resolve(false)
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

  const handleSwitchAlternative = useCallback(
    (messageId: string, direction: -1 | 1) => void switchAlternative(messageId, direction),
    [switchAlternative],
  )

  const openMemorySettings = useCallback(() => {
    setSettingsInitialTab('memory')
    setShowSettings(true)
  }, [])

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

  const enabledLoreEntries = persona.lorebook.filter((entry) => entry.enabled).length
  const quickStarts = [`${persona.name}，今天过得怎么样？`, '陪我聊聊今天发生的事', '你现在最想和我做什么？']
  const conversationStarters = [
    { label: '分享今天', prompt: '陪我聊聊今天发生的事', icon: Sun },
    { label: '聊聊心情', prompt: '我想和你说说现在的心情', icon: Heart },
    { label: '来点灵感', prompt: '一起想想有什么有趣的事可以做吧', icon: Sparkles },
  ]

  return (
    <div className="chat-window">
      <ChatHeader
        appIcon={appIcon}
        persona={persona}
        personas={personas}
        activePersonaIndex={activePersonaIndex}
        onEditPersona={() => setPersonaWorkspace('current')}
        onManagePersonas={() => setPersonaWorkspace('library')}
        onSettings={() => {
          setSettingsInitialTab('ai')
          setShowSettings(true)
        }}
        onClearChat={handleClearChat}
        onSwitchPersona={switchPersona}
      />
      <div className="chat-main">
        <header className="conversation-bar">
          <div className="conversation-title">
            <span className="conversation-kicker">正在陪伴</span>
            <div>
              <strong>{persona.name}</strong>
              <span className="presence-badge">
                <span className="online-dot" /> 在线
              </span>
            </div>
          </div>
          <div className="conversation-mobile-label">
            <span>我们的对话</span>
            <span className="conversation-mobile-presence">
              <span className="online-dot" /> 正在陪伴
            </span>
          </div>
          <div className="context-chips" aria-label="当前对话上下文">
            <span className="context-chip" title={aiSettings.model}>
              <Cpu size={13} /> {aiSettings.model ? getModelDisplayName(aiSettings.model) : '未选择模型'}
            </span>
            <span className={`context-chip ${aiSettings.memoryEnabled !== false ? 'enabled' : ''}`}>
              <Brain size={13} /> {aiSettings.memoryEnabled !== false ? '记忆已开启' : '记忆已关闭'}
            </span>
            <span className={`context-chip ${enabledLoreEntries > 0 ? 'enabled' : ''}`}>
              <BookOpen size={13} /> 世界书 {enabledLoreEntries}
            </span>
          </div>
          <div className="conversation-actions">
            <button
              type="button"
              className="toolbar-btn"
              onClick={toggleSearch}
              title="搜索 (Ctrl+F)"
              aria-label="搜索聊天消息"
            >
              <Search size={15} />
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={handleExport}
              title="导出 (Ctrl+E)"
              aria-label="导出聊天记录"
            >
              <Download size={15} />
            </button>
          </div>
        </header>
        <div className="chat-body">
          <div className="companion-ambient" aria-hidden="true">
            <span className="ambient-orb ambient-orb-purple" />
            <span className="ambient-orb ambient-orb-pink" />
            <span className="ambient-orb ambient-orb-blue" />
            <span className="ambient-star ambient-star-one">✦</span>
            <span className="ambient-star ambient-star-two">✧</span>
            <span className="ambient-star ambient-star-three">✦</span>
          </div>
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
          <div className="chat-messages" ref={messagesRef}>
            <div className="messages-container">
              {isLoadingMore && <div className="loading-more">加载更早的消息中...</div>}
              {!isLoadingConversation && userMsgCount === 0 && messages.length > 0 && !isTyping && (
                <section className="conversation-welcome" aria-label="开启今天的对话">
                  <div className="welcome-art" aria-hidden="true">
                    <span className="welcome-orbit" />
                    <span className="welcome-orbit inner" />
                    <span className="welcome-heart">
                      <Heart size={28} strokeWidth={1.5} />
                    </span>
                    <span className="welcome-sparkle one">✦</span>
                    <span className="welcome-sparkle two">✧</span>
                  </div>
                  <span className="welcome-eyebrow">A LITTLE SPACE FOR US</span>
                  <h1>把今天，分享给我。</h1>
                  <p>
                    开心的小事，或心里的烦恼，
                    <br className="welcome-mobile-break" />
                    都可以和 {persona.name} 慢慢说。
                  </p>
                  <div className="welcome-starters">
                    {conversationStarters.map(({ label, prompt, icon: Icon }) => (
                      <button type="button" key={label} onClick={() => void handleSend(prompt)}>
                        <Icon size={17} strokeWidth={1.6} aria-hidden="true" />
                        <span>{label}</span>
                        <ArrowUpRight size={13} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  <div className="welcome-divider">
                    <span />
                    属于你们的这一刻
                    <span />
                  </div>
                </section>
              )}
              {!isLoadingConversation && messages.length === 0 && !isTyping && (
                <section className="conversation-empty" aria-label="开始对话">
                  <div className="empty-avatar" aria-hidden="true">
                    {persona.avatar ? <img src={persona.avatar} alt="" /> : <span>{persona.emoji}</span>}
                  </div>
                  <span className="empty-kicker">
                    <Sparkles size={14} /> 只属于你们的空间
                  </span>
                  <h1>和 {persona.name} 说点什么吧</h1>
                  <p>{persona.firstMessage || `我在这里。无论今天发生了什么，都可以慢慢告诉我。`}</p>
                  <div className="quick-starts">
                    {quickStarts.map((prompt) => (
                      <button type="button" key={prompt} onClick={() => void handleSend(prompt)}>
                        {prompt}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {messages.map((msg) => (
                <div key={msg.id} data-message-id={msg.id}>
                  <MessageBubble
                    message={msg}
                    persona={persona}
                    onDelete={handleDeleteFrom}
                    onRegenerate={handleRegenerate}
                    onSwitchAlternative={handleSwitchAlternative}
                    onOpenMemorySettings={openMemorySettings}
                  />
                </div>
              ))}
              {isTyping && <StreamingMessage persona={persona} onContentChange={followLatest} />}
              <div ref={bottomRef} />
            </div>
          </div>
          {isAwayFromLatest && (
            <button type="button" className="latest-message-btn" onClick={returnToLatest} aria-label="回到最新消息">
              <ArrowDown size={15} aria-hidden="true" /> 最新消息
            </button>
          )}
        </div>
        <ChatInput onSend={handleSend} disabled={isTyping || isLoadingConversation} />
        <div className="composer-footer" aria-hidden="true">
          <span>
            <Sparkles size={11} /> 慢慢说，我在听。
          </span>
          <span>Enter 发送 · Shift + Enter 换行</span>
        </div>
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} initialTab={settingsInitialTab} />}
      {personaWorkspace !== 'closed' && (
        <PersonaManager
          personas={personas}
          activeIndex={activePersonaIndex}
          onAdd={(p) => useSettingsStore.getState().addPersona(p)}
          onUpdate={(i, p) => useSettingsStore.getState().updatePersona(i, p)}
          onRemove={(i) => useSettingsStore.getState().removePersona(i)}
          onSwitch={switchPersona}
          onClose={() => setPersonaWorkspace('closed')}
          initialEditIndex={personaWorkspace === 'current' ? activePersonaIndex : undefined}
        />
      )}
    </div>
  )
}
