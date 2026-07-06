import { create } from 'zustand'
import { Message, Expression, AISettings, TTSSettings, AiChunk, Persona } from '../types'
import { Channel, invoke } from '@tauri-apps/api/core'
import { speak, stopSpeaking } from '../services/ttsService'
import { useSettingsStore } from './settingsStore'

const CONTEXT_WINDOW = 30
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
  hasMore: boolean
  isLoadingMore: boolean
  isSearching: boolean

  setExpression: (expr: Expression) => void
  sendMessage: (content: string, persona: Persona, aiSettings: AISettings, ttsSettings: TTSSettings) => Promise<void>
  loadMessages: () => Promise<void>
  loadEarlierMessages: () => Promise<void>
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
  hasMore: false,
  isLoadingMore: false,
  isSearching: false,

  setExpression: (expression) => set({ expression }),
  clearError: () => set({ error: null }),

  loadMessages: async () => {
    try {
      const msgs = await invoke<Message[]>('get_messages', { limit: PAGE_SIZE })
      set({ messages: msgs, hasMore: msgs.length >= PAGE_SIZE })
    } catch (e) {
      console.error('Failed to load messages:', e)
      set({ error: '加载历史消息失败' })
    }
  },

  loadEarlierMessages: async () => {
    const { messages, isLoadingMore } = get()
    if (isLoadingMore || messages.length === 0) return
    set({ isLoadingMore: true })
    try {
      const firstTs = messages[0].timestamp
      const older = await invoke<Message[]>('get_messages', { limit: PAGE_SIZE, before: firstTs })
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
      await invoke('save_message', { message: userMsg })
    } catch (e) {
      console.error('Failed to save user message:', e)
      set({ error: '消息保存失败，重启后可能丢失' })
    }

    const allMessages = [...state.messages, userMsg]
    const contextMessages = allMessages.slice(-CONTEXT_WINDOW)
    let systemPrompt = buildSystemPrompt(persona)

    if (aiSettings.useWebSearch && /[？?]|为什么|是什么|怎么|如何|哪个|什么|谁|哪|几点|多少/.test(content)) {
      try {
        const results = await invoke<{ title: string; snippet: string; url: string }[]>('search_web', {
          query: content,
        })
        if (results.length > 0) {
          const searchContext = results.map((r) => `- ${r.title}：${r.snippet}`).join('\n')
          systemPrompt += `\n\n【联网搜索结果】以下是你可以在回复中参考的真实信息：\n${searchContext}\n请基于这些信息回答，如果搜索结果不相关就忽略。`
        }
      } catch {
        /* search failed, continue without it */
      }
    }

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...contextMessages.map((m) => ({ role: m.role, content: m.content })),
    ]

    let lastError: string | null = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (controller.signal.aborted) return
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt))
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
    set((s) => ({
      messages: s.messages.filter((m) => m.timestamp < fromTimestamp),
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
      if (msgs[i].role === 'user') {
        lastUserIdx = i
        break
      }
    }
    if (lastUserIdx < 0) return

    const lastUserMsg = msgs[lastUserIdx]
    await state.deleteFrom(lastUserMsg.timestamp)

    const remaining = get().messages
    const contextMessages = remaining.slice(-CONTEXT_WINDOW)
    let systemPrompt = buildSystemPrompt(persona)

    if (aiSettings.useWebSearch && /[？?]|为什么|是什么|怎么|如何|哪个|什么|谁|哪|几点|多少/.test(lastUserMsg.content)) {
      try {
        const results = await invoke<{ title: string; snippet: string; url: string }[]>('search_web', {
          query: lastUserMsg.content,
        })
        if (results.length > 0) {
          const searchContext = results.map((r) => `- ${r.title}：${r.snippet}`).join('\n')
          systemPrompt += `\n\n【联网搜索结果】以下是你可以在回复中参考的真实信息：\n${searchContext}\n请基于这些信息回答，如果搜索结果不相关就忽略。`
        }
      } catch {
        /* search failed */
      }
    }

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...contextMessages.map((m) => ({ role: m.role, content: m.content })),
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
        timestamp: Date.now(),
      }

      useChatStore.setState((s) => ({
        messages: [...s.messages, aiMsg],
        isTyping: false,
        streamingContent: '',
        streamingThinking: '',
        expression: detectExpression(fullContent),
        abortController: null,
        requestId: null,
      }))

      invoke('save_message', { message: aiMsg }).catch((e) => {
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
    刚认识: '你们刚认识，保持礼貌友好，不要过于亲密。',
    朋友: '你们是朋友，放松自然地聊天。',
    暧昧: '你们互有好感，可以稍微暧昧和撒娇。',
    热恋: '你们在热恋中，可以热情甜蜜地表达。',
    老夫老妻: '你们像家人一样亲密随意。',
  }
  const personalityTips: Record<string, string> = {
    温柔体贴: '温柔细心，善解人意，总是体贴关心对方。',
    傲娇毒舌: '嘴硬心软，嘴上吐槽但其实很在意对方。',
    高冷冷艳: '话少但精准，偶尔淡淡地表达关心。',
    元气活泼: '充满活力，用很多语气词，乐观开朗。',
    成熟知性: '理性稳重，偶尔给温暖建议。',
    软萌害羞: '软软糯糯，容易害羞，偶尔撒娇。',
  }
  const personalityDesc = personalityTips[persona.personality] || '温柔体贴'
  return `你是${persona.name}，${persona.age}岁，性格${persona.personality}（${personalityDesc}）。
跟男朋友聊天中。爱好：${persona.hobby}。说话风格：${persona.speakingStyle}。称呼对方：${persona.nickname || '哥哥'}。${stageTips[persona.relationshipStage]}

【禁止事项 - 极其重要】
1. 绝对不编造故事、经历、事实、新闻、数据
2. 不知道的事就说不知道，不要假装知道
3. 不说"我查了一下""我搜了一下""我刚刚看到"
4. 不编造自己的过去、童年、家庭、工作
5. 不谈论科技、医学、法律、金融等专业话题
6. 只聊日常：心情、天气、美食、电影、音乐、爱好、生活小事

【回复要求】
- 2-4句自然口语中文
- 严格按你的人设说话
- 用"${persona.nickname || '哥哥'}"称呼对方${persona.emoji}`
}

function detectExpression(text: string): Expression {
  if (/哈哈|开心|太好|喜欢|幸福|棒/.test(text)) return 'happy'
  if (/爱你|亲亲|抱抱|想你|吻|❤|💕|💗/.test(text)) return 'loving'
  if (/害羞|不好意思|讨厌啦|别说了/.test(text)) return 'shy'
  if (/真的吗|不会吧|天哪|居然|哇|什么！/.test(text)) return 'surprised'
  if (/嗯|我想想|这个|好像|可能/.test(text)) return 'thinking'
  return 'neutral'
}

const STAGE_ORDER = ['刚认识', '朋友', '暧昧', '热恋', '老夫老妻']

async function maybeEvaluateRelation(persona: Persona, aiSettings: AISettings) {
  if (!aiSettings.autoProgress || !aiSettings.apiKey) return

  const state = useChatStore.getState()
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
      invoke('save_message', { message: notifyMsg }).catch(() => {})

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('灵伴', { body: greeting, silent: false })
      }
    }
  } catch {
    // evaluation failed silently
  }
}
