import React from 'react'
import { Persona, Message, TTSSettings } from '../types'
import { speak, stopSpeaking } from '../services/ttsService'

interface Props {
  message: Message
  persona: Persona
  ttsSettings: TTSSettings
}

export const MessageBubble: React.FC<Props> = ({ message, persona, ttsSettings }) => {
  const isUser = message.role === 'user'
  const [isPlaying, setIsPlaying] = React.useState(false)
  const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })

  const handlePlayTTS = async () => {
    if (isPlaying) {
      stopSpeaking()
      setIsPlaying(false)
      return
    }
    setIsPlaying(true)
    await speak(message.content, { ...ttsSettings, enabled: true, autoPlay: false })
    setIsPlaying(false)
  }

  return (
    <div className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && (
        <div className="msg-avatar">
          <span>{persona.emoji}</span>
        </div>
      )}
      <div className="msg-content">
        <div className="msg-bubble-wrapper">
          <div className={`msg-bubble ${isUser ? 'user-bubble' : 'ai-bubble'}`}>
            {message.content}
          </div>
          {!isUser && ttsSettings.enabled && !ttsSettings.autoPlay && (
            <button
              className={`tts-play-btn ${isPlaying ? 'playing' : ''}`}
              onClick={handlePlayTTS}
              title={isPlaying ? '停止' : '朗读'}
            >
              {isPlaying ? '⏹' : '🔊'}
            </button>
          )}
        </div>
        <div className="msg-time">{time}</div>
      </div>
    </div>
  )
}
