import React, { useState } from 'react'
import { Message, Persona } from '../types'

interface Props {
  message: Message
  persona: Persona
}

export const MessageBubble: React.FC<Props> = ({ message, persona }) => {
  const [thinkOpen, setThinkOpen] = useState(false)

  if (message.role === 'user') {
    return (
      <div className="msg-row user">
        <div className="msg-bubble user-bubble">{message.content}</div>
      </div>
    )
  }

  return (
    <div className="msg-row">
      <div className="msg-avatar"><span>{persona.emoji}</span></div>
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
        <div className="msg-bubble ai-bubble">{message.content}</div>
      </div>
    </div>
  )
}
