import { invoke } from '@tauri-apps/api/core'
import type { AISettings, Memory, MemoryCategory, Message } from '../types'

interface MemoryCandidate {
  category: MemoryCategory
  content: string
  sourceMessageId?: string
  confidence: number
}

interface MemorySnapshot {
  memories: Memory[]
  revision: number
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

  async extract(
    personaId: string,
    settings: AISettings,
    messages: Message[],
    isCurrent: () => boolean = () => true,
  ): Promise<Memory[]> {
    const userMessages = messages
      .filter((message) => message.role === 'user')
      .slice(-8)
      .map(({ id, role, content }) => ({ id, role, content: content.slice(0, 1000) }))
    if (userMessages.length === 0 || !isCurrent()) return []

    const { memories: existing, revision } = await invoke<MemorySnapshot>('get_memory_snapshot', { personaId })
    if (!isCurrent()) return []
    const candidates = await invoke<MemoryCandidate[]>('extract_memories', {
      endpoint: settings.endpoint,
      model: settings.model,
      messages: userMessages,
    })
    if (!isCurrent()) return []
    const sourceIds = new Set(userMessages.map((message) => message.id))
    const timestamp = Date.now()
    const pending = new Map<string, Memory>()

    for (const candidate of candidates) {
      if (candidate.confidence < 0.7) continue
      const duplicate = findRelatedMemory(existing, candidate)
      if (duplicate?.enabled === false) continue
      const memory: Memory = {
        id: duplicate?.id || crypto.randomUUID(),
        personaId,
        category: candidate.category,
        content: candidate.content.trim(),
        sourceMessageId:
          candidate.sourceMessageId && sourceIds.has(candidate.sourceMessageId)
            ? candidate.sourceMessageId
            : userMessages[userMessages.length - 1]?.id,
        confidence: candidate.confidence,
        pinned: duplicate?.pinned || false,
        enabled: true,
        createdAt: duplicate?.createdAt || timestamp,
        updatedAt: timestamp,
      }
      pending.set(memory.id, memory)
      if (duplicate) {
        const index = existing.findIndex((item) => item.id === duplicate.id)
        if (index >= 0) existing[index] = memory
      } else {
        existing.push(memory)
      }
    }
    if (pending.size === 0) return []
    // The native transaction checks the revision before writing any candidate.
    // A manual edit or deletion during extraction invalidates the whole batch.
    return invoke<Memory[]>('apply_extracted_memories', {
      personaId,
      expectedRevision: revision,
      memories: [...pending.values()],
    })
  },
}

function findRelatedMemory(existing: Memory[], candidate: MemoryCandidate): Memory | undefined {
  const candidateTokens = memoryTokens(candidate.content)
  return existing
    .filter(
      (memory) =>
        (memory.category === candidate.category || memory.content.trim() === candidate.content.trim()) &&
        (!memory.pinned || memory.enabled === false),
    )
    .map((memory) => ({ memory, similarity: jaccard(candidateTokens, memoryTokens(memory.content)) }))
    .filter(({ similarity }) => similarity >= 0.48)
    .sort((left, right) => right.similarity - left.similarity)[0]?.memory
}

function memoryTokens(content: string): Set<string> {
  const normalized = content.toLocaleLowerCase().replace(/[，。！？、,.!?\s]/g, '')
  const tokens = new Set<string>()
  for (let index = 0; index < normalized.length - 1; index++) tokens.add(normalized.slice(index, index + 2))
  return tokens
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  for (const token of left) if (right.has(token)) intersection++
  return intersection / (left.size + right.size - intersection)
}
