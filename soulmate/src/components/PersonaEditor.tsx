import React, { useState } from 'react'
import { Persona } from '../types'
import { X, Camera } from 'lucide-react'
import { Dialog } from './Dialog'

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
  const formId = React.useId()

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
    <Dialog
      ariaLabelledBy={`${formId}-title`}
      onClose={onClose}
      overlayClassName="persona-overlay"
      panelClassName="persona-panel"
    >
      <div className="persona-header">
        <h2 id={`${formId}-title`}>角色设定</h2>
        <button type="button" className="close-btn" onClick={onClose} aria-label="关闭角色设定">
          <X size={20} />
        </button>
      </div>
      <div className="persona-body">
        <div
          className="form-group"
          style={{ alignItems: 'center' }}
          role="group"
          aria-labelledby={`${formId}-avatar-label`}
        >
          <div id={`${formId}-avatar-label`} className="form-label">
            头像
          </div>
          <div className="avatar-upload">
            {draft.avatar ? (
              <div className="avatar-preview">
                <img src={draft.avatar} alt={`${draft.name || '角色'}的头像预览`} className="avatar-img" />
                <button type="button" className="avatar-remove" onClick={handleRemoveAvatar} aria-label="移除头像">
                  ×
                </button>
              </div>
            ) : (
              <label
                className="avatar-placeholder"
                style={{ cursor: 'pointer' }}
                htmlFor={`${formId}-avatar-file`}
                aria-label="选择头像图片"
              >
                <span className="avatar-emoji-lg">{draft.emoji}</span>
                <Camera size={14} className="avatar-camera" />
                <input
                  id={`${formId}-avatar-file`}
                  className="avatar-file-input"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                />
              </label>
            )}
            {draft.avatar && (
              <label className="tag avatar-change-label" htmlFor={`${formId}-avatar-change`}>
                {avatarProcessing ? '处理中...' : '更换图片'}
                <input
                  id={`${formId}-avatar-change`}
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
          <label htmlFor={`${formId}-name`}>名字</label>
          <input
            id={`${formId}-name`}
            value={draft.name}
            onChange={(e) => update('name', e.target.value)}
            maxLength={8}
          />
        </div>
        <div className="form-group">
          <label htmlFor={`${formId}-age`}>年龄</label>
          <input
            id={`${formId}-age`}
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
          <label htmlFor={`${formId}-nickname`}>对你的称呼</label>
          <input
            id={`${formId}-nickname`}
            value={draft.nickname}
            onChange={(e) => update('nickname', e.target.value)}
            placeholder="哥哥"
            maxLength={8}
          />
        </div>
        <div className="form-group" role="group" aria-labelledby={`${formId}-personality-label`}>
          <div id={`${formId}-personality-label`} className="form-label">
            性格
          </div>
          <div className="tag-grid">
            {PERSONALITIES.map((p) => (
              <button
                type="button"
                key={p}
                className={`tag ${draft.personality === p ? 'active' : ''}`}
                onClick={() => update('personality', p)}
                aria-pressed={draft.personality === p}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label htmlFor={`${formId}-hobby`}>爱好</label>
          <input
            id={`${formId}-hobby`}
            value={draft.hobby}
            onChange={(e) => update('hobby', e.target.value)}
            placeholder="看电影、听音乐"
          />
        </div>
        <div className="form-group">
          <label htmlFor={`${formId}-speaking-style`}>说话风格</label>
          <textarea
            id={`${formId}-speaking-style`}
            value={draft.speakingStyle}
            onChange={(e) => update('speakingStyle', e.target.value)}
            rows={2}
          />
        </div>
        <div className="form-group" role="group" aria-labelledby={`${formId}-relationship-label`}>
          <div id={`${formId}-relationship-label`} className="form-label">
            关系阶段
          </div>
          <div className="tag-grid">
            {STAGES.map((s) => (
              <button
                type="button"
                key={s}
                className={`tag ${draft.relationshipStage === s ? 'active' : ''}`}
                onClick={() => update('relationshipStage', s)}
                aria-pressed={draft.relationshipStage === s}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <div id={`${formId}-hair-label`} className="form-label">
            发色
          </div>
          <div className="color-grid" role="group" aria-labelledby={`${formId}-hair-label`}>
            {HAIR.map((c) => (
              <button
                type="button"
                key={c}
                className={`color-btn ${draft.hairColor === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => update('hairColor', c)}
                aria-label={`选择发色 ${c}`}
                aria-pressed={draft.hairColor === c}
              />
            ))}
          </div>
          <div id={`${formId}-eyes-label`} className="form-label" style={{ marginTop: 8 }}>
            瞳色
          </div>
          <div className="color-grid" role="group" aria-labelledby={`${formId}-eyes-label`}>
            {EYES.map((c) => (
              <button
                type="button"
                key={c}
                className={`color-btn ${draft.eyeColor === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => update('eyeColor', c)}
                aria-label={`选择瞳色 ${c}`}
                aria-pressed={draft.eyeColor === c}
              />
            ))}
          </div>
        </div>
        <div className="form-group" role="group" aria-labelledby={`${formId}-icon-label`}>
          <div id={`${formId}-icon-label`} className="form-label">
            图标
          </div>
          <div className="emoji-grid">
            {ICONS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                className={`emoji-btn ${draft.emoji === emoji ? 'active' : ''}`}
                onClick={() => update('emoji', emoji)}
                aria-label={`选择图标 ${emoji}`}
                aria-pressed={draft.emoji === emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="tag" onClick={onClose} style={{ padding: '8px 24px' }}>
            取消
          </button>
          <button
            type="button"
            className="tag active"
            onClick={handleSave}
            disabled={avatarProcessing}
            style={{ padding: '8px 24px' }}
          >
            {avatarProcessing ? '处理中...' : '保存'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
