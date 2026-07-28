import type { AISettings, Message, Persona, TTSSettings } from '../types'
import { prepareConversation } from './conversationService'
import { conversationGateway } from './conversationGateway'
import { speak } from './ttsService'

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 1500

interface ConversationTurnOptions {
  messages: Message[]
  query: string
  persona: Persona
  aiSettings: AISettings
  ttsSettings: TTSSettings
  requestId: string
  signal: AbortSignal
  isCurrent: () => boolean
  onChunk: (content: string, thinking: string) => void
  onSpeakingChange: (speaking: boolean) => void
}

export interface ConversationTurnResult {
  message: Message
  persistenceError: string | null
}

export async function runConversationTurn(options: ConversationTurnOptions): Promise<ConversationTurnResult | null> {
  const apiMessages = await prepareConversation({
    messages: options.messages,
    persona: options.persona,
    query: options.query,
    useKnowledgeRetrieval: options.aiSettings.useWebSearch,
  })

  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (options.signal.aborted || !options.isCurrent()) return null
    if (attempt > 0) await waitForRetry(RETRY_DELAY_MS * attempt, options.signal)

    try {
      const completion = await conversationGateway.streamCompletion({
        messages: apiMessages,
        settings: options.aiSettings,
        requestId: options.requestId,
        signal: options.signal,
        isCurrent: options.isCurrent,
        onChunk: options.onChunk,
      })
      if (options.signal.aborted || !options.isCurrent()) return null

      const message: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: completion.content || '...',
        thinking: completion.thinking || undefined,
        timestamp: Date.now(),
      }
      let persistenceError: string | null = null
      try {
        await conversationGateway.saveMessage(options.persona.id, message)
      } catch (error) {
        console.error('Failed to save AI message:', error)
        persistenceError = '回复已生成，但保存失败，重启后可能丢失'
      }

      if (options.ttsSettings.autoPlay && options.ttsSettings.enabled) {
        options.onSpeakingChange(true)
        void speak(completion.content, options.ttsSettings).finally(() => options.onSpeakingChange(false))
      }

      return { message, persistenceError }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('发送失败，请检查网络和API设置')
}

function waitForRetry(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, delay)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}
