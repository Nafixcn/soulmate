import React from 'react'
import { Persona } from '../types'
import { WeChatLogin } from './WeChatLogin'
import { WECHAT_APPID } from '../config/wechat'
import { Trash2, UserPen, Settings, Heart, MessageCircle, Sparkles, Flame, Infinity } from 'lucide-react'

interface Props {
  persona: Persona
  onEditPersona: () => void
  onSettings: () => void
  onClearChat: () => void
}

const stageConfig: Record<string, { icon: any, color: string; label: string }> = {
  '刚认识': { icon: MessageCircle, color: '#8b9dc3', label: '刚认识' },
  '朋友': { icon: Sparkles, color: '#7ec8a0', label: '朋友' },
  '暧昧': { icon: Heart, color: '#f0a0b0', label: '暧昧' },
  '热恋': { icon: Flame, color: '#f06080', label: '热恋' },
  '老夫老妻': { icon: Infinity, color: '#c0a0d0', label: '老夫老妻' },
}

export const ChatHeader: React.FC<Props> = ({ persona, onEditPersona, onSettings, onClearChat }) => {
  const stage = stageConfig[persona.relationshipStage] || stageConfig['刚认识']
  const StageIcon = stage.icon

  return (
    <div className="chat-header">
      <div className="avatar"><span className="avatar-emoji">{persona.emoji}</span></div>
      <div className="header-info">
        <div className="header-name">
          {persona.name}
          <span className="stage-tag" style={{ background: stage.color + '30', color: stage.color, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <StageIcon size={10} /> {stage.label}
          </span>
        </div>
        <div className="header-desc">{persona.personality} · {persona.age}岁</div>
      </div>
      <WeChatLogin appid={WECHAT_APPID} />
      <button className="header-btn" onClick={onClearChat} title="清空"><Trash2 size={18} /></button>
      <button className="header-btn" onClick={onEditPersona} title="角色"><UserPen size={18} /></button>
      <button className="header-btn" onClick={onSettings} title="设置"><Settings size={18} /></button>
    </div>
  )
}
