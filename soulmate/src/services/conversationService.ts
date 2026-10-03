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

export interface PreparedConversation {
  messages: ApiMessage[]
  memories: Memory[]
}

export async function prepareConversation({
  messages,
  persona,
  query,
  useKnowledgeRetrieval,
  useMemory,
  userProfile,
}: PrepareConversationOptions): Promise<PreparedConversation> {
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
      const recentUserMessages = messages
        .filter((message) => message.role === 'user')
        .slice(-4, -1)
        .map((message) => message.content)
      memories = selectRelevantMemories(await memoryService.list(persona.id), query, 6, recentUserMessages)
    } catch {
      // Memory retrieval is optional; local database errors should not block chat.
    }
  }

  return {
    messages: buildConversationMessages(messages, persona, knowledgeResults, memories, userProfile),
    memories,
  }
}
