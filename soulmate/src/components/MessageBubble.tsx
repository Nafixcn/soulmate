import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message, Persona } from '../types'
import { Trash2, RotateCcw, ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react'

interface Props {
  message: Message
  persona: Persona
  onDelete?: (messageId: string) => void
  onRegenerate?: (messageId: string) => void
  onSwitchAlternative?: (messageId: string, direction: -1 | 1) => void
  onOpenMemorySettings?: () => void
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  persona,
  onDelete,
  onRegenerate,
  onSwitchAlternative,
  onOpenMemorySettings,
}: Props) {
  const [thinkOpen, setThinkOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const thinkingId = React.useId()
  const timestamp = new Date(message.timestamp)
  const formattedTime = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(timestamp)

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (message.role === 'user') {
    return (
      <div className="msg-row user">
        <div className="msg-body user-message-body">
          <div className="msg-bubble user-bubble">{message.content}</div>
          <div className="message-meta user-message-meta">
            <time dateTime={timestamp.toISOString()}>{formattedTime}</time>
            <button type="button" className="msg-action-btn" onClick={() => void copyMessage()} aria-label="复制消息">
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
            {onDelete && (
              <button
                type="button"
                className="msg-action-btn danger"
                onClick={() => onDelete(message.id)}
                title="删除此后消息"
                aria-label="删除这条及之后的消息"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="msg-row">
      <div className="msg-avatar">
        {persona.avatar ? <img src={persona.avatar} className="avatar-img-msg" alt="" /> : <span>{persona.emoji}</span>}
      </div>
      <div className="msg-body">
        {message.thinking && (
          <div className="thinking-wrapper">
            <button
              type="button"
              className="thinking-toggle"
              onClick={() => setThinkOpen(!thinkOpen)}
              aria-expanded={thinkOpen}
              aria-controls={thinkingId}
            >
              <span className="think-arrow" aria-hidden="true">
                {thinkOpen ? '▾' : '▸'}
              </span>
              思考过程
            </button>
            {thinkOpen && (
              <div id={thinkingId} className="thinking-block">
                {message.thinking}
              </div>
            )}
          </div>
        )}
        <div className="msg-bubble ai-bubble">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
        {(message.memoryReferences?.length || 0) > 0 && (
          <details className="memory-reference-details">
            <summary>本次回复参考了 {message.memoryReferences?.length} 条记忆</summary>
            <ul>
              {message.memoryReferences?.map((reference) => (
                <li key={reference.id}>{reference.content}</li>
              ))}
            </ul>
            {onOpenMemorySettings && (
              <button type="button" onClick={onOpenMemorySettings}>
                修正或停用记忆
              </button>
            )}
          </details>
        )}
        <div className={`reply-actions ${(message.alternatives?.length || 0) > 1 ? 'visible' : ''}`}>
          <time className="message-time" dateTime={timestamp.toISOString()}>
            {formattedTime}
          </time>
          <button type="button" className="msg-action-btn" onClick={() => void copyMessage()} aria-label="复制回复">
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          {(message.alternatives?.length || 0) > 1 && onSwitchAlternative && (
            <div className="alternative-switcher" aria-label="回复候选版本">
              <button
                type="button"
                className="msg-action-btn"
                onClick={() => onSwitchAlternative(message.id, -1)}
                aria-label="上一个回复"
              >
                <ChevronLeft size={12} />
              </button>
              <span>
                {(message.activeAlternative ?? 0) + 1}/{message.alternatives?.length}
              </span>
              <button
                type="button"
                className="msg-action-btn"
                onClick={() => onSwitchAlternative(message.id, 1)}
                aria-label="下一个回复"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          )}
          {onRegenerate && (
            <button
              type="button"
              className="msg-action-btn regenerate-btn"
              onClick={() => onRegenerate(message.id)}
              title="生成另一个回复（保留当前版本）"
              aria-label="生成另一个回复"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
