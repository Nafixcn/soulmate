import { create } from 'zustand'
import { Message, Expression, AISettings, TTSSettings, Persona } from '../types'
import { stopSpeaking } from '../services/ttsService'
import { useSettingsStore } from './settingsStore'
import { detectExpression, findRegenerationTurn } from '../domain/conversation'
import { conversationGateway } from '../services/conversationGateway'
import { runConversationTurn } from '../services/conversationTurn'
import { memoryService } from '../services/memoryService'
import { getStageAppearance, STAGE_ORDER } from '../domain/relationshipStage'

const PAGE_SIZE = 100
let conversationEpoch = 0

interface ChatStore {
  messages: Message[]
  isTyping: boolean
  expression: Expression
  isSpeaking: boolean
  error: string | null
  streamingContent: string
  streamingThinking: string
  abortController: AbortController | null
  requestId: string | null
  userMsgCount: number
  activePersonaId: string
  isLoadingConversation: boolean
  hasMore: boolean
  isLoadingMore: boolean

  setExpression: (expr: Expression) => void
  sendMessage: (content: string, persona: Persona, aiSettings: AISettings, ttsSettings: TTSSettings) => Promise<boolean>
  loadMessages: (personaId: string) => Promise<void>
  loadEarlierMessages: () => Promise<void>
  revealMessage: (messageId: string) => Promise<boolean>
  clearChat: () => Promise<boolean>
  clearError: () => void
  deleteFrom: (fromMessageId: string) => Promise<boolean>
  regenerate: (
    persona: Persona,
    aiSettings: AISettings,
    ttsSettings: TTSSettings,
    aiMessageId?: string,
  ) => Promise<void>
  switchAlternative: (messageId: string, direction: -1 | 1) => Promise<void>
  cancelRequest: () => Promise<void>
}

async function cancelCurrent(state: ChatStore) {
  if (state.abortController) {
    state.abortController.abort()
  }
  if (state.requestId) {
    try {
      await conversationGateway.cancelRequest(state.requestId)
    } catch {
      /* request already finished */
    }
  }
}

function resetCancelState() {
  return { isTyping: false, streamingContent: '', streamingThinking: '', abortController: null, requestId: null }
}

function isCurrentTurn(personaId: string, requestId: string) {
  const state = useChatStore.getState()
  return state.activePersonaId === personaId && state.requestId === requestId
}

function isCurrentConversation(personaId: string, epoch: number) {
  return useChatStore.getState().activePersonaId === personaId && conversationEpoch === epoch
}

function hasSameRequest(current: ChatStore, previous: ChatStore) {
  return current.activePersonaId === previous.activePersonaId && current.requestId === previous.requestId
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isTyping: false,
  expression: 'neutral',
  isSpeaking: false,
  error: null,
  streamingContent: '',
  streamingThinking: '',
  abortController: null,
  requestId: null,
  userMsgCount: 0,
  activePersonaId: 'default',
  isLoadingConversation: false,
  hasMore: false,
  isLoadingMore: false,

  setExpression: (expression) => set({ expression }),
  clearError: () => set({ error: null }),

  loadMessages: async (personaId) => {
    const state = get()
    const epoch = ++conversationEpoch
    await cancelCurrent(state)
    if (conversationEpoch !== epoch) return
    set({
      activePersonaId: personaId,
      isLoadingConversation: true,
      messages: [],
      hasMore: false,
      isLoadingMore: false,
      userMsgCount: 0,
      ...resetCancelState(),
    })
    try {
      const page = await conversationGateway.getMessages(personaId, PAGE_SIZE)
      if (get().activePersonaId !== personaId || conversationEpoch !== epoch) return
      set({
        messages: page.messages,
        hasMore: page.hasMore,
        userMsgCount: page.userMessageCount,
      })
    } catch (e) {
      console.error('Failed to load messages:', e)
      if (get().activePersonaId === personaId && conversationEpoch === epoch) set({ error: '加载历史消息失败' })
    } finally {
      if (get().activePersonaId === personaId && conversationEpoch === epoch) set({ isLoadingConversation: false })
    }
  },

  loadEarlierMessages: async () => {
    const { messages, isLoadingMore, activePersonaId } = get()
    if (isLoadingMore || messages.length === 0) return
    const epoch = conversationEpoch
    const firstMessageId = messages[0].id
    set({ isLoadingMore: true })
    try {
      const page = await conversationGateway.getMessages(activePersonaId, PAGE_SIZE, firstMessageId)
      if (get().activePersonaId !== activePersonaId || conversationEpoch !== epoch) return
      set((current) => {
        if (current.messages[0]?.id !== firstMessageId) return current
        const visibleIds = new Set(current.messages.map((message) => message.id))
        return {
          messages: [...page.messages.filter((message) => !visibleIds.has(message.id)), ...current.messages],
          hasMore: page.hasMore,
          userMsgCount: Math.max(current.userMsgCount, page.userMessageCount),
        }
      })
    } catch (e) {
      console.error('Failed to load earlier messages:', e)
    } finally {
      if (conversationEpoch === epoch && get().activePersonaId === activePersonaId) set({ isLoadingMore: false })
    }
  },

  revealMessage: async (messageId) => {
    const personaId = get().activePersonaId
    if (get().messages.some((message) => message.id === messageId)) return true
    const epoch = ++conversationEpoch
    set({ isLoadingConversation: true, isLoadingMore: false })
    try {
      const page = await conversationGateway.getMessagesFrom(personaId, messageId)
      if (get().activePersonaId !== personaId || conversationEpoch !== epoch || page.messages.length === 0) return false
      set({
        messages: page.messages,
        hasMore: page.hasMore,
        userMsgCount: page.userMessageCount,
      })
      return true
    } catch (error) {
      console.error('Failed to reveal message:', error)
      if (get().activePersonaId === personaId && conversationEpoch === epoch) set({ error: '无法定位该历史消息' })
      return false
    } finally {
      if (get().activePersonaId === personaId && conversationEpoch === epoch) set({ isLoadingConversation: false })
    }
  },

  cancelRequest: async () => {
    const state = get()
    const epoch = conversationEpoch
    await cancelCurrent(state)
    if (isCurrentConversation(state.activePersonaId, epoch) && hasSameRequest(get(), state)) {
      set({ ...resetCancelState(), expression: 'neutral', isSpeaking: false })
    }
  },

  sendMessage: async (content, persona, aiSettings, ttsSettings) => {
    const state = get()
    if (state.activePersonaId !== persona.id || state.isLoadingConversation || state.isTyping) return false
    const epoch = conversationEpoch
    const controller = new AbortController()
    const reqId = crypto.randomUUID()
    // Reserve this turn before yielding so simultaneous sends and cancellation see it.
    set({
      abortController: controller,
      requestId: reqId,
      isTyping: true,
      expression: 'thinking',
      error: null,
      streamingContent: '',
      streamingThinking: '',
    })

    await cancelCurrent(state)
    if (
      controller.signal.aborted ||
      !isCurrentConversation(persona.id, epoch) ||
      !isCurrentTurn(persona.id, reqId) ||
      get().isLoadingConversation
    ) {
      if (isCurrentTurn(persona.id, reqId)) set({ ...resetCancelState(), expression: 'neutral' })
      return false
    }
    const conversation = get()

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }

    set({
      messages: [...conversation.messages, userMsg],
      userMsgCount: conversation.userMsgCount + 1,
    })

    try {
      await conversationGateway.saveMessage(persona.id, userMsg)
    } catch (e) {
      console.error('Failed to save user message:', e)
      if (isCurrentTurn(persona.id, reqId)) {
        set((current) => ({
          messages: current.messages.filter((message) => message.id !== userMsg.id),
          userMsgCount: Math.max(0, current.userMsgCount - 1),
          ...resetCancelState(),
          expression: 'neutral',
          error: '消息保存失败，请重试',
        }))
      }
      return false
    }

    if (controller.signal.aborted || !isCurrentTurn(persona.id, reqId)) return true

    try {
      const completed = await completeConversationTurn({
        messages: [...conversation.messages, userMsg],
        query: content,
        persona,
        aiSettings,
        ttsSettings,
        requestId: reqId,
        controller,
      })
      if (completed) {
        void evaluateRelationshipProgress(persona, aiSettings)
        void extractConversationMemories(persona, aiSettings)
      }
    } catch (error: unknown) {
      if (controller.signal.aborted || !isCurrentTurn(persona.id, reqId)) return true
      set({
        ...resetCancelState(),
        error: error instanceof Error ? error.message : '发送失败，请检查网络和API设置',
      })
    }
    return true
  },

  deleteFrom: async (fromMessageId: string) => {
    stopSpeaking()
    const state = get()
    const epoch = ++conversationEpoch
    set({ isLoadingConversation: true, isLoadingMore: false })
    await cancelCurrent(state)
    if (isCurrentConversation(state.activePersonaId, epoch) && hasSameRequest(get(), state)) {
      set({ ...resetCancelState(), expression: 'neutral', isSpeaking: false })
    }
    try {
      const userMsgCount = await conversationGateway.deleteMessagesFrom(state.activePersonaId, fromMessageId)
      set((current) => {
        if (!isCurrentConversation(state.activePersonaId, epoch) || current.requestId !== null) return current
        const targetIndex = current.messages.findIndex((message) => message.id === fromMessageId)
        return {
          messages: targetIndex >= 0 ? current.messages.slice(0, targetIndex) : current.messages,
          userMsgCount,
          isLoadingMore: false,
          ...resetCancelState(),
          expression: 'neutral',
          error: null,
        }
      })
      return true
    } catch (e) {
      console.error('Failed to delete messages:', e)
      if (isCurrentConversation(state.activePersonaId, epoch) && get().requestId === null) {
        set({ error: '删除失败，聊天记录未被修改' })
      }
      return false
    } finally {
      if (isCurrentConversation(state.activePersonaId, epoch)) set({ isLoadingConversation: false })
    }
  },

  regenerate: async (persona, aiSettings, ttsSettings, aiMessageId) => {
    const state = get()
    if (state.activePersonaId !== persona.id || state.isLoadingConversation || state.isTyping) return
    const turn = findRegenerationTurn(state.messages, aiMessageId)
    if (!turn) return

    const triggerUserMsg = turn.userMessage
    const assistantIndex = state.messages.findIndex((message) => message.id === turn.assistantMessage.id)
    if (assistantIndex < 0) return

    const controller = new AbortController()
    const reqId = crypto.randomUUID()
    set({
      isTyping: true,
      expression: 'thinking',
      error: null,
      streamingContent: '',
      streamingThinking: '',
      abortController: controller,
      requestId: reqId,
    })

    try {
      const result = await runConversationTurn({
        messages: state.messages.slice(0, assistantIndex),
        query: triggerUserMsg.content,
        persona,
        aiSettings,
        ttsSettings,
        requestId: reqId,
        signal: controller.signal,
        persistMessage: false,
        userProfile: useSettingsStore.getState().userProfile,
        isCurrent: () => isCurrentTurn(persona.id, reqId),
        onChunk: (streamingContent, streamingThinking) => set({ streamingContent, streamingThinking }),
        onSpeakingChange: (isSpeaking) => set({ isSpeaking }),
      })
      if (!result || !isCurrentTurn(persona.id, reqId)) return
      const previous = turn.assistantMessage.alternatives?.length
        ? turn.assistantMessage.alternatives
        : [
            {
              content: turn.assistantMessage.content,
              thinking: turn.assistantMessage.thinking,
              memoryReferences: turn.assistantMessage.memoryReferences,
            },
          ]
      const alternatives = [
        ...previous,
        {
          content: result.message.content,
          thinking: result.message.thinking,
          memoryReferences: result.message.memoryReferences,
        },
      ]
      const updated: Message = {
        ...turn.assistantMessage,
        content: result.message.content,
        thinking: result.message.thinking,
        memoryReferences: result.message.memoryReferences,
        alternatives,
        activeAlternative: alternatives.length - 1,
      }
      await conversationGateway.saveMessage(persona.id, updated)
      set((current) =>
        current.requestId === reqId && current.activePersonaId === persona.id
          ? {
              messages: current.messages.map((message) => (message.id === updated.id ? updated : message)),
              ...resetCancelState(),
              expression: detectExpression(updated.content),
            }
          : current,
      )
    } catch (error: unknown) {
      if (controller.signal.aborted || !isCurrentTurn(persona.id, reqId)) return
      set({
        ...resetCancelState(),
        error: error instanceof Error ? error.message : '重新生成失败',
      })
    }
  },

  switchAlternative: async (messageId, direction) => {
    const state = get()
    const message = state.messages.find((item) => item.id === messageId)
    if (!message?.alternatives || message.alternatives.length < 2) return
    const current = Math.min(message.activeAlternative ?? 0, message.alternatives.length - 1)
    const next = (current + direction + message.alternatives.length) % message.alternatives.length
    const alternative = message.alternatives[next]
    const updated: Message = {
      ...message,
      content: alternative.content,
      thinking: alternative.thinking,
      memoryReferences: alternative.memoryReferences,
      activeAlternative: next,
    }
    set({ messages: state.messages.map((item) => (item.id === messageId ? updated : item)) })
    try {
      await conversationGateway.saveMessage(state.activePersonaId, updated)
    } catch (error) {
      console.error('Failed to switch reply alternative:', error)
      set({ error: '回复版本保存失败' })
    }
  },

  clearChat: async () => {
    stopSpeaking()
    const state = get()
    const epoch = ++conversationEpoch
    set({ isLoadingConversation: true, isLoadingMore: false })
    await cancelCurrent(state)
    if (isCurrentConversation(state.activePersonaId, epoch) && hasSameRequest(get(), state)) {
      set({ ...resetCancelState(), expression: 'neutral', isSpeaking: false })
    }
    try {
      await conversationGateway.clearMessages(state.activePersonaId)
      if (isCurrentConversation(state.activePersonaId, epoch) && get().requestId === null) {
        set({
          messages: [],
          userMsgCount: 0,
          isLoadingMore: false,
          expression: 'neutral',
          error: null,
          ...resetCancelState(),
        })
      }
      return true
    } catch (e) {
      console.error('Failed to clear messages:', e)
      if (isCurrentConversation(state.activePersonaId, epoch) && get().requestId === null) {
        set({ error: '清空失败，聊天记录未被修改' })
      }
      return false
    } finally {
      if (isCurrentConversation(state.activePersonaId, epoch)) set({ isLoadingConversation: false })
    }
  },
}))

interface CompleteConversationTurnOptions {
  messages: Message[]
  query: string
  persona: Persona
  aiSettings: AISettings
  ttsSettings: TTSSettings
  requestId: string
  controller: AbortController
}

async function completeConversationTurn(options: CompleteConversationTurnOptions): Promise<boolean> {
  const result = await runConversationTurn({
    ...options,
    userProfile: useSettingsStore.getState().userProfile,
    signal: options.controller.signal,
    isCurrent: () => isCurrentTurn(options.persona.id, options.requestId),
    onChunk: (streamingContent, streamingThinking) => useChatStore.setState({ streamingContent, streamingThinking }),
    onSpeakingChange: (isSpeaking) => useChatStore.setState({ isSpeaking }),
  })
  if (!result || !isCurrentTurn(options.persona.id, options.requestId)) return false

  const fullContent = result.message.content
  useChatStore.setState((state) =>
    state.activePersonaId === options.persona.id && state.requestId === options.requestId
      ? {
          messages: [...state.messages, result.message],
          isTyping: false,
          streamingContent: '',
          streamingThinking: '',
          expression: detectExpression(fullContent),
          abortController: null,
          requestId: null,
          error: result.persistenceError,
        }
      : state,
  )

  const capturedContent = fullContent
  setTimeout(() => {
    const currentState = useChatStore.getState()
    if (
      currentState.activePersonaId === options.persona.id &&
      currentState.expression !== 'neutral' &&
      currentState.expression === detectExpression(capturedContent)
    ) {
      useChatStore.setState({ expression: 'neutral' })
    }
  }, 5000)
  return true
}

async function extractConversationMemories(persona: Persona, aiSettings: AISettings) {
  if (aiSettings.memoryEnabled === false) return
  const state = useChatStore.getState()
  if (state.activePersonaId !== persona.id) return
  const interval = Math.max(1, aiSettings.memoryExtractionInterval || 6)
  if (state.userMsgCount % interval !== 0) return
  const epoch = conversationEpoch

  try {
    await memoryService.extract(persona.id, aiSettings, state.messages, () => {
      const settings = useSettingsStore.getState()
      return (
        isCurrentConversation(persona.id, epoch) &&
        settings.aiSettings.memoryEnabled !== false &&
        settings.personas.some((candidate) => candidate.id === persona.id)
      )
    })
  } catch (error) {
    console.warn('Failed to extract conversation memories:', error)
  }
}

export async function evaluateRelationshipProgress(persona: Persona, aiSettings: AISettings) {
  if (!aiSettings.autoProgress) return

  const state = useChatStore.getState()
  if (state.activePersonaId !== persona.id) return
  const epoch = conversationEpoch
  const sourceMessageId = state.messages[state.messages.length - 1]?.id
  if (!sourceMessageId) return
  const interval = Math.max(1, aiSettings.evalInterval || 20)
  if (state.userMsgCount % interval !== 0) return

  const msgs = state.messages.slice(-60)
  const evalMsgs: Array<Pick<Message, 'role' | 'content'>> = []
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    if (i < msgs.length - 1) {
      evalMsgs.push({ role: m.role, content: m.content.slice(0, 120) })
    }
  }

  try {
    const result = await conversationGateway.evaluateRelationship(aiSettings, evalMsgs)

    const detected = result.stage.trim()
    if (!isCurrentConversation(persona.id, epoch)) return
    const settingsState = useSettingsStore.getState()
    const currentPersona = settingsState.personas.find((candidate) => candidate.id === persona.id)
    if (!currentPersona) return
    const currentIdx = STAGE_ORDER.indexOf(currentPersona.relationshipStage)
    const detectedIdx = STAGE_ORDER.findIndex((stage) => stage === detected)
    if (detectedIdx < 0) return

    if (detectedIdx > currentIdx) {
      const newStage = STAGE_ORDER[detectedIdx] as Persona['relationshipStage']

      const levelNames: Record<string, string> = {
        朋友: '💛 你们成为朋友了',
        暧昧: '💗 关系升温，开始暧昧了',
        热恋: '❤️ 热恋中！',
        老夫老妻: '🏡 老夫老妻般的默契',
      }

      const appearance = getStageAppearance(currentPersona, newStage)
      const milestone = currentPersona.stageAppearance?.[newStage]
        ? `${appearance.icon} 关系升级：${appearance.label}`
        : levelNames[newStage] || `💕 关系升级：${newStage}`
      const greeting = result.reason ? `${milestone}\n\n${result.reason}` : milestone
      const notifyMsg = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: greeting,
        timestamp: Date.now(),
      }
      if (!isCurrentConversation(persona.id, epoch)) return
      const saved = await conversationGateway.saveMessageIfSourceExists(persona.id, sourceMessageId, notifyMsg)
      if (!saved) return
      if (!isCurrentConversation(persona.id, epoch)) return
      const latestSettings = useSettingsStore.getState()
      const latestPersona = latestSettings.personas.find((candidate) => candidate.id === persona.id)
      if (!latestPersona || STAGE_ORDER.indexOf(latestPersona.relationshipStage) >= detectedIdx) return
      if (!latestSettings.advancePersonaRelationship(persona.id, newStage)) return
      useChatStore.setState((state) =>
        isCurrentConversation(persona.id, epoch) ? { messages: [...state.messages, notifyMsg] } : state,
      )

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('灵伴', { body: greeting, silent: false })
      }
    }
  } catch {
    // evaluation failed silently
  }
}
