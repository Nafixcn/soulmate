import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message, Persona } from '../types'
import { Trash2, RotateCcw } from 'lucide-react'

interface Props {
  message: Message
  persona: Persona
  onDelete?: (timestamp: number) => void
  onRegenerate?: () => void
  isLast?: boolean
}

export const MessageBubble: React.FC<Props> = ({ message, persona, onDelete, onRegenerate, isLast }) => {
  const [thinkOpen, setThinkOpen] = useState(false)
  const [showActions, setShowActions] = useState(false)

  if (message.role === 'user') {
    return (
      <div
        className="msg-row user"
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <div className="msg-bubble user-bubble">{message.content}</div>
        {showActions && onDelete && (
          <button className="msg-action-btn" onClick={() => onDelete(message.timestamp)} title="删除此后消息">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="msg-row" onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}>
      <div className="msg-avatar">
        {persona.avatar ? <img src={persona.avatar} className="avatar-img-msg" alt="" /> : <span>{persona.emoji}</span>}
      </div>
      <div className="msg-body">
        {message.thinking && (
          <div className="thinking-wrapper">
            <div className="thinking-toggle" onClick={() => setThinkOpen(!thinkOpen)}>
              <span className="think-arrow">{thinkOpen ? '▾' : '▸'}</span>
              思考过程
            </div>
            {thinkOpen && <div className="thinking-block">{message.thinking}</div>}
          </div>
        )}
        <div className="msg-bubble ai-bubble">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
        {showActions && isLast && onRegenerate && (
          <button className="msg-action-btn regenerate-btn" onClick={onRegenerate} title="重新生成">
            <RotateCcw size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
