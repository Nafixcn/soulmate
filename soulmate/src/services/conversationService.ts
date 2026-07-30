import type { Memory, Message, Persona, UserProfile } from '../types'
import {
  buildConversationMessages,
  selectRelevantMemories,
  shouldRetrieveKnowledge,
  type ApiMessage,
  type KnowledgeResult,
} from '../domain/conversation'
import { conversationGateway } from './conversationGateway'
import { memoryService } from './memoryService'

interface PrepareConversationOptions {
  messages: Message[]
  persona: Persona
  query: string
  useKnowledgeRetrieval: boolean
  useMemory: boolean
  userProfile: UserProfile
}

export async function prepareConversation({
  messages,
  persona,
  query,
  useKnowledgeRetrieval,
  useMemory,
  userProfile,
}: PrepareConversationOptions): Promise<ApiMessage[]> {
  let knowledgeResults: KnowledgeResult[] = []
  let memories: Memory[] = []

  if (useKnowledgeRetrieval && shouldRetrieveKnowledge(query)) {
    try {
      knowledgeResults = await conversationGateway.searchKnowledge(query)
    } catch {
      // Retrieval is optional; the conversation should continue without it.
    }
  }

  if (useMemory) {
    try {
      memories = selectRelevantMemories(await memoryService.list(persona.id), query)
    } catch {
      // Memory retrieval is optional; local database errors should not block chat.
    }
  }

  return buildConversationMessages(messages, persona, knowledgeResults, memories, userProfile)
}
