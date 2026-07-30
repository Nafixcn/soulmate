import { create } from 'zustand'
import { Message, Expression, AISettings, TTSSettings, Persona } from '../types'
import { stopSpeaking } from '../services/ttsService'
import { useSettingsStore } from './settingsStore'
import { detectExpression, findRegenerationTurn } from '../domain/conversation'
import { conversationGateway } from '../services/conversationGateway'
import { runConversationTurn } from '../services/conversationTurn'

const PAGE_SIZE = 100

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
  sendMessage: (content: string, persona: Persona, aiSettings: AISettings, ttsSettings: TTSSettings) => Promise<void>
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
    await cancelCurrent(state)
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
      if (get().activePersonaId !== personaId) return
      set({
        messages: page.messages,
        hasMore: page.hasMore,
        userMsgCount: page.userMessageCount,
      })
    } catch (e) {
      console.error('Failed to load messages:', e)
      if (get().activePersonaId === personaId) set({ error: '加载历史消息失败' })
    } finally {
      if (get().activePersonaId === personaId) set({ isLoadingConversation: false })
    }
  },

  loadEarlierMessages: async () => {
    const { messages, isLoadingMore, activePersonaId } = get()
    if (isLoadingMore || messages.length === 0) return
    set({ isLoadingMore: true })
    try {
      const page = await conversationGateway.getMessages(activePersonaId, PAGE_SIZE, messages[0].id)
      if (get().activePersonaId !== activePersonaId) return
      if (page.messages.length > 0) {
        set({ messages: [...page.messages, ...messages], hasMore: page.hasMore, userMsgCount: page.userMessageCount })
      } else {
        set({ hasMore: false })
      }
    } catch (e) {
      console.error('Failed to load earlier messages:', e)
    } finally {
      set({ isLoadingMore: false })
    }
  },

  revealMessage: async (messageId) => {
    const personaId = get().activePersonaId
    if (get().messages.some((message) => message.id === messageId)) return true
    set({ isLoadingConversation: true })
    try {
      const page = await conversationGateway.getMessagesFrom(personaId, messageId)
      if (get().activePersonaId !== personaId || page.messages.length === 0) return false
      set({
        messages: page.messages,
        hasMore: page.hasMore,
        userMsgCount: page.userMessageCount,
      })
      return true
    } catch (error) {
      console.error('Failed to reveal message:', error)
      set({ error: '无法定位该历史消息' })
      return false
    } finally {
      if (get().activePersonaId === personaId) set({ isLoadingConversation: false })
    }
  },

  cancelRequest: async () => {
    const state = get()
    await cancelCurrent(state)
    set(resetCancelState())
  },

  sendMessage: async (content, persona, aiSettings, ttsSettings) => {
    const state = get()
    if (state.activePersonaId !== persona.id || state.isLoadingConversation) return

    await cancelCurrent(state)

    const controller = new AbortController()
    const reqId = crypto.randomUUID()
    set({ abortController: controller, requestId: reqId })

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }

    set({
      messages: [...state.messages, userMsg],
      isTyping: true,
      expression: 'thinking',
      error: null,
      streamingContent: '',
      streamingThinking: '',
      userMsgCount: state.userMsgCount + 1,
    })

    try {
      await conversationGateway.saveMessage(persona.id, userMsg)
    } catch (e) {
      console.error('Failed to save user message:', e)
      set({ error: '消息保存失败，重启后可能丢失' })
    }

    try {
      const completed = await completeConversationTurn({
        messages: [...state.messages, userMsg],
        query: content,
        persona,
        aiSettings,
        ttsSettings,
        requestId: reqId,
        controller,
      })
      if (completed) void evaluateRelationshipProgress(persona, aiSettings)
    } catch (error: unknown) {
      if (controller.signal.aborted) return
      set({
        ...resetCancelState(),
        error: error instanceof Error ? error.message : '发送失败，请检查网络和API设置',
      })
    }
  },

  deleteFrom: async (fromMessageId: string) => {
    stopSpeaking()
    const state = get()
    await cancelCurrent(state)
    try {
      const userMsgCount = await conversationGateway.deleteMessagesFrom(state.activePersonaId, fromMessageId)
      set((current) => {
        if (current.activePersonaId !== state.activePersonaId) return {}
        const targetIndex = current.messages.findIndex((message) => message.id === fromMessageId)
        return {
          messages: targetIndex >= 0 ? current.messages.slice(0, targetIndex) : current.messages,
          userMsgCount,
          ...resetCancelState(),
          expression: 'neutral',
          error: null,
        }
      })
      return true
    } catch (e) {
      console.error('Failed to delete messages:', e)
      set({ error: '删除失败，聊天记录未被修改' })
      return false
    }
  },

  regenerate: async (persona, aiSettings, ttsSettings, aiMessageId) => {
    const state = get()
    const turn = findRegenerationTurn(state.messages, aiMessageId)
    if (!turn) return

    const triggerUserMsg = turn.userMessage
    if (!(await state.deleteFrom(turn.assistantMessage.id))) return
    if (get().activePersonaId !== persona.id) return

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
      const completed = await completeConversationTurn({
        messages: get().messages,
        query: triggerUserMsg.content,
        persona,
        aiSettings,
        ttsSettings,
        requestId: reqId,
        controller,
      })
      if (completed) void evaluateRelationshipProgress(persona, aiSettings)
    } catch (error: unknown) {
      if (controller.signal.aborted) return
      set({
        ...resetCancelState(),
        error: error instanceof Error ? error.message : '重新生成失败',
      })
    }
  },

  clearChat: async () => {
    stopSpeaking()
    const state = get()
    await cancelCurrent(state)
    try {
      await conversationGateway.clearMessages(state.activePersonaId)
      if (get().activePersonaId === state.activePersonaId) {
        set({ messages: [], userMsgCount: 0, expression: 'neutral', error: null, ...resetCancelState() })
      }
      return true
    } catch (e) {
      console.error('Failed to clear messages:', e)
      set({ error: '清空失败，聊天记录未被修改' })
      return false
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
    signal: options.controller.signal,
    isCurrent: () => useChatStore.getState().activePersonaId === options.persona.id,
    onChunk: (streamingContent, streamingThinking) => useChatStore.setState({ streamingContent, streamingThinking }),
    onSpeakingChange: (isSpeaking) => useChatStore.setState({ isSpeaking }),
  })
  if (!result) return false

  const fullContent = result.message.content
  useChatStore.setState((state) =>
    state.activePersonaId === options.persona.id
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

const STAGE_ORDER = ['刚认识', '朋友', '暧昧', '热恋', '老夫老妻']

export async function evaluateRelationshipProgress(persona: Persona, aiSettings: AISettings) {
  if (!aiSettings.autoProgress) return

  const state = useChatStore.getState()
  if (state.activePersonaId !== persona.id) return
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

    const detected = result.trim()
    if (useChatStore.getState().activePersonaId !== persona.id) return
    const settingsState = useSettingsStore.getState()
    const currentPersona = settingsState.personas.find((candidate) => candidate.id === persona.id)
    if (!currentPersona) return
    const currentIdx = STAGE_ORDER.indexOf(currentPersona.relationshipStage)
    const detectedIdx = STAGE_ORDER.indexOf(detected)
    if (detectedIdx < 0) return

    if (detectedIdx > currentIdx) {
      const newStage = STAGE_ORDER[detectedIdx] as Persona['relationshipStage']
      if (!settingsState.advancePersonaRelationship(persona.id, newStage)) return

      const levelNames: Record<string, string> = {
        朋友: '💛 你们成为朋友了',
        暧昧: '💗 关系升温，开始暧昧了',
        热恋: '❤️ 热恋中！',
        老夫老妻: '🏡 老夫老妻般的默契',
      }

      const greeting = levelNames[newStage] || `💕 关系升级：${newStage}`
      const notifyMsg = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: greeting,
        timestamp: Date.now(),
      }
      await conversationGateway.saveMessage(persona.id, notifyMsg)
      useChatStore.setState((state) =>
        state.activePersonaId === persona.id ? { messages: [...state.messages, notifyMsg] } : state,
      )

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('灵伴', { body: greeting, silent: false })
      }
    }
  } catch {
    // evaluation failed silently
  }
}
