import { create } from 'zustand'
import { Message, Persona, Expression, AISettings, TTSSettings, AiChunk } from '../types'
import { Channel, invoke } from '@tauri-apps/api/core'
import { speak, stopSpeaking } from '../services/ttsService'

interface ChatStore {
  messages: Message[]
  persona: Persona
  isTyping: boolean
  expression: Expression
  isSpeaking: boolean
  error: string | null
  streamingContent: string
  streamingThinking: string

  setPersona: (persona: Persona) => void
  setExpression: (expr: Expression) => void
  sendMessage: (content: string, aiSettings: AISettings, ttsSettings: TTSSettings) => Promise<void>
  loadMessages: () => Promise<void>
  clearChat: () => Promise<void>
  clearError: () => void
}

const defaultPersona: Persona = {
  name: '灵伴',
  age: 20,
  personality: '温柔体贴',
  hobby: '看电影、听音乐',
  speakingStyle: '可爱活泼，喜欢用语气词，会称呼你为"哥哥"',
  relationshipStage: '刚认识',
  emoji: '🌸',
  hairColor: '#ff9fbf',
  eyeColor: '#ff6b9d'
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  persona: defaultPersona,
  isTyping: false,
  expression: 'neutral',
  isSpeaking: false,
  error: null,
  streamingContent: '',
  streamingThinking: '',

  setPersona: (persona) => set({ persona }),
  setExpression: (expression) => set({ expression }),
  clearError: () => set({ error: null }),

  loadMessages: async () => {
    try {
      const msgs = await invoke<Message[]>('get_messages')
      set({ messages: msgs })
    } catch {
      set({ error: '加载历史消息失败' })
    }
  },

  sendMessage: async (content, aiSettings, ttsSettings) => {
    const state = get()
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
    })

    invoke('save_message', { message: userMsg }).catch(() => {})

    try {
      const systemPrompt = buildSystemPrompt(state.persona)
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...state.messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content }
      ]

      const onChunk = new Channel<AiChunk>()
      let fullContent = ''
      let fullThinking = ''

      onChunk.onmessage = (chunk) => {
        fullContent += chunk.content
        fullThinking += chunk.thinking
        set({ streamingContent: fullContent, streamingThinking: fullThinking })

        if (chunk.done) {
          const aiMsg: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: fullContent || '...',
            thinking: fullThinking || undefined,
            timestamp: Date.now()
          }

          set(s => ({
            messages: [...s.messages, aiMsg],
            isTyping: false,
            streamingContent: '',
            streamingThinking: '',
            expression: detectExpression(fullContent),
          }))

          invoke('save_message', { message: aiMsg }).catch(() => {})

          if (ttsSettings.autoPlay && ttsSettings.enabled) {
            set({ isSpeaking: true })
            speak(fullContent, ttsSettings).finally(() => set({ isSpeaking: false }))
          }

          setTimeout(() => {
            const current = get().expression
            if (current !== 'neutral' && current === detectExpression(fullContent)) {
              set({ expression: 'neutral' })
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
        onChunk,
      })
    } catch (error: unknown) {
      set({
        isTyping: false,
        streamingContent: '',
        streamingThinking: '',
        error: error instanceof Error ? error.message : '发送失败，请检查网络和API设置',
      })
    }
  },

  clearChat: async () => {
    stopSpeaking()
    invoke('clear_messages').catch(() => {})
    set({ messages: [], expression: 'neutral', error: null })
  },
}))

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
  const lower = text.toLowerCase()
  if (/哈哈|开心|太好|喜欢|爱你|爱|幸福|棒/.test(lower)) return 'happy'
  if (/害羞|不好意思|讨厌啦|别说了/.test(lower)) return 'shy'
  if (/❤|💕|💗|亲亲|抱抱|想你|吻/.test(lower)) return 'loving'
  if (/真的|什么|不会吧|天哪|居然|哇/.test(lower)) return 'surprised'
  if (/嗯|我想想|这个|好像|可能/.test(lower)) return 'thinking'
  return 'neutral'
}
