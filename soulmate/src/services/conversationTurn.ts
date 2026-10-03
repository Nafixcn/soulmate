import {
  DEFAULT_USER_PROFILE,
  type AISettings,
  type Message,
  type Persona,
  type TTSSettings,
  type UserProfile,
} from '../types'
import { prepareConversation } from './conversationService'
import { conversationGateway } from './conversationGateway'
import { speak } from './ttsService'
import { isRetryableError, toUserMessage } from './appError'

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 1500

interface ConversationTurnOptions {
  messages: Message[]
  query: string
  persona: Persona
  aiSettings: AISettings
  ttsSettings: TTSSettings
  userProfile?: UserProfile
  requestId: string
  signal: AbortSignal
  isCurrent: () => boolean
  onChunk: (content: string, thinking: string) => void
  onSpeakingChange: (speaking: boolean) => void
  persistMessage?: boolean
}

export interface ConversationTurnResult {
  message: Message
  persistenceError: string | null
}

export async function runConversationTurn(options: ConversationTurnOptions): Promise<ConversationTurnResult | null> {
  const prepared = await prepareConversation({
    messages: options.messages,
    persona: options.persona,
    query: options.query,
    useKnowledgeRetrieval: options.aiSettings.useWebSearch,
    useMemory: options.aiSettings.memoryEnabled !== false,
    userProfile: options.userProfile || DEFAULT_USER_PROFILE,
  })

  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (options.signal.aborted || !options.isCurrent()) return null
    if (attempt > 0) {
      await waitForRetry(RETRY_DELAY_MS * attempt, options.signal)
      if (options.signal.aborted || !options.isCurrent()) return null
    }

    try {
      const completion = await conversationGateway.streamCompletion({
        messages: prepared.messages,
        settings: options.aiSettings,
        requestId: options.requestId,
        signal: options.signal,
        isCurrent: options.isCurrent,
        onChunk: options.onChunk,
      })
      if (options.signal.aborted || !options.isCurrent()) return null
      if (!completion.content.trim()) throw new Error('模型返回了空回复，请重试')

      const message: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: completion.content,
        thinking: completion.thinking || undefined,
        timestamp: Date.now(),
        memoryReferences: prepared.memories.map(({ id, content }) => ({ id, content })),
      }
      let persistenceError: string | null = null
      if (options.persistMessage !== false) {
        try {
          await conversationGateway.saveMessage(options.persona.id, message)
        } catch (error) {
          console.error('Failed to save AI message:', error)
          persistenceError = '回复已生成，但保存失败，重启后可能丢失'
        }
      }

      if (options.signal.aborted || !options.isCurrent()) return null

      if (options.ttsSettings.autoPlay && options.ttsSettings.enabled) {
        options.onSpeakingChange(true)
        void speak(completion.content, options.ttsSettings).finally(() => options.onSpeakingChange(false))
      }

      return { message, persistenceError }
    } catch (error) {
      lastError = error
      if (!isRetryableError(error)) break
    }
  }

  throw new Error(toUserMessage(lastError, '发送失败，请检查网络和 API 设置'))
}

function waitForRetry(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, delay)
    signal.addEventListener('abort', finish, { once: true })
  })
}
