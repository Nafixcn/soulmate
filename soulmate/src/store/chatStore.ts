import { create } from 'zustand'
import { Message, Expression, AISettings, TTSSettings, AiChunk, Persona } from '../types'
import { Channel, invoke } from '@tauri-apps/api/core'
import { speak, stopSpeaking } from '../services/ttsService'
import { prepareConversation } from '../services/conversationService'
import { useSettingsStore } from './settingsStore'
import { detectExpression, findRegenerationTurn, type ApiMessage } from '../domain/conversation'

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 1500
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
  clearChat: () => Promise<void>
  clearError: () => void
  deleteFrom: (fromMessageId: string) => Promise<void>
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
      await invoke('cancel_request', { requestId: state.requestId })
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
      const msgs = await invoke<Message[]>('get_messages', { personaId, limit: PAGE_SIZE })
      if (get().activePersonaId !== personaId) return
      set({
        messages: msgs,
        hasMore: msgs.length >= PAGE_SIZE,
        userMsgCount: msgs.filter((message) => message.role === 'user').length,
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
      const firstTs = messages[0].timestamp
      const older = await invoke<Message[]>('get_messages', {
        personaId: activePersonaId,
        limit: PAGE_SIZE,
        before: firstTs,
      })
      if (get().activePersonaId !== activePersonaId) return
      if (older.length > 0) {
        set({ messages: [...older, ...messages], hasMore: older.length >= PAGE_SIZE })
      } else {
        set({ hasMore: false })
      }
    } catch (e) {
      console.error('Failed to load earlier messages:', e)
    } finally {
      set({ isLoadingMore: false })
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
      await invoke('save_message', { personaId: persona.id, message: userMsg })
    } catch (e) {
      console.error('Failed to save user message:', e)
      set({ error: '消息保存失败，重启后可能丢失' })
    }

    const allMessages = [...state.messages, userMsg]
    const apiMessages = await prepareConversation({
      messages: allMessages,
      persona,
      query: content,
      useKnowledgeRetrieval: aiSettings.useWebSearch,
    })

    let lastError: string | null = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (controller.signal.aborted) return
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt))
      }
      try {
        await doStream(apiMessages, aiSettings, reqId, controller, ttsSettings, persona.id)
        maybeEvaluateRelation(persona, aiSettings)
        return
      } catch (error: unknown) {
        if (controller.signal.aborted) return
        lastError = error instanceof Error ? error.message : '发送失败'
        if (attempt < MAX_RETRIES) continue
      }
    }

    set({
      ...resetCancelState(),
      error: lastError || '发送失败，请检查网络和API设置',
    })
  },

  deleteFrom: async (fromMessageId: string) => {
    stopSpeaking()
    const state = get()
    await cancelCurrent(state)
    try {
      await invoke('delete_messages_from', { personaId: state.activePersonaId, fromMessageId })
    } catch (e) {
      console.error('Failed to delete messages:', e)
    }
    set((s) => {
      if (s.activePersonaId !== state.activePersonaId) return {}
      const targetIndex = s.messages.findIndex((message) => message.id === fromMessageId)
      return {
        messages: targetIndex >= 0 ? s.messages.slice(0, targetIndex) : s.messages,
        ...resetCancelState(),
        expression: 'neutral',
        error: null,
      }
    })
  },

  regenerate: async (persona, aiSettings, ttsSettings, aiMessageId) => {
    const state = get()
    const turn = findRegenerationTurn(state.messages, aiMessageId)
    if (!turn) return

    const triggerUserMsg = turn.userMessage
    await state.deleteFrom(turn.assistantMessage.id)
    if (get().activePersonaId !== persona.id) return

    const remaining = get().messages
    const apiMessages = await prepareConversation({
      messages: remaining,
      persona,
      query: triggerUserMsg.content,
      useKnowledgeRetrieval: aiSettings.useWebSearch,
    })

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
      await doStream(apiMessages, aiSettings, reqId, controller, ttsSettings, persona.id)
      maybeEvaluateRelation(persona, aiSettings)
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
      await invoke('clear_messages', { personaId: state.activePersonaId })
    } catch (e) {
      console.error('Failed to clear messages:', e)
    }
    if (get().activePersonaId === state.activePersonaId) {
      set({ messages: [], expression: 'neutral', error: null, ...resetCancelState() })
    }
  },
}))

async function doStream(
  apiMessages: ApiMessage[],
  aiSettings: AISettings,
  reqId: string,
  controller: AbortController,
  ttsSettings: TTSSettings,
  personaId: string,
) {
  const onChunk = new Channel<AiChunk>()
  let fullContent = ''
  let fullThinking = ''

  onChunk.onmessage = (chunk) => {
    if (controller.signal.aborted || useChatStore.getState().activePersonaId !== personaId) return

    fullContent += chunk.content
    fullThinking += chunk.thinking
    useChatStore.setState({ streamingContent: fullContent, streamingThinking: fullThinking })

    if (chunk.done) {
      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullContent || '...',
        thinking: fullThinking || undefined,
        timestamp: Date.now(),
      }

      useChatStore.setState((s) =>
        s.activePersonaId === personaId
          ? {
              messages: [...s.messages, aiMsg],
              isTyping: false,
              streamingContent: '',
              streamingThinking: '',
              expression: detectExpression(fullContent),
              abortController: null,
              requestId: null,
            }
          : s,
      )

      invoke('save_message', { personaId, message: aiMsg }).catch((e) => {
        console.error('Failed to save AI message:', e)
      })

      if (ttsSettings.autoPlay && ttsSettings.enabled) {
        useChatStore.setState({ isSpeaking: true })
        speak(fullContent, ttsSettings).finally(() => useChatStore.setState({ isSpeaking: false }))
      }

      const capturedContent = fullContent
      setTimeout(() => {
        const currentState = useChatStore.getState()
        if (
          currentState.activePersonaId === personaId &&
          currentState.expression !== 'neutral' &&
          currentState.expression === detectExpression(capturedContent)
        ) {
          useChatStore.setState({ expression: 'neutral' })
        }
      }, 5000)
    }
  }

  await invoke('send_message', {
    messagesJson: JSON.stringify(apiMessages),
    apiKey: aiSettings.apiKey,
    endpoint: aiSettings.endpoint,
    model: aiSettings.model,
    temperature: aiSettings.temperature,
    maxTokens: aiSettings.maxTokens,
    requestId: reqId,
    onChunk,
  })
}

const STAGE_ORDER = ['刚认识', '朋友', '暧昧', '热恋', '老夫老妻']

async function maybeEvaluateRelation(persona: Persona, aiSettings: AISettings) {
  if (!aiSettings.autoProgress || !aiSettings.apiKey) return

  const state = useChatStore.getState()
  if (state.activePersonaId !== persona.id) return
  const interval = Math.max(1, aiSettings.evalInterval || 20)
  if (state.userMsgCount % interval !== 0) return

  const msgs = state.messages.slice(-60)
  const evalMsgs: { role: string; content: string }[] = []
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    if (i < msgs.length - 1) {
      evalMsgs.push({ role: m.role, content: m.content.slice(0, 120) })
    }
  }

  try {
    const result: string = await invoke('evaluate_relationship', {
      apiKey: aiSettings.apiKey,
      endpoint: aiSettings.endpoint,
      model: aiSettings.model,
      messagesJson: JSON.stringify(evalMsgs),
    })

    const detected = result.trim()
    if (useChatStore.getState().activePersonaId !== persona.id) return
    const currentIdx = STAGE_ORDER.indexOf(persona.relationshipStage)
    const detectedIdx = STAGE_ORDER.indexOf(detected)
    if (detectedIdx < 0) return

    if (detectedIdx > currentIdx) {
      const newStage = STAGE_ORDER[detectedIdx] as Persona['relationshipStage']
      const updatedPersona = { ...persona, relationshipStage: newStage }
      useSettingsStore.getState().setPersona(updatedPersona)

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
      useChatStore.setState((s) => ({ messages: [...s.messages, notifyMsg] }))
      invoke('save_message', { personaId: persona.id, message: notifyMsg }).catch(() => {})

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('灵伴', { body: greeting, silent: false })
      }
    }
  } catch {
    // evaluation failed silently
  }
}
