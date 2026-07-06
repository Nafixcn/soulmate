import React, { useState, useRef } from 'react'
import { Persona } from '../types'
import { X, Camera } from 'lucide-react'

interface Props {
  persona: Persona
  onChange: (persona: Persona) => void
  onClose: () => void
}

const PERSONALITIES = ['温柔体贴', '傲娇毒舌', '高冷冷艳', '元气活泼', '成熟知性', '软萌害羞']
const STAGES: Persona['relationshipStage'][] = ['刚认识', '朋友', '暧昧', '热恋', '老夫老妻']
const ICONS = ['🌸', '💕', '✨', '🌙', '🎀', '🦋', '🍓', '💫', '🐰', '💜']
const HAIR = ['#ff9fbf', '#8B6914', '#2c1810', '#e8c580', '#b07cd8', '#6baed6', '#c0c0c0', '#d4545a']
const EYES = ['#ff6b9d', '#8B4513', '#9b59b6', '#4a90d9', '#5dae7e', '#e8b848', '#d9534f', '#888']

export const PersonaEditor: React.FC<Props> = ({ persona, onChange, onClose }) => {
  const [draft, setDraft] = useState<Persona>({ ...persona })
  const fileRef = useRef<HTMLInputElement>(null)

  const update = <K extends keyof Persona>(key: K, value: Persona[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => update('avatar', reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleRemoveAvatar = () => update('avatar', '')

  const handleSave = () => {
    onChange(draft)
    onClose()
  }

  return (
    <div className="persona-overlay" onClick={onClose}>
      <div className="persona-panel" onClick={(e) => e.stopPropagation()}>
        <div className="persona-header">
          <h2>角色设定</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="persona-body">
          <div className="form-group" style={{ alignItems: 'center' }}>
            <label>头像</label>
            <div className="avatar-upload">
              {draft.avatar ? (
                <div className="avatar-preview">
                  <img src={draft.avatar} alt="" className="avatar-img" />
                  <button className="avatar-remove" onClick={handleRemoveAvatar}>
                    ×
                  </button>
                </div>
              ) : (
                <button className="avatar-placeholder" onClick={() => fileRef.current?.click()}>
                  <span className="avatar-emoji-lg">{draft.emoji}</span>
                  <Camera size={14} className="avatar-camera" />
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                style={{ display: 'none' }}
              />
              {draft.avatar && (
                <button className="tag" onClick={() => fileRef.current?.click()} style={{ marginTop: 6 }}>
                  更换图片
                </button>
              )}
            </div>
          </div>
          <div className="form-group">
            <label>名字</label>
            <input value={draft.name} onChange={(e) => update('name', e.target.value)} maxLength={8} />
          </div>
          <div className="form-group">
            <label>年龄</label>
            <input
              type="number"
              value={draft.age}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                update('age', isNaN(v) ? 18 : v)
              }}
              min={16}
              max={30}
            />
          </div>
          <div className="form-group">
            <label>性格</label>
            <div className="tag-grid">
              {PERSONALITIES.map((p) => (
                <button
                  key={p}
                  className={`tag ${draft.personality === p ? 'active' : ''}`}
                  onClick={() => update('personality', p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>爱好</label>
            <input value={draft.hobby} onChange={(e) => update('hobby', e.target.value)} placeholder="看电影、听音乐" />
          </div>
          <div className="form-group">
            <label>说话风格</label>
            <textarea value={draft.speakingStyle} onChange={(e) => update('speakingStyle', e.target.value)} rows={2} />
          </div>
          <div className="form-group">
            <label>关系阶段</label>
            <div className="tag-grid">
              {STAGES.map((s) => (
                <button
                  key={s}
                  className={`tag ${draft.relationshipStage === s ? 'active' : ''}`}
                  onClick={() => update('relationshipStage', s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>发色 / 瞳色</label>
            <div className="color-grid">
              {HAIR.map((c) => (
                <button
                  key={c}
                  className={`color-btn ${draft.hairColor === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => update('hairColor', c)}
                />
              ))}
            </div>
            <div className="color-grid" style={{ marginTop: 8 }}>
              {EYES.map((c) => (
                <button
                  key={c}
                  className={`color-btn ${draft.eyeColor === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => update('eyeColor', c)}
                />
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>图标</label>
            <div className="emoji-grid">
              {ICONS.map((emoji) => (
                <button
                  key={emoji}
                  className={`emoji-btn ${draft.emoji === emoji ? 'active' : ''}`}
                  onClick={() => update('emoji', emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="tag" onClick={onClose} style={{ padding: '8px 24px' }}>
              取消
            </button>
            <button className="tag active" onClick={handleSave} style={{ padding: '8px 24px' }}>
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
