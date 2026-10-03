import React, { useLayoutEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChatStore } from '../store/chatStore'
import type { Persona } from '../types'

interface Props {
  persona: Persona
  onContentChange: () => void
}

export const StreamingMessage: React.FC<Props> = ({ persona, onContentChange }) => {
  const content = useChatStore((state) => state.streamingContent)
  const thinking = useChatStore((state) => state.streamingThinking)
  const [thinkingOpen, setThinkingOpen] = useState(true)
  const thinkingId = React.useId()

  useLayoutEffect(() => {
    onContentChange()
  }, [content, thinking, thinkingOpen, onContentChange])

  const avatar = persona.avatar ? (
    <img src={persona.avatar} className="avatar-img-msg" alt="" />
  ) : (
    <span>{persona.emoji}</span>
  )

  if (!content) {
    return (
      <div className="typing-indicator" role="status" aria-live="polite" aria-label={`${persona.name}正在回复`}>
        <div className="msg-avatar">{avatar}</div>
        <div className="typing-dots">
          <span />
          <span />
          <span />
        </div>
      </div>
    )
  }

  return (
    <div className="msg-row">
      <div className="msg-avatar">{avatar}</div>
      <div className="msg-body">
        {thinking && (
          <div className="thinking-wrapper">
            <button
              type="button"
              className="thinking-toggle"
              onClick={() => setThinkingOpen((open) => !open)}
              aria-expanded={thinkingOpen}
              aria-controls={thinkingId}
            >
              <span className="think-arrow" aria-hidden="true">
                {thinkingOpen ? '▾' : '▸'}
              </span>
              思考过程
            </button>
            {thinkingOpen && (
              <div id={thinkingId} className="thinking-block">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{thinking}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
        <div className="msg-bubble ai-bubble streaming-markdown" aria-live="polite" aria-atomic="false">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          <span className="cursor-blink">|</span>
        </div>
      </div>
    </div>
  )
}
