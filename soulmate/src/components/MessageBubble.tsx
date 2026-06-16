import React from 'react'
import { Message, Persona, TTSSettings } from '../types'

interface Props {
  message: Message
  persona: Persona
  ttsSettings: TTSSettings
}

export const MessageBubble: React.FC<Props> = ({ message, persona }) => {
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
          <div className="thinking-block">{message.thinking}</div>
        )}
        <div className="msg-bubble ai-bubble">{message.content}</div>
      </div>
    </div>
  )
}
