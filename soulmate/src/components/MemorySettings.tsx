import React from 'react'
import { Check, Eye, EyeOff, Pencil, Pin, PinOff, Plus, Trash2, X } from 'lucide-react'
import { memoryService } from '../services/memoryService'
import { useSettingsStore } from '../store/settingsStore'
import type { Memory, MemoryCategory } from '../types'

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  profile: '资料',
  preference: '偏好',
  event: '事件',
  boundary: '边界',
}

function currentTimestamp(): number {
  return Date.now()
}

export const MemorySettings: React.FC = () => {
  const { persona, aiSettings, setAISettings, userProfile, setUserProfile, greetingSettings, setGreetingSettings } =
    useSettingsStore()
  const [memories, setMemories] = React.useState<Memory[]>([])
  const [draft, setDraft] = React.useState('')
  const [category, setCategory] = React.useState<MemoryCategory>('preference')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editContent, setEditContent] = React.useState('')
  const [editCategory, setEditCategory] = React.useState<MemoryCategory>('preference')
  const [status, setStatus] = React.useState('')
  const [loading, setLoading] = React.useState(true)

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      setMemories(await memoryService.list(persona.id))
      setStatus('')
    } catch {
      setStatus('记忆加载失败')
    } finally {
      setLoading(false)
    }
  }, [persona.id])

  React.useEffect(() => {
    let cancelled = false
    memoryService
      .list(persona.id)
      .then((items) => {
        if (!cancelled) {
          setMemories(items)
          setStatus('')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('记忆加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [persona.id])

  const addMemory = async () => {
    const content = draft.trim()
    if (!content) return
    const timestamp = currentTimestamp()
    try {
      await memoryService.save({
        id: crypto.randomUUID(),
        personaId: persona.id,
        category,
        content,
        confidence: 1,
        pinned: true,
        enabled: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      setDraft('')
      await reload()
      setStatus('记忆已保存')
    } catch {
      setStatus('记忆保存失败')
    }
  }

  const togglePinned = async (memory: Memory) => {
    try {
      await memoryService.setPinned(persona.id, memory.id, !memory.pinned)
      await reload()
    } catch {
      setStatus('记忆更新失败')
    }
  }

  const removeMemory = async (memory: Memory) => {
    try {
      await memoryService.remove(persona.id, memory.id)
      setMemories((current) => current.filter((item) => item.id !== memory.id))
      setStatus('记忆已删除')
    } catch {
      setStatus('记忆删除失败')
    }
  }

  const saveEdit = async (memory: Memory) => {
    const content = editContent.trim()
    if (!content) return
    const timestamp = currentTimestamp()
    try {
      await memoryService.save({ ...memory, category: editCategory, content, updatedAt: timestamp })
      setEditingId(null)
      await reload()
      setStatus('记忆已修正')
    } catch {
      setStatus('记忆修正失败，请检查是否与现有记忆重复')
    }
  }

  const toggleEnabled = async (memory: Memory) => {
    const timestamp = currentTimestamp()
    try {
      await memoryService.save({ ...memory, enabled: memory.enabled === false, updatedAt: timestamp })
      await reload()
      setStatus(memory.enabled === false ? '记忆已恢复使用' : '记忆已停用，后续回复不会引用')
    } catch {
      setStatus('记忆状态更新失败')
    }
  }

  return (
    <div className="memory-settings">
      <section className="settings-section">
        <h3>关于你</h3>
        <div className="form-row">
          <label htmlFor="memory-user-name">你的名字</label>
          <input
            id="memory-user-name"
            value={userProfile.name}
            onChange={(event) => setUserProfile({ name: event.target.value })}
            maxLength={40}
          />
        </div>
        <div className="form-row">
          <label htmlFor="memory-user-address">希望被称呼为</label>
          <input
            id="memory-user-address"
            value={userProfile.preferredAddress}
            onChange={(event) => setUserProfile({ preferredAddress: event.target.value })}
            maxLength={40}
          />
        </div>
        <div className="form-row">
          <label htmlFor="memory-user-interests">兴趣</label>
          <input
            id="memory-user-interests"
            value={userProfile.interests}
            onChange={(event) => setUserProfile({ interests: event.target.value })}
            maxLength={200}
          />
        </div>
        <div className="form-row">
          <label htmlFor="memory-user-boundaries">交流边界</label>
          <textarea
            id="memory-user-boundaries"
            value={userProfile.boundaries}
            onChange={(event) => setUserProfile({ boundaries: event.target.value })}
            rows={3}
            maxLength={300}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3>记忆学习</h3>
        <label className="switch-row">
          <span>从聊天中学习明确表达的信息</span>
          <input
            type="checkbox"
            checked={aiSettings.memoryEnabled !== false}
            onChange={(event) => setAISettings({ memoryEnabled: event.target.checked })}
          />
        </label>
        <div className="form-row">
          <label htmlFor="memory-interval">每多少条用户消息整理一次</label>
          <input
            id="memory-interval"
            type="number"
            min={3}
            max={30}
            value={aiSettings.memoryExtractionInterval || 6}
            disabled={aiSettings.memoryEnabled === false}
            onChange={(event) =>
              setAISettings({ memoryExtractionInterval: Math.max(3, Math.min(30, Number(event.target.value) || 6)) })
            }
          />
        </div>
        <p className="setting-hint">整理时，最近的用户消息会发送给当前模型服务商。助手回复不会作为事实保存。</p>
      </section>

      <section className="settings-section">
        <h3>{persona.name}记住的事</h3>
        <p className="setting-hint">
          修正错误内容，或停用不想再用于后续回复的记忆。停用的记忆仍留在列表中，避免再次从相似消息中学习。
        </p>
        <div className="memory-add-row">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as MemoryCategory)}
            aria-label="记忆类别"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void addMemory()
            }}
            placeholder="手动添加一条可靠记忆"
            maxLength={500}
          />
          <button
            type="button"
            className="icon-action"
            onClick={() => void addMemory()}
            title="添加记忆"
            aria-label="添加记忆"
          >
            <Plus size={17} />
          </button>
        </div>
        {loading ? (
          <p className="memory-empty">正在加载…</p>
        ) : memories.length === 0 ? (
          <p className="memory-empty">还没有记忆。你可以手动添加，或在聊天中逐渐积累。</p>
        ) : (
          <div className="memory-list">
            {memories.map((memory) => (
              <article key={memory.id} className={`memory-item ${memory.enabled === false ? 'memory-disabled' : ''}`}>
                {editingId === memory.id ? (
                  <div className="memory-edit-fields">
                    <select
                      value={editCategory}
                      onChange={(event) => setEditCategory(event.target.value as MemoryCategory)}
                      aria-label="修正记忆类别"
                    >
                      {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={editContent}
                      onChange={(event) => setEditContent(event.target.value)}
                      maxLength={500}
                      aria-label="修正记忆内容"
                    />
                  </div>
                ) : (
                  <div>
                    <span className="memory-category">{CATEGORY_LABELS[memory.category]}</span>
                    {memory.enabled === false && <span className="memory-category"> · 已停用</span>}
                    <p>{memory.content}</p>
                  </div>
                )}
                <div className="memory-actions">
                  {editingId === memory.id ? (
                    <>
                      <button
                        type="button"
                        className="icon-action"
                        onClick={() => void saveEdit(memory)}
                        aria-label="保存记忆修正"
                        title="保存修正"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-action"
                        onClick={() => setEditingId(null)}
                        aria-label="取消记忆修正"
                        title="取消"
                      >
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="icon-action"
                        onClick={() => {
                          setEditingId(memory.id)
                          setEditContent(memory.content)
                          setEditCategory(memory.category)
                        }}
                        title="修正记忆"
                        aria-label="修正记忆"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-action"
                        onClick={() => void toggleEnabled(memory)}
                        title={memory.enabled === false ? '恢复使用记忆' : '停用记忆'}
                        aria-label={memory.enabled === false ? '恢复使用记忆' : '停用记忆'}
                      >
                        {memory.enabled === false ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="icon-action"
                    onClick={() => void togglePinned(memory)}
                    title={memory.pinned ? '取消固定' : '固定记忆'}
                    aria-label={memory.pinned ? '取消固定记忆' : '固定记忆'}
                  >
                    {memory.pinned ? <PinOff size={16} /> : <Pin size={16} />}
                  </button>
                  <button
                    type="button"
                    className="icon-action danger"
                    onClick={() => void removeMemory(memory)}
                    title="删除记忆"
                    aria-label="删除记忆"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {status && (
          <p className="data-status" role="status">
            {status}
          </p>
        )}
      </section>

      <section className="settings-section">
        <h3>主动问候</h3>
        <label className="switch-row">
          <span>允许基于真实上下文主动问候</span>
          <input
            type="checkbox"
            checked={greetingSettings.enabled}
            onChange={(event) => setGreetingSettings({ enabled: event.target.checked })}
          />
        </label>
        <div className="form-row">
          <label htmlFor="greeting-count">每天最多</label>
          <select
            id="greeting-count"
            value={greetingSettings.dailyCount}
            disabled={!greetingSettings.enabled}
            onChange={(event) => setGreetingSettings({ dailyCount: Number(event.target.value) })}
          >
            {[0, 1, 2, 3, 4].map((count) => (
              <option key={count} value={count}>
                {count} 次
              </option>
            ))}
          </select>
        </div>
        <p className="setting-hint">默认安静时段为 22:00–09:00，问候只引用你的资料和真实聊天主题。</p>
      </section>
    </div>
  )
}
