import React, { useState } from 'react'
import { Persona, DEFAULT_PERSONA, type LorebookEntry, type RelationshipStage, type StageAppearance } from '../types'
import { X, Plus, Trash2, Edit2, Upload, Download, BookOpen, Camera } from 'lucide-react'
import { Dialog } from './Dialog'
import { downloadCharacterCard, importCharacterCard } from '../domain/characterCard'
import { DEFAULT_STAGE_APPEARANCE, getStageAppearance, STAGE_ORDER } from '../domain/relationshipStage'

interface Props {
  personas: Persona[]
  activeIndex: number
  onAdd: (p: Persona) => void
  onUpdate: (index: number, p: Persona) => void
  onRemove: (index: number) => Promise<boolean>
  onSwitch: (index: number) => void
  onClose: () => void
  initialEditIndex?: number
}

const PERSONALITIES = ['温柔体贴', '傲娇毒舌', '高冷冷艳', '元气活泼', '成熟知性', '软萌害羞']
const ICONS = ['🌸', '💕', '✨', '🌙', '🎀', '🦋', '🍓', '💫', '🐰', '💜']
const HAIR = ['#ff9fbf', '#8B6914', '#2c1810', '#e8c580', '#b07cd8', '#6baed6', '#c0c0c0', '#d4545a']
const EYES = ['#ff6b9d', '#8B4513', '#9b59b6', '#4a90d9', '#5dae7e', '#e8b848', '#d9534f', '#888']

export const PersonaManager: React.FC<Props> = ({
  personas,
  activeIndex,
  onAdd,
  onUpdate,
  onRemove,
  onSwitch,
  onClose,
  initialEditIndex,
}) => {
  const [editing, setEditing] = useState<number | null>(initialEditIndex ?? null)
  const [draft, setDraft] = useState<Persona>(
    initialEditIndex === undefined ? { ...DEFAULT_PERSONA } : { ...personas[initialEditIndex] },
  )
  const [deleting, setDeleting] = useState<number | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [avatarProcessing, setAvatarProcessing] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
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
    if (avatarProcessing) return
    const savedDraft = { ...draft, emoji: draft.emoji.trim() || DEFAULT_PERSONA.emoji }
    if (editing === -1) {
      onAdd(savedDraft)
    } else if (editing !== null) {
      onUpdate(editing, savedDraft)
    }
    if (initialEditIndex === undefined) setEditing(null)
    else onClose()
  }

  const closeEditor = () => {
    if (initialEditIndex === undefined) setEditing(null)
    else onClose()
  }

  const update = <K extends keyof Persona>(key: K, value: Persona[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const updateStageAppearance = (stage: RelationshipStage, partial: Partial<StageAppearance>) => {
    setDraft((prev) => ({
      ...prev,
      stageAppearance: {
        ...prev.stageAppearance,
        [stage]: { ...DEFAULT_STAGE_APPEARANCE[stage], ...prev.stageAppearance?.[stage], ...partial },
      },
    }))
  }

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAvatarError(null)
    if (file.size > 300 * 1024) {
      setAvatarError('图片不能超过 300KB')
      return
    }
    setAvatarProcessing(true)
    const reader = new FileReader()
    reader.onerror = () => {
      setAvatarProcessing(false)
      setAvatarError('图片读取失败，请换一张试试')
    }
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => {
        setAvatarProcessing(false)
        setAvatarError('图片解析失败，请换一张试试')
      }
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 150
        canvas.height = 150
        const context = canvas.getContext('2d')
        if (!context) {
          setAvatarProcessing(false)
          setAvatarError('头像处理失败，请稍后重试')
          return
        }
        const size = Math.min(image.width, image.height)
        context.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 150, 150)
        update('avatar', canvas.toDataURL('image/jpeg', 0.6))
        setAvatarProcessing(false)
      }
      image.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const removePersona = async (index: number) => {
    if (!window.confirm(`删除“${personas[index].name}”及其全部聊天记录？`)) return
    setDeleting(index)
    await onRemove(index)
    setDeleting(null)
  }

  const addLoreEntry = () => {
    const entry: LorebookEntry = {
      id: crypto.randomUUID(),
      name: '新条目',
      keywords: [],
      content: '',
      enabled: true,
      priority: 100,
    }
    update('lorebook', [...draft.lorebook, entry])
  }

  const updateLoreEntry = (index: number, partial: Partial<LorebookEntry>) => {
    update(
      'lorebook',
      draft.lorebook.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...partial } : entry)),
    )
  }

  const importCard = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const card = importCharacterCard(JSON.parse(await file.text()))
      onAdd(card)
      setImportError(null)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '角色卡导入失败')
    }
  }

  if (editing !== null) {
    return (
      <Dialog
        key="persona-form"
        ariaLabelledBy={`${formId}-form-title`}
        onClose={closeEditor}
        overlayClassName="persona-overlay"
        panelClassName="persona-panel"
      >
        <div className="persona-header">
          <h2 id={`${formId}-form-title`}>{editing === -1 ? '新建角色' : '编辑角色'}</h2>
          <button
            type="button"
            className="close-btn"
            onClick={closeEditor}
            aria-label={editing === -1 ? '关闭新建角色' : '关闭编辑角色'}
          >
            <X size={20} />
          </button>
        </div>
        <div className="persona-body">
          <div className="form-group" role="group" aria-labelledby={`${formId}-avatar-label`}>
            <div id={`${formId}-avatar-label`} className="form-label">
              头像
            </div>
            <div className="avatar-upload">
              {draft.avatar ? (
                <div className="avatar-preview">
                  <img src={draft.avatar} alt={`${draft.name || '角色'}的头像预览`} className="avatar-img" />
                  <button
                    type="button"
                    className="avatar-remove"
                    onClick={() => update('avatar', '')}
                    aria-label="移除头像"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label className="avatar-placeholder" htmlFor={`${formId}-avatar-file`} aria-label="选择头像图片">
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
          <details className="persona-advanced" open={editing !== -1 && Boolean(draft.description || draft.scenario)}>
            <summary>高级人设与角色卡</summary>
            <div className="form-group">
              <label htmlFor={`${formId}-description`}>角色描述 / 背景故事</label>
              <textarea
                id={`${formId}-description`}
                value={draft.description}
                onChange={(e) => update('description', e.target.value)}
                rows={4}
                placeholder="角色的经历、身份和稳定设定"
              />
            </div>
            <div className="form-group">
              <label htmlFor={`${formId}-scenario`}>当前场景</label>
              <textarea
                id={`${formId}-scenario`}
                value={draft.scenario}
                onChange={(e) => update('scenario', e.target.value)}
                rows={3}
                placeholder="你们所处的世界和当前关系背景"
              />
            </div>
            <div className="form-group">
              <label htmlFor={`${formId}-first-message`}>初次问候</label>
              <textarea
                id={`${formId}-first-message`}
                value={draft.firstMessage}
                onChange={(e) => update('firstMessage', e.target.value)}
                rows={3}
              />
            </div>
            <div className="form-group">
              <label htmlFor={`${formId}-example-dialogue`}>示例对话</label>
              <textarea
                id={`${formId}-example-dialogue`}
                value={draft.exampleDialogue}
                onChange={(e) => update('exampleDialogue', e.target.value)}
                rows={4}
                placeholder="用示例固定角色的表达习惯"
              />
            </div>
            <div className="form-group">
              <label htmlFor={`${formId}-system-prompt`}>补充指令</label>
              <textarea
                id={`${formId}-system-prompt`}
                value={draft.systemPrompt}
                onChange={(e) => update('systemPrompt', e.target.value)}
                rows={3}
                placeholder="会附加到 SoulMate 的安全提示之后"
              />
            </div>
            <div className="persona-metadata-grid">
              <div className="form-group">
                <label htmlFor={`${formId}-creator`}>创作者</label>
                <input
                  id={`${formId}-creator`}
                  value={draft.creator}
                  onChange={(e) => update('creator', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor={`${formId}-tags`}>标签</label>
                <input
                  id={`${formId}-tags`}
                  value={draft.tags.join(', ')}
                  onChange={(e) =>
                    update(
                      'tags',
                      e.target.value
                        .split(/[,，]/)
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="日常, 治愈"
                />
              </div>
            </div>
          </details>
          <section className="lorebook-editor" aria-labelledby={`${formId}-lorebook-title`}>
            <div className="lorebook-heading">
              <div>
                <h3 id={`${formId}-lorebook-title`}>
                  <BookOpen size={15} /> 世界书
                </h3>
                <p>关键词出现时，相关设定才会进入对话上下文。</p>
              </div>
              <button type="button" className="tag" onClick={addLoreEntry}>
                <Plus size={13} /> 条目
              </button>
            </div>
            {draft.lorebook.map((entry, index) => (
              <div className="lorebook-entry" key={entry.id}>
                <div className="lorebook-entry-top">
                  <input
                    aria-label="条目名称"
                    value={entry.name}
                    onChange={(e) => updateLoreEntry(index, { name: e.target.value })}
                  />
                  <label className="lorebook-enabled">
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      onChange={(e) => updateLoreEntry(index, { enabled: e.target.checked })}
                    />{' '}
                    启用
                  </label>
                  <button
                    type="button"
                    className="icon-action danger"
                    onClick={() =>
                      update(
                        'lorebook',
                        draft.lorebook.filter((_, entryIndex) => entryIndex !== index),
                      )
                    }
                    aria-label={`删除世界书条目 ${entry.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <input
                  aria-label="触发关键词"
                  value={entry.keywords.join(', ')}
                  onChange={(e) =>
                    updateLoreEntry(index, {
                      keywords: e.target.value
                        .split(/[,，]/)
                        .map((key) => key.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="触发关键词，用逗号分隔"
                />
                <textarea
                  aria-label="条目内容"
                  value={entry.content}
                  onChange={(e) => updateLoreEntry(index, { content: e.target.value })}
                  rows={3}
                  placeholder="命中关键词后注入的真实世界设定"
                />
              </div>
            ))}
          </section>
          <div className="form-group" role="group" aria-labelledby={`${formId}-relationship-label`}>
            <div id={`${formId}-relationship-label`} className="form-label">
              关系阶段
            </div>
            <p className="stage-editor-hint">选择当前阶段，也可以为每个阶段修改名称和图标。</p>
            <div className="stage-editor">
              {STAGE_ORDER.map((stage, index) => (
                <div className={`stage-editor-row ${draft.relationshipStage === stage ? 'selected' : ''}`} key={stage}>
                  <button
                    type="button"
                    className="stage-current-button"
                    onClick={() => update('relationshipStage', stage)}
                    aria-label={`设为当前阶段：${getStageAppearance(draft, stage).label}`}
                    aria-pressed={draft.relationshipStage === stage}
                    title="设为当前阶段"
                  >
                    {index + 1}
                  </button>
                  <input
                    className="stage-icon-input"
                    aria-label={`${stage}阶段图标`}
                    value={draft.stageAppearance?.[stage]?.icon ?? DEFAULT_STAGE_APPEARANCE[stage].icon}
                    onChange={(event) => updateStageAppearance(stage, { icon: event.target.value })}
                    maxLength={12}
                  />
                  <input
                    className="stage-label-input"
                    aria-label={`${stage}阶段名称`}
                    value={draft.stageAppearance?.[stage]?.label ?? DEFAULT_STAGE_APPEARANCE[stage].label}
                    onChange={(event) => updateStageAppearance(stage, { label: event.target.value })}
                    maxLength={12}
                  />
                </div>
              ))}
            </div>
            <p className="stage-editor-hint">自动推进仍按第 1 至第 5 阶段依次进行。</p>
          </div>
          <div className="form-group">
            <div id={`${formId}-hair-label`} className="form-label">
              发色
            </div>
            <div className="color-grid" role="group" aria-labelledby={`${formId}-hair-label`}>
              {HAIR.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={`color-btn ${draft.hairColor === color ? 'active' : ''}`}
                  style={{ background: color }}
                  onClick={() => update('hairColor', color)}
                  aria-label={`选择发色 ${color}`}
                  aria-pressed={draft.hairColor === color}
                />
              ))}
            </div>
            <div id={`${formId}-eyes-label`} className="form-label" style={{ marginTop: 8 }}>
              瞳色
            </div>
            <div className="color-grid" role="group" aria-labelledby={`${formId}-eyes-label`}>
              {EYES.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={`color-btn ${draft.eyeColor === color ? 'active' : ''}`}
                  style={{ background: color }}
                  onClick={() => update('eyeColor', color)}
                  aria-label={`选择瞳色 ${color}`}
                  aria-pressed={draft.eyeColor === color}
                />
              ))}
            </div>
          </div>
          <div className="form-group" role="group" aria-labelledby={`${formId}-icon-label`}>
            <div id={`${formId}-icon-label`} className="form-label">
              角色图标
            </div>
            <input
              aria-label="自定义角色图标"
              value={draft.emoji}
              onChange={(event) => update('emoji', event.target.value)}
              placeholder="输入表情或符号"
              maxLength={12}
            />
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
            <button type="button" className="tag" onClick={closeEditor} style={{ padding: '8px 24px' }}>
              取消
            </button>
            <button
              type="button"
              className="tag active"
              onClick={saveEdit}
              disabled={avatarProcessing || !draft.name.trim()}
              style={{ padding: '8px 24px' }}
            >
              {avatarProcessing ? '处理中...' : '保存'}
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
        <div>
          <span className="settings-eyebrow">COMPANIONS</span>
          <h2 id={`${formId}-manager-title`}>我的灵伴</h2>
        </div>
        <button type="button" className="close-btn" onClick={onClose} aria-label="关闭角色管理">
          <X size={20} />
        </button>
      </div>
      <div className="persona-body">
        <div className="persona-library-actions">
          <label className="tag active" htmlFor={`${formId}-character-import`}>
            <Upload size={14} /> 导入角色卡
            <input
              id={`${formId}-character-import`}
              type="file"
              accept="application/json,.json"
              className="hidden-file-input"
              onChange={(event) => void importCard(event)}
            />
          </label>
          <span>兼容 Character Card V2 JSON</span>
        </div>
        {importError && (
          <p className="settings-error" role="alert">
            {importError}
          </p>
        )}
        <div className="persona-grid">
          {personas.map((p, i) => (
            <article key={p.id} className={`persona-list-item ${i === activeIndex ? 'active' : ''}`}>
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
                    {p.personality} · {getStageAppearance(p).label}
                  </div>
                  {p.tags.length > 0 && <div className="persona-card-tags">{p.tags.slice(0, 2).join(' · ')}</div>}
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
                <button
                  type="button"
                  className="persona-action-btn"
                  onClick={() => downloadCharacterCard(p)}
                  aria-label={`导出角色 ${p.name}`}
                  title="导出 Character Card V2"
                >
                  <Download size={14} />
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
            </article>
          ))}
          <button type="button" className="persona-create-card" onClick={startNew}>
            <span>
              <Plus size={18} />
            </span>
            <strong>新建角色</strong>
            <small>创建一个新的陪伴人格</small>
          </button>
        </div>
      </div>
    </Dialog>
  )
}
