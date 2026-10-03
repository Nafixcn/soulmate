import React, { useState } from 'react'
import { Persona } from '../types'
import { Trash2, UserPen, Settings, ChevronDown, UsersRound, Heart } from 'lucide-react'
import { getStageAppearance, STAGE_ORDER } from '../domain/relationshipStage'

interface Props {
  appIcon: string
  persona: Persona
  personas: Persona[]
  activePersonaIndex: number
  onEditPersona: () => void
  onManagePersonas: () => void
  onSettings: () => void
  onClearChat: () => void
  onSwitchPersona: (index: number) => void
}

export const ChatHeader: React.FC<Props> = ({
  appIcon,
  persona,
  personas,
  activePersonaIndex,
  onEditPersona,
  onManagePersonas,
  onSettings,
  onClearChat,
  onSwitchPersona,
}) => {
  const stage = getStageAppearance(persona)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const switcherId = React.useId()
  const stageIndex = STAGE_ORDER.indexOf(persona.relationshipStage)

  return (
    <aside className="chat-header" aria-label="陪伴角色与应用导航">
      <div className="sidebar-brand" aria-label="灵伴 SoulMate">
        <span className="sidebar-brand-mark" aria-hidden="true">
          {appIcon.trim() || '✦'}
        </span>
        <span className="sidebar-brand-copy">
          <strong>灵伴</strong>
          <small>SOULMATE</small>
        </span>
      </div>
      <div className="header-profile">
        <span className="profile-kicker">YOUR COMPANION</span>
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
            <span className="stage-tag">
              <span aria-hidden="true">{stage.icon}</span> {stage.label}
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
            <span className="stage-tag">
              <span aria-hidden="true">{stage.icon}</span> {stage.label}
            </span>
            <div className="header-desc">
              {persona.personality} · {persona.age}岁
            </div>
          </div>
        )}
        <div className="relationship-progress" aria-label={`关系阶段：${stage.label}`}>
          {STAGE_ORDER.map((label, index) => (
            <span
              key={label}
              className={index <= stageIndex ? 'active' : ''}
              title={getStageAppearance(persona, label).label}
            />
          ))}
        </div>
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
      <span className="sidebar-section-label">你的空间</span>
      <div className="header-actions">
        <button type="button" className="header-btn" onClick={onEditPersona} title="编辑角色" aria-label="编辑当前角色">
          <UserPen size={18} />
          <span className="dock-action-label">角色资料</span>
        </button>
        <button type="button" className="header-btn" onClick={onManagePersonas} title="管理角色" aria-label="管理角色">
          <UsersRound size={18} />
          <span className="dock-action-label">角色管理</span>
        </button>
        <button type="button" className="header-btn" onClick={onSettings} title="设置" aria-label="打开设置">
          <Settings size={18} />
          <span className="dock-action-label">应用设置</span>
        </button>
      </div>
      <div className="sidebar-note" aria-hidden="true">
        <Heart size={15} strokeWidth={1.4} />
        <span>
          一点日常，一点心动。
          <br />
          让陪伴慢慢发生。
        </span>
      </div>
      <button
        type="button"
        className="header-btn header-btn-danger"
        onClick={onClearChat}
        title="清空"
        aria-label="清空当前角色聊天记录"
      >
        <Trash2 size={18} />
        <span className="dock-action-label">清空对话</span>
      </button>
    </aside>
  )
}
