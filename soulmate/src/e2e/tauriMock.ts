import { mockIPC } from '@tauri-apps/api/mocks'
import type { AiChunk, Memory, Message, MessagePage } from '../types'

const historicalMessages: Message[] = [
  { id: 'old-message', role: 'user', content: '记得那场电影吗', timestamp: 1 },
  { id: 'old-reply', role: 'assistant', content: '当然记得呀', timestamp: 2 },
]

function page(messages: Message[], hasMore = false): MessagePage {
  return {
    messages,
    hasMore,
    userMessageCount: messages.filter((message) => message.role === 'user').length,
  }
}

export function setupTauriMock(): void {
  let settingsJson: string | null = JSON.stringify({
    onboardingCompleted: true,
    ...(new URLSearchParams(location.search).has('legacy-model')
      ? { aiSettings: { endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' } }
      : {}),
  })
  let apiConfigured = false
  let appLockPin = ''
  let memories: Memory[] = []
  let completionCount = 0
  const memoryRevisions = new Map<string, number>()
  const streams = new Map<string, { cancel: () => void }>()
  const savedMessageIds = new Map<string, Set<string>>()
  const longHistory: Message[] = Array.from({ length: 80 }, (_, index) => ({
    id: `history-${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `历史消息 ${index + 1}\n${'今天一起聊聊音乐和电影，也聊聊生活里的小事。'.repeat(8)}`,
    timestamp: index + 1,
  }))
  const invalidateExtraction = (personaId: string) => {
    memoryRevisions.set(personaId, (memoryRevisions.get(personaId) ?? 0) + 1)
  }
  const rememberMessage = (personaId: string, message: Message) => {
    let ids = savedMessageIds.get(personaId)
    if (!ids) {
      ids = new Set()
      savedMessageIds.set(personaId, ids)
    }
    ids.add(message.id)
  }
  const upsertMockMemory = (memory: Memory): Memory => {
    const index = memories.findIndex((item) => item.id === memory.id)
    if (index >= 0) {
      memories[index] = memory
      return memory
    }
    const duplicate = memories.find((item) => item.personaId === memory.personaId && item.content === memory.content)
    if (duplicate) return duplicate
    memories = [memory, ...memories]
    return memory
  }

  mockIPC((command, payload = {}) => {
    const args = payload as Record<string, unknown>
    switch (command) {
      case 'get_settings':
        if (new URLSearchParams(location.search).has('onboarding')) return null
        return settingsJson
      case 'save_settings':
        settingsJson = args.settingsJson as string
        return null
      case 'has_api_key':
        return apiConfigured
      case 'save_api_key':
        apiConfigured = Boolean(args.apiKey)
        return null
      case 'take_startup_warning':
        return null
      case 'has_app_lock':
        return Boolean(appLockPin)
      case 'set_app_lock':
        appLockPin = args.pin as string
        return null
      case 'verify_app_lock':
        return { unlocked: !appLockPin || args.pin === appLockPin, retryAfterMs: 0 }
      case 'export_database_backup':
        return JSON.stringify({ formatVersion: 4, exportedAt: 1, settings: {}, messages: [], memories })
      case 'import_database_backup':
        memoryRevisions.forEach((_, personaId) => invalidateExtraction(personaId))
        return { messageCount: 0, memoryCount: 0, personaCount: 0, hasSettings: true }
      case 'list_memories':
        return memories.filter((memory) => memory.personaId === args.personaId)
      case 'get_memory_snapshot': {
        const personaId = args.personaId as string
        const revision = memoryRevisions.get(personaId) ?? 0
        memoryRevisions.set(personaId, revision)
        return { memories: structuredClone(memories.filter((memory) => memory.personaId === personaId)), revision }
      }
      case 'apply_extracted_memories': {
        const personaId = args.personaId as string
        if (args.expectedRevision !== (memoryRevisions.get(personaId) ?? 0)) return []
        const saved = (args.memories as Memory[]).map(upsertMockMemory)
        invalidateExtraction(personaId)
        return saved
      }
      case 'upsert_memory': {
        const memory = args.memory as Memory
        invalidateExtraction(memory.personaId)
        return upsertMockMemory(memory)
      }
      case 'delete_memory':
        memories = memories.filter((memory) => memory.id !== args.memoryId)
        invalidateExtraction(args.personaId as string)
        return null
      case 'set_memory_pinned':
        memories = memories.map((memory) =>
          memory.id === args.memoryId ? { ...memory, pinned: Boolean(args.pinned) } : memory,
        )
        invalidateExtraction(args.personaId as string)
        return null
      case 'extract_memories':
        return []
      case 'test_ai_connection':
        return null
      case 'discover_local_models':
        return args.provider === 'ollama' ? ['qwen3:8b', 'gemma3:4b'] : ['local-model']
      case 'get_messages':
        if (new URLSearchParams(location.search).get('history') === 'long') {
          longHistory.forEach((message) => rememberMessage(args.personaId as string, message))
          return page(longHistory)
        }
        return page([])
      case 'search_messages':
        return historicalMessages.slice(0, 1)
      case 'get_messages_from':
        return page(historicalMessages)
      case 'get_all_messages':
        return historicalMessages
      case 'save_message':
        if (new URLSearchParams(location.search).has('fail-save') && (args.message as Message).role === 'user') {
          throw new Error('database unavailable')
        }
        rememberMessage(args.personaId as string, args.message as Message)
        return null
      case 'save_message_if_source_exists': {
        const personaId = args.personaId as string
        if (!savedMessageIds.get(personaId)?.has(args.sourceMessageId as string)) return false
        rememberMessage(personaId, args.message as Message)
        return true
      }
      case 'send_message': {
        const channel = args.onChunk as { onmessage: (chunk: AiChunk) => void }
        if (new URLSearchParams(location.search).get('stream') === 'slow') {
          return new Promise<void>((resolve) => {
            let count = 0
            const finish = () => {
              clearInterval(timer)
              streams.delete(args.requestId as string)
              channel.onmessage({ content: '', thinking: '', done: true })
              resolve()
            }
            const timer = setInterval(() => {
              channel.onmessage({ content: `第 ${++count} 段：慢慢说说今天的故事。\n\n`, thinking: '', done: false })
              if (count >= 60) finish()
            }, 50)
            streams.set(args.requestId as string, { cancel: finish })
          })
        }
        const content = completionCount++ === 0 ? '这是来自测试模型的回复' : '这是另一个保留的回复'
        queueMicrotask(() => {
          channel.onmessage({ content, thinking: '', done: false })
          channel.onmessage({ content: '', thinking: '', done: true })
        })
        return null
      }
      case 'cancel_request':
        streams.get(args.requestId as string)?.cancel()
        return null
      case 'clear_messages':
      case 'delete_persona':
        savedMessageIds.delete(args.personaId as string)
        invalidateExtraction(args.personaId as string)
        return null
      case 'delete_messages_from':
        {
          const ids = savedMessageIds.get(args.personaId as string)
          if (ids) {
            const ordered = [...ids]
            const index = ordered.indexOf(args.fromMessageId as string)
            if (index >= 0) ordered.slice(index).forEach((id) => ids.delete(id))
          }
        }
        invalidateExtraction(args.personaId as string)
        return 0
      case 'plugin:store|load':
        return 1
      case 'plugin:store|get':
        return [null, false]
      case 'plugin:store|delete':
        return false
      case 'plugin:store|save':
        return null
      default:
        throw new Error(`Unhandled Tauri command in E2E test: ${command}`)
    }
  })
}
