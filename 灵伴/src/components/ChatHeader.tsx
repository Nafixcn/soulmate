import React from 'react'
import { Persona } from '../types'
import { WeChatLogin } from './WeChatLogin'
import { WECHAT_APPID } from '../config/wechat'

interface Props {
  persona: Persona
  onEditPersona: () => void
  onSettings: () => void
  onClearChat: () => void
}

export const ChatHeader: React.FC<Props> = ({ persona, onEditPersona, onSettings, onClearChat }) => {
  const stageEmoji: Record<string, string> = {
    '刚认识': '💬',
    '朋友': '👋',
    '暧昧': '💗',
    '热恋': '❤️',
    '老夫老妻': '💑',
  }

  return (
    <div className="chat-header">
      <div className="avatar">
        <span className="avatar-emoji">{persona.emoji}</span>
      </div>
      <div className="header-info">
        <div className="header-name">
          {persona.name}
          <span className="stage-tag">{stageEmoji[persona.relationshipStage]} {persona.relationshipStage}</span>
          <span className="online-dot" />
        </div>
        <div className="header-desc">{persona.personality} · {persona.age}岁</div>
      </div>
      <WeChatLogin appid={WECHAT_APPID} />
      <button className="header-btn" onClick={onClearChat} title="清空对话">
        🗑️
      </button>
      <button className="header-btn" onClick={onEditPersona} title="角色设定">
        🎭
      </button>
      <button className="header-btn" onClick={onSettings} title="系统设置">
        ⚙️
      </button>
    </div>
  )
}
