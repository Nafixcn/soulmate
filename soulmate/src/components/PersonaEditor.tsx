import React, { useState } from 'react'
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
  const [avatarProcessing, setAvatarProcessing] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  const update = <K extends keyof Persona>(key: K, value: Persona[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError(null)
    if (file.size > 300 * 1024) {
      setAvatarError('图片不能超过 300KB')
      e.target.value = ''
      return
    }
    setAvatarProcessing(true)
    const reader = new FileReader()
    reader.onerror = () => {
      setAvatarProcessing(false)
      setAvatarError('图片读取失败，请换一张试试')
    }
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => {
        setAvatarProcessing(false)
        setAvatarError('图片解析失败，请换一张试试')
      }
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const size = 150
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const minDim = Math.min(img.width, img.height)
          const sx = (img.width - minDim) / 2
          const sy = (img.height - minDim) / 2
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size)
          update('avatar', canvas.toDataURL('image/jpeg', 0.6))
          setAvatarProcessing(false)
        } else {
          setAvatarProcessing(false)
          setAvatarError('头像处理失败，请稍后重试')
        }
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleRemoveAvatar = () => update('avatar', '')

  const handleSave = () => {
    if (avatarProcessing) return
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
                <label className="avatar-placeholder" style={{ cursor: 'pointer' }}>
                  <span className="avatar-emoji-lg">{draft.emoji}</span>
                  <Camera size={14} className="avatar-camera" />
                  <input className="avatar-file-input" type="file" accept="image/*" onChange={handleAvatarUpload} />
                </label>
              )}
              {draft.avatar && (
                <label className="tag avatar-change-label">
                  {avatarProcessing ? '处理中...' : '更换图片'}
                  <input
                    className="avatar-file-input"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    disabled={avatarProcessing}
                  />
                </label>
              )}
              {avatarError && <div className="avatar-error">{avatarError}</div>}
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
            <label>对你的称呼</label>
            <input
              value={draft.nickname}
              onChange={(e) => update('nickname', e.target.value)}
              placeholder="哥哥"
              maxLength={8}
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
            <button
              className="tag active"
              onClick={handleSave}
              disabled={avatarProcessing}
              style={{ padding: '8px 24px' }}
            >
              {avatarProcessing ? '处理中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
