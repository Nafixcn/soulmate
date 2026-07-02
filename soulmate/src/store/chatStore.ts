import { create } from 'zustand'
import { Message, Expression, AISettings, TTSSettings, AiChunk, Persona } from '../types'
import { Channel, invoke } from '@tauri-apps/api/core'
import { speak, stopSpeaking } from '../services/ttsService'
import { useSettingsStore } from './settingsStore'

const CONTEXT_WINDOW = 30
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 1500

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

  setExpression: (expr: Expression) => void
  sendMessage: (content: string, persona: Persona, aiSettings: AISettings, ttsSettings: TTSSettings) => Promise<void>
  loadMessages: () => Promise<void>
  clearChat: () => Promise<void>
  clearError: () => void
  deleteFrom: (fromTimestamp: number) => Promise<void>
  regenerate: (persona: Persona, aiSettings: AISettings, ttsSettings: TTSSettings) => Promise<void>
  cancelRequest: () => Promise<void>
}

async function cancelCurrent(state: ChatStore) {
  if (state.abortController) {
    state.abortController.abort()
  }
  if (state.requestId) {
    try { await invoke('cancel_request', { requestId: state.requestId }) } catch {}
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

  setExpression: (expression) => set({ expression }),
  clearError: () => set({ error: null }),

  loadMessages: async () => {
    try {
      const msgs = await invoke<Message[]>('get_messages')
      if (msgs.length > 0) {
        set({ messages: msgs })
      }
    } catch (e) {
      console.error('Failed to load messages:', e)
      set({ error: '加载历史消息失败' })
    }
  },

  cancelRequest: async () => {
    const state = get()
    await cancelCurrent(state)
    set(resetCancelState())
  },

  sendMessage: async (content, persona, aiSettings, ttsSettings) => {
    const state = get()

    await cancelCurrent(state)

    const controller = new AbortController()
    const reqId = crypto.randomUUID()
    set({ abortController: controller, requestId: reqId })

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
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
      await invoke('save_message', { message: userMsg })
    } catch (e) {
      console.error('Failed to save user message:', e)
      set({ error: '消息保存失败，重启后可能丢失' })
    }

    const allMessages = [...state.messages, userMsg]
    const contextMessages = allMessages.slice(-CONTEXT_WINDOW)
    const systemPrompt = buildSystemPrompt(persona)
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...contextMessages.map(m => ({ role: m.role, content: m.content }))
    ]

    let lastError: string | null = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (controller.signal.aborted) return
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt))
      }
      try {
        await doStream(apiMessages, aiSettings, reqId, controller, ttsSettings)
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

  deleteFrom: async (fromTimestamp: number) => {
    stopSpeaking()
    const state = get()
    await cancelCurrent(state)
    try {
      await invoke('delete_messages_from', { fromTimestamp })
    } catch (e) {
      console.error('Failed to delete messages:', e)
    }
    set(s => ({
      messages: s.messages.filter(m => m.timestamp < fromTimestamp),
      ...resetCancelState(),
      expression: 'neutral',
      error: null,
    }))
  },

  regenerate: async (persona, aiSettings, ttsSettings) => {
    const state = get()
    const msgs = state.messages
    let lastUserIdx = -1
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break }
    }
    if (lastUserIdx < 0) return

    const lastUserMsg = msgs[lastUserIdx]
    await state.deleteFrom(lastUserMsg.timestamp)

    const remaining = get().messages
    const contextMessages = remaining.slice(-CONTEXT_WINDOW)
    const systemPrompt = buildSystemPrompt(persona)
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...contextMessages.map(m => ({ role: m.role, content: m.content }))
    ]

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
      await doStream(apiMessages, aiSettings, reqId, controller, ttsSettings)
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
      await invoke('clear_messages')
    } catch (e) {
      console.error('Failed to clear messages:', e)
    }
    set({ messages: [], expression: 'neutral', error: null, ...resetCancelState() })
  },
}))

async function doStream(
  apiMessages: { role: string; content: string }[],
  aiSettings: AISettings,
  reqId: string,
  controller: AbortController,
  ttsSettings: TTSSettings,
) {
  const onChunk = new Channel<AiChunk>()
  let fullContent = ''
  let fullThinking = ''

  onChunk.onmessage = (chunk) => {
    if (controller.signal.aborted) return

    fullContent += chunk.content
    fullThinking += chunk.thinking
    useChatStore.setState({ streamingContent: fullContent, streamingThinking: fullThinking })

    if (chunk.done) {
      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullContent || '...',
        thinking: fullThinking || undefined,
        timestamp: Date.now()
      }

      useChatStore.setState(s => ({
        messages: [...s.messages, aiMsg],
        isTyping: false,
        streamingContent: '',
        streamingThinking: '',
        expression: detectExpression(fullContent),
        abortController: null,
        requestId: null,
      }))

      invoke('save_message', { message: aiMsg }).catch(e => {
        console.error('Failed to save AI message:', e)
      })

      if (ttsSettings.autoPlay && ttsSettings.enabled) {
        useChatStore.setState({ isSpeaking: true })
        speak(fullContent, ttsSettings).finally(() => useChatStore.setState({ isSpeaking: false }))
      }

      const capturedContent = fullContent
      setTimeout(() => {
        const current = useChatStore.getState().expression
        if (current !== 'neutral' && current === detectExpression(capturedContent)) {
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

function buildSystemPrompt(persona: Persona): string {
  const stageTips: Record<string, string> = {
    '刚认识': '你们刚认识不久，保持礼貌友好的语气，可以慢慢了解对方。',
    '朋友': '你们已经是朋友了，可以更放松自然地聊天，适当关心对方。',
    '暧昧': '你们互相有好感，可以带一点小暧昧和暗示，偶尔撒娇。',
    '热恋': '你们正在热恋中！可以主动表达爱意、撒娇、说情话，用亲昵称呼。',
    '老夫老妻': '你们已经在一起很久了，像家人一样亲密，说话可以很随意自然。'
  }
  return `你是一个名叫${persona.name}的AI女友，正在和你的男朋友聊天。
 【角色设定】
 - 名字：${persona.name} · 年龄：${persona.age}岁
 - 性格：${persona.personality} · 爱好：${persona.hobby}
 - 说话风格：${persona.speakingStyle} · 用${persona.emoji}代表自己
 【关系阶段】${stageTips[persona.relationshipStage]}
 【规则】保持角色扮演，口语化中文，1-3句话，根据关系阶段调整语气，称呼对方为"哥哥"，永远不提自己是AI。`
}

function detectExpression(text: string): Expression {
  if (/哈哈|开心|太好|喜欢|幸福|棒/.test(text)) return 'happy'
  if (/爱你|亲亲|抱抱|想你|吻|❤|💕|💗/.test(text)) return 'loving'
  if (/害羞|不好意思|讨厌啦|别说了/.test(text)) return 'shy'
  if (/真的吗|不会吧|天哪|居然|哇|什么！/.test(text)) return 'surprised'
  if (/嗯|我想想|这个|好像|可能/.test(text)) return 'thinking'
  return 'neutral'
}

const EVAL_INTERVAL = 20
const STAGE_ORDER = ['刚认识', '朋友', '暧昧', '热恋', '老夫老妻']

async function maybeEvaluateRelation(persona: Persona, aiSettings: AISettings) {
  if (!aiSettings.autoProgress || !aiSettings.apiKey) return

  const state = useChatStore.getState()
  if (state.userMsgCount % EVAL_INTERVAL !== 0) return

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
    const currentIdx = STAGE_ORDER.indexOf(persona.relationshipStage)
    const detectedIdx = STAGE_ORDER.indexOf(detected)
    if (detectedIdx < 0) return

    if (detectedIdx > currentIdx) {
      const newStage = STAGE_ORDER[detectedIdx] as Persona['relationshipStage']
      const updatedPersona = { ...persona, relationshipStage: newStage }
      useSettingsStore.getState().setPersona(updatedPersona)

      const levelNames: Record<string, string> = {
        '朋友': '💛 你们成为朋友了',
        '暧昧': '💗 关系升温，开始暧昧了',
        '热恋': '❤️ 热恋中！',
        '老夫老妻': '🏡 老夫老妻般的默契',
      }

      const greeting = levelNames[newStage] || `💕 关系升级：${newStage}`
      const notifyMsg = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: greeting,
        timestamp: Date.now()
      }
      useChatStore.setState(s => ({ messages: [...s.messages, notifyMsg] }))
      invoke('save_message', { message: notifyMsg }).catch(() => {})

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('灵伴', { body: greeting, silent: false })
      }
    }
  } catch {
    // evaluation failed silently
  }
}
