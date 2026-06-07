import React from 'react'
import { Persona } from '../types'

interface Props {
  persona: Persona
  onChange: (persona: Persona) => void
  onClose: () => void
}

const PERSONALITY_OPTIONS = ['温柔体贴', '傲娇毒舌', '高冷冷艳', '元气活泼', '成熟知性', '软萌害羞']
const RELATIONSHIP_STAGES: Persona['relationshipStage'][] = ['刚认识', '朋友', '暧昧', '热恋', '老夫老妻']
const EMOJI_OPTIONS = ['🌸', '💕', '✨', '🌙', '🎀', '🦋', '🍓', '💫', '🐰', '💜']
const HAIR_COLORS = [
  { name: '粉色', hex: '#ff9fbf' },
  { name: '棕色', hex: '#8B6914' },
  { name: '黑色', hex: '#2c1810' },
  { name: '金色', hex: '#e8c580' },
  { name: '紫色', hex: '#b07cd8' },
  { name: '蓝色', hex: '#6baed6' },
  { name: '银色', hex: '#c0c0c0' },
  { name: '红色', hex: '#d4545a' },
]
const EYE_COLORS = [
  { name: '粉色', hex: '#ff6b9d' },
  { name: '棕色', hex: '#8B4513' },
  { name: '紫色', hex: '#9b59b6' },
  { name: '蓝色', hex: '#4a90d9' },
  { name: '绿色', hex: '#5dae7e' },
  { name: '金色', hex: '#e8b848' },
  { name: '红色', hex: '#d9534f' },
  { name: '灰色', hex: '#888' },
]

export const PersonaEditor: React.FC<Props> = ({ persona, onChange, onClose }) => {
  const update = (key: keyof Persona, value: any) => {
    onChange({ ...persona, [key]: value })
  }

  return (
    <div className="persona-overlay" onClick={onClose}>
      <div className="persona-panel" onClick={e => e.stopPropagation()}>
        <div className="persona-header">
          <h2>角色设定 ✨</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="persona-body">
          <div className="form-group">
            <label>名字</label>
            <input value={persona.name} onChange={e => update('name', e.target.value)} maxLength={8} />
          </div>

          <div className="form-group">
            <label>年龄</label>
            <input type="number" value={persona.age} onChange={e => update('age', parseInt(e.target.value) || 18)} min={16} max={30} />
          </div>

          <div className="form-group">
            <label>性格</label>
            <div className="tag-grid">
              {PERSONALITY_OPTIONS.map(p => (
                <button key={p} className={`tag ${persona.personality === p ? 'active' : ''}`} onClick={() => update('personality', p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>爱好</label>
            <input value={persona.hobby} onChange={e => update('hobby', e.target.value)} placeholder="如：看电影、听音乐" />
          </div>

          <div className="form-group">
            <label>说话风格</label>
            <textarea value={persona.speakingStyle} onChange={e => update('speakingStyle', e.target.value)} rows={2} placeholder="描述她的说话风格..." />
          </div>

          <div className="form-group">
            <label>关系阶段</label>
            <div className="tag-grid">
              {RELATIONSHIP_STAGES.map(s => (
                <button key={s} className={`tag ${persona.relationshipStage === s ? 'active' : ''}`} onClick={() => update('relationshipStage', s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>发色</label>
            <div className="color-grid">
              {HAIR_COLORS.map(c => (
                <button
                  key={c.hex}
                  className={`color-btn ${persona.hairColor === c.hex ? 'active' : ''}`}
                  style={{ background: c.hex }}
                  onClick={() => update('hairColor', c.hex)}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>瞳色</label>
            <div className="color-grid">
              {EYE_COLORS.map(c => (
                <button
                  key={c.hex}
                  className={`color-btn ${persona.eyeColor === c.hex ? 'active' : ''}`}
                  style={{ background: c.hex }}
                  onClick={() => update('eyeColor', c.hex)}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>代表 Emoji</label>
            <div className="emoji-grid">
              {EMOJI_OPTIONS.map(e => (
                <button key={e} className={`emoji-btn ${persona.emoji === e ? 'active' : ''}`} onClick={() => update('emoji', e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
