import { invoke } from '@tauri-apps/api/core'
import type { Message, Persona } from '../types'
import {
  buildConversationMessages,
  shouldRetrieveKnowledge,
  type ApiMessage,
  type KnowledgeResult,
} from '../domain/conversation'

interface PrepareConversationOptions {
  messages: Message[]
  persona: Persona
  query: string
  useKnowledgeRetrieval: boolean
}

export async function prepareConversation({
  messages,
  persona,
  query,
  useKnowledgeRetrieval,
}: PrepareConversationOptions): Promise<ApiMessage[]> {
  let knowledgeResults: KnowledgeResult[] = []

  if (useKnowledgeRetrieval && shouldRetrieveKnowledge(query)) {
    try {
      knowledgeResults = await invoke<KnowledgeResult[]>('search_web', { query })
    } catch {
      // Retrieval is optional; the conversation should continue without it.
    }
  }

  return buildConversationMessages(messages, persona, knowledgeResults)
}
