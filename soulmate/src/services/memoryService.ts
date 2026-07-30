import { invoke } from '@tauri-apps/api/core'
import type { AISettings, Memory, MemoryCategory, Message } from '../types'

interface MemoryCandidate {
  category: MemoryCategory
  content: string
  sourceMessageId?: string
  confidence: number
}

export const memoryService = {
  list(personaId: string): Promise<Memory[]> {
    return invoke<Memory[]>('list_memories', { personaId })
  },

  save(memory: Memory): Promise<Memory> {
    return invoke<Memory>('upsert_memory', { memory })
  },

  remove(personaId: string, memoryId: string): Promise<void> {
    return invoke('delete_memory', { personaId, memoryId })
  },

  setPinned(personaId: string, memoryId: string, pinned: boolean): Promise<void> {
    return invoke('set_memory_pinned', { personaId, memoryId, pinned })
  },

  testConnection(settings: AISettings): Promise<void> {
    return invoke('test_ai_connection', {
      endpoint: settings.endpoint,
      model: settings.model,
    })
  },

  async extract(personaId: string, settings: AISettings, messages: Message[]): Promise<Memory[]> {
    const userMessages = messages
      .filter((message) => message.role === 'user')
      .slice(-8)
      .map(({ id, role, content }) => ({ id, role, content: content.slice(0, 1000) }))
    if (userMessages.length === 0) return []

    const candidates = await invoke<MemoryCandidate[]>('extract_memories', {
      endpoint: settings.endpoint,
      model: settings.model,
      messagesJson: JSON.stringify(userMessages),
    })
    const sourceIds = new Set(userMessages.map((message) => message.id))
    const timestamp = Date.now()
    const saved: Memory[] = []

    for (const candidate of candidates) {
      if (candidate.confidence < 0.7) continue
      const memory = await this.save({
        id: crypto.randomUUID(),
        personaId,
        category: candidate.category,
        content: candidate.content.trim(),
        sourceMessageId:
          candidate.sourceMessageId && sourceIds.has(candidate.sourceMessageId)
            ? candidate.sourceMessageId
            : userMessages[userMessages.length - 1]?.id,
        confidence: candidate.confidence,
        pinned: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      saved.push(memory)
    }
    return saved
  },
}
