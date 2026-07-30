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
  const switcherId = React.useId()

  return (
    <div className="chat-header">
      <div className="header-profile">
        <div className="avatar">
          {persona.avatar ? (
            <img src={persona.avatar} className="avatar-img-header" alt="" />
          ) : (
            <span className="avatar-emoji">{persona.emoji}</span>
          )}
        </div>
        {personas.length > 1 ? (
          <button
            type="button"
            className="header-info"
            onClick={() => setShowSwitcher(!showSwitcher)}
            aria-expanded={showSwitcher}
            aria-controls={switcherId}
            aria-label={`当前角色 ${persona.name}，切换角色`}
          >
            <div className="header-name">
              <span className="header-name-text">{persona.name}</span>
              <ChevronDown size={13} className="header-chevron" aria-hidden="true" />
            </div>
            <span
              className="stage-tag"
              style={
                {
                  '--stage-color': stage.color,
                } as React.CSSProperties
              }
            >
              <StageIcon size={11} /> {stage.label}
            </span>
            <div className="header-desc">
              {persona.personality} · {persona.age}岁
            </div>
          </button>
        ) : (
          <div className="header-info">
            <div className="header-name">
              <span className="header-name-text">{persona.name}</span>
            </div>
            <span
              className="stage-tag"
              style={
                {
                  '--stage-color': stage.color,
                } as React.CSSProperties
              }
            >
              <StageIcon size={11} /> {stage.label}
            </span>
            <div className="header-desc">
              {persona.personality} · {persona.age}岁
            </div>
          </div>
        )}
      </div>
      {showSwitcher && (
        <div id={switcherId} className="persona-switcher" aria-label="选择角色">
          {personas.map((p, i) => (
            <button
              type="button"
              key={p.id}
              className={`persona-switcher-item ${i === activePersonaIndex ? 'active' : ''}`}
              onClick={() => {
                onSwitchPersona(i)
                setShowSwitcher(false)
              }}
              aria-pressed={i === activePersonaIndex}
            >
              <span>{p.avatar ? <img src={p.avatar} className="persona-switcher-avatar" alt="" /> : p.emoji}</span>
              <span>{p.name}</span>
            </button>
          ))}
          <button
            type="button"
            className="persona-switcher-item"
            onClick={() => {
              onManagePersonas()
              setShowSwitcher(false)
            }}
          >
            <span>管理角色...</span>
          </button>
        </div>
      )}
      <div className="header-actions">
        <button type="button" className="header-btn" onClick={onEditPersona} title="编辑角色" aria-label="编辑当前角色">
          <UserPen size={18} />
        </button>
        <button type="button" className="header-btn" onClick={onManagePersonas} title="管理角色" aria-label="管理角色">
          <UsersRound size={18} />
        </button>
        <button type="button" className="header-btn" onClick={onSettings} title="设置" aria-label="打开设置">
          <Settings size={18} />
        </button>
      </div>
      <button
        type="button"
        className="header-btn header-btn-danger"
        onClick={onClearChat}
        title="清空"
        aria-label="清空当前角色聊天记录"
      >
        <Trash2 size={18} />
      </button>
    </div>
  )
}
