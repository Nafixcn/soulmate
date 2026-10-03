import { Channel, invoke } from '@tauri-apps/api/core'
import type { AISettings, AiChunk, Message, MessagePage } from '../types'
import type { ApiMessage, KnowledgeResult } from '../domain/conversation'

interface StreamCompletionOptions {
  messages: ApiMessage[]
  settings: AISettings
  requestId: string
  signal: AbortSignal
  isCurrent: () => boolean
  onChunk: (content: string, thinking: string) => void
}

export interface CompletionResult {
  content: string
  thinking: string
}

export interface RelationshipEvaluation {
  stage: string
  reason: string
}

export const conversationGateway = {
  getMessages(personaId: string, limit: number, beforeId?: string): Promise<MessagePage> {
    return invoke<MessagePage>('get_messages', { personaId, limit, beforeId })
  },

  getMessagesFrom(personaId: string, messageId: string): Promise<MessagePage> {
    return invoke<MessagePage>('get_messages_from', { personaId, messageId })
  },

  getAllMessages(personaId: string): Promise<Message[]> {
    return invoke<Message[]>('get_all_messages', { personaId })
  },

  saveMessage(personaId: string, message: Message): Promise<void> {
    return invoke('save_message', { personaId, message })
  },

  saveMessageIfSourceExists(personaId: string, sourceMessageId: string, message: Message): Promise<boolean> {
    return invoke<boolean>('save_message_if_source_exists', { personaId, sourceMessageId, message })
  },

  clearMessages(personaId: string): Promise<void> {
    return invoke('clear_messages', { personaId })
  },

  deleteMessagesFrom(personaId: string, fromMessageId: string): Promise<number> {
    return invoke<number>('delete_messages_from', { personaId, fromMessageId })
  },

  searchMessages(personaId: string, query: string): Promise<Message[]> {
    return invoke<Message[]>('search_messages', { personaId, query })
  },

  searchKnowledge(query: string): Promise<KnowledgeResult[]> {
    return invoke<KnowledgeResult[]>('search_web', { query })
  },

  cancelRequest(requestId: string): Promise<void> {
    return invoke('cancel_request', { requestId })
  },

  evaluateRelationship(
    settings: AISettings,
    messages: Array<Pick<Message, 'role' | 'content'>>,
  ): Promise<RelationshipEvaluation> {
    return invoke<RelationshipEvaluation>('evaluate_relationship', {
      endpoint: settings.endpoint,
      model: settings.model,
      messages,
    })
  },

  async streamCompletion({
    messages,
    settings,
    requestId,
    signal,
    isCurrent,
    onChunk,
  }: StreamCompletionOptions): Promise<CompletionResult> {
    const channel = new Channel<AiChunk>()
    let content = ''
    let thinking = ''
    let resolveCompleted: () => void = () => {}
    const completed = new Promise<void>((resolve) => {
      resolveCompleted = resolve
    })

    channel.onmessage = (chunk) => {
      if (chunk.done) {
        resolveCompleted()
        return
      }
      if (signal.aborted || !isCurrent()) return
      content += chunk.content
      thinking += chunk.thinking
      onChunk(content, thinking)
    }

    await invoke('send_message', {
      messages,
      endpoint: settings.endpoint,
      model: settings.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      requestId,
      onChunk: channel,
    })
    // A successful command is also terminal if its final channel event is lost.
    resolveCompleted()
    await completed

    return { content, thinking }
  },
}
