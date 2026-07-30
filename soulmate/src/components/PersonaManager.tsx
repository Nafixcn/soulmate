import React, { useState } from 'react'
import { Persona, DEFAULT_PERSONA } from '../types'
import { X, Plus, Trash2, Edit2 } from 'lucide-react'
import { Dialog } from './Dialog'

interface Props {
  personas: Persona[]
  activeIndex: number
  onAdd: (p: Persona) => void
  onUpdate: (index: number, p: Persona) => void
  onRemove: (index: number) => Promise<boolean>
  onSwitch: (index: number) => void
  onClose: () => void
}

const PERSONALITIES = ['温柔体贴', '傲娇毒舌', '高冷冷艳', '元气活泼', '成熟知性', '软萌害羞']
const STAGES: Persona['relationshipStage'][] = ['刚认识', '朋友', '暧昧', '热恋', '老夫老妻']
const ICONS = ['🌸', '💕', '✨', '🌙', '🎀', '🦋', '🍓', '💫', '🐰', '💜']

export const PersonaManager: React.FC<Props> = ({
  personas,
  activeIndex,
  onAdd,
  onUpdate,
  onRemove,
  onSwitch,
  onClose,
}) => {
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState<Persona>({ ...DEFAULT_PERSONA })
  const [deleting, setDeleting] = useState<number | null>(null)
  const formId = React.useId()

  const startEdit = (index: number) => {
    setEditing(index)
    setDraft({ ...personas[index] })
  }

  const startNew = () => {
    setEditing(-1)
    setDraft({ ...DEFAULT_PERSONA, id: crypto.randomUUID(), name: '' })
  }

  const saveEdit = () => {
    if (editing === -1) {
      onAdd(draft)
    } else if (editing !== null) {
      onUpdate(editing, draft)
    }
    setEditing(null)
  }

  const update = <K extends keyof Persona>(key: K, value: Persona[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const removePersona = async (index: number) => {
    if (!window.confirm(`删除“${personas[index].name}”及其全部聊天记录？`)) return
    setDeleting(index)
    await onRemove(index)
    setDeleting(null)
  }

  if (editing !== null) {
    return (
      <Dialog
        key="persona-form"
        ariaLabelledBy={`${formId}-form-title`}
        onClose={() => setEditing(null)}
        overlayClassName="persona-overlay"
        panelClassName="persona-panel"
      >
        <div className="persona-header">
          <h2 id={`${formId}-form-title`}>{editing === -1 ? '新建角色' : '编辑角色'}</h2>
          <button
            type="button"
            className="close-btn"
            onClick={() => setEditing(null)}
            aria-label={editing === -1 ? '关闭新建角色' : '关闭编辑角色'}
          >
            <X size={20} />
          </button>
        </div>
        <div className="persona-body">
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
            <button type="button" className="tag" onClick={() => setEditing(null)} style={{ padding: '8px 24px' }}>
              取消
            </button>
            <button type="button" className="tag active" onClick={saveEdit} style={{ padding: '8px 24px' }}>
              保存
            </button>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      key="persona-list"
      ariaLabelledBy={`${formId}-manager-title`}
      onClose={onClose}
      overlayClassName="persona-overlay"
      panelClassName="persona-panel"
    >
      <div className="persona-header">
        <h2 id={`${formId}-manager-title`}>角色管理</h2>
        <button type="button" className="close-btn" onClick={onClose} aria-label="关闭角色管理">
          <X size={20} />
        </button>
      </div>
      <div className="persona-body">
        {personas.map((p, i) => (
          <div key={p.id} className={`persona-list-item ${i === activeIndex ? 'active' : ''}`}>
            <button
              type="button"
              className="persona-list-info"
              onClick={() => {
                onSwitch(i)
                onClose()
              }}
              aria-current={i === activeIndex ? 'true' : undefined}
            >
              <span className="persona-list-emoji">
                {p.avatar ? <img src={p.avatar} className="persona-list-avatar" alt="" /> : p.emoji}
              </span>
              <div>
                <div className="persona-list-name">{p.name}</div>
                <div className="persona-list-desc">
                  {p.personality} · {p.relationshipStage}
                </div>
              </div>
            </button>
            <div className="persona-list-actions">
              <button
                type="button"
                className="persona-action-btn"
                onClick={() => startEdit(i)}
                aria-label={`编辑角色 ${p.name}`}
              >
                <Edit2 size={14} />
              </button>
              {personas.length > 1 && (
                <button
                  type="button"
                  className="persona-action-btn danger"
                  onClick={() => void removePersona(i)}
                  disabled={deleting !== null}
                  title="删除角色及聊天记录"
                  aria-label={`删除角色 ${p.name} 及聊天记录`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="tag active"
          onClick={startNew}
          style={{ padding: '10px', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={14} /> 新建角色
        </button>
      </div>
    </Dialog>
  )
}
