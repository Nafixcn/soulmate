import React, { useState } from 'react'
import { Persona } from '../types'
import {
  Trash2,
  UserPen,
  Settings,
  Heart,
  MessageCircle,
  Sparkles,
  Flame,
  InfinityIcon,
  ChevronDown,
  UsersRound,
} from 'lucide-react'

interface Props {
  persona: Persona
  personas: Persona[]
  activePersonaIndex: number
  onEditPersona: () => void
  onManagePersonas: () => void
  onSettings: () => void
  onClearChat: () => void
  onSwitchPersona: (index: number) => void
}

const stageConfig: Record<string, { icon: React.ComponentType<{ size?: number }>; color: string; label: string }> = {
  刚认识: { icon: MessageCircle, color: '#8b9dc3', label: '刚认识' },
  朋友: { icon: Sparkles, color: '#7ec8a0', label: '朋友' },
  暧昧: { icon: Heart, color: '#f0a0b0', label: '暧昧' },
  热恋: { icon: Flame, color: '#f06080', label: '热恋' },
  老夫老妻: { icon: InfinityIcon, color: '#c0a0d0', label: '老夫老妻' },
}

export const ChatHeader: React.FC<Props> = ({
  persona,
  personas,
  activePersonaIndex,
  onEditPersona,
  onManagePersonas,
  onSettings,
  onClearChat,
  onSwitchPersona,
}) => {
  const stage = stageConfig[persona.relationshipStage] || stageConfig['刚认识']
  const StageIcon = stage.icon
  const [showSwitcher, setShowSwitcher] = useState(false)

  return (
    <div className="chat-header">
      <div className="avatar">
        {persona.avatar ? (
          <img src={persona.avatar} className="avatar-img-header" alt="" />
        ) : (
          <span className="avatar-emoji">{persona.emoji}</span>
        )}
      </div>
      <div
        className="header-info"
        onClick={() => personas.length > 1 && setShowSwitcher(!showSwitcher)}
        style={{ cursor: personas.length > 1 ? 'pointer' : 'default' }}
      >
        <div className="header-name">
          {persona.name}
          <span
            className="stage-tag"
            style={{
              background: stage.color + '30',
              color: stage.color,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <StageIcon size={10} /> {stage.label}
          </span>
          {personas.length > 1 && <ChevronDown size={12} style={{ opacity: 0.7 }} />}
        </div>
        <div className="header-desc">
          {persona.personality} · {persona.age}岁
        </div>
      </div>
      {showSwitcher && (
        <div className="persona-switcher">
          {personas.map((p, i) => (
            <div
              key={i}
              className={`persona-switcher-item ${i === activePersonaIndex ? 'active' : ''}`}
              onClick={() => {
                onSwitchPersona(i)
                setShowSwitcher(false)
              }}
            >
              <span>{p.avatar ? <img src={p.avatar} className="persona-switcher-avatar" alt="" /> : p.emoji}</span>
              <span>{p.name}</span>
            </div>
          ))}
          <div
            className="persona-switcher-item"
            onClick={() => {
              onManagePersonas()
              setShowSwitcher(false)
            }}
          >
            <span>管理角色...</span>
          </div>
        </div>
      )}
      <button className="header-btn" onClick={onClearChat} title="清空">
        <Trash2 size={18} />
      </button>
      <button className="header-btn" onClick={onEditPersona} title="编辑角色">
        <UserPen size={18} />
      </button>
      <button className="header-btn" onClick={onManagePersonas} title="管理角色">
        <UsersRound size={18} />
      </button>
      <button className="header-btn" onClick={onSettings} title="设置">
        <Settings size={18} />
      </button>
    </div>
  )
}
