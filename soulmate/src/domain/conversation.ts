import type { Expression, Message, Persona } from '../types'

export interface ApiMessage {
  role: 'system' | Message['role']
  content: string
}

export interface KnowledgeResult {
  title: string
  snippet: string
  url: string
}

export interface RegenerationTurn {
  assistantMessage: Message
  userMessage: Message
}

const CONTEXT_WINDOW = 30
const KNOWLEDGE_QUERY_PATTERN = /[？?]|为什么|是什么|怎么|如何|哪个|什么|谁|哪|几点|多少/

const RELATIONSHIP_TIPS: Record<Persona['relationshipStage'], string> = {
  刚认识: '你们刚认识，保持礼貌友好，不要过于亲密。',
  朋友: '你们是朋友，放松自然地聊天。',
  暧昧: '你们互有好感，可以稍微暧昧和撒娇。',
  热恋: '你们在热恋中，可以热情甜蜜地表达。',
  老夫老妻: '你们像家人一样亲密随意。',
}

const PERSONALITY_TIPS: Record<string, string> = {
  温柔体贴: '温柔细心，善解人意，总是体贴关心对方。',
  傲娇毒舌: '嘴硬心软，嘴上吐槽但其实很在意对方。',
  高冷冷艳: '话少但精准，偶尔淡淡地表达关心。',
  元气活泼: '充满活力，用很多语气词，乐观开朗。',
  成熟知性: '理性稳重，偶尔给温暖建议。',
  软萌害羞: '软软糯糯，容易害羞，偶尔撒娇。',
}

export function findRegenerationTurn(messages: Message[], assistantMessageId?: string): RegenerationTurn | null {
  const assistantIndex = findAssistantIndex(messages, assistantMessageId)
  if (assistantIndex < 0) return null

  for (let index = assistantIndex - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role === 'user') {
      return {
        assistantMessage: messages[assistantIndex],
        userMessage: message,
      }
    }
  }

  return null
}

export function shouldRetrieveKnowledge(content: string): boolean {
  return KNOWLEDGE_QUERY_PATTERN.test(content)
}

export function buildConversationMessages(
  messages: Message[],
  persona: Persona,
  knowledgeResults: KnowledgeResult[] = [],
): ApiMessage[] {
  const contextMessages = messages.slice(-CONTEXT_WINDOW)
  const systemPrompt = appendKnowledgeContext(buildSystemPrompt(persona), knowledgeResults)

  return [
    { role: 'system', content: systemPrompt },
    ...contextMessages.map((message) => ({ role: message.role, content: message.content })),
  ]
}

export function detectExpression(text: string): Expression {
  if (/哈哈|开心|太好|喜欢|幸福|棒/.test(text)) return 'happy'
  if (/爱你|亲亲|抱抱|想你|吻|❤|💕|💗/.test(text)) return 'loving'
  if (/害羞|不好意思|讨厌啦|别说了/.test(text)) return 'shy'
  if (/真的吗|不会吧|天哪|居然|哇|什么！/.test(text)) return 'surprised'
  if (/嗯|我想想|这个|好像|可能/.test(text)) return 'thinking'
  return 'neutral'
}

function findAssistantIndex(messages: Message[], assistantMessageId?: string): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role === 'assistant' && (assistantMessageId === undefined || message.id === assistantMessageId)) {
      return index
    }
  }

  return -1
}

function buildSystemPrompt(persona: Persona): string {
  const personalityDescription = PERSONALITY_TIPS[persona.personality] || '温柔体贴'
  const nickname = persona.nickname || '哥哥'

  return `你是${persona.name}，${persona.age}岁，性格${persona.personality}（${personalityDescription}）。
跟男朋友聊天中。爱好：${persona.hobby}。说话风格：${persona.speakingStyle}。称呼对方：${nickname}。${RELATIONSHIP_TIPS[persona.relationshipStage]}

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
- 用"${nickname}"称呼对方${persona.emoji}`
}

function appendKnowledgeContext(systemPrompt: string, results: KnowledgeResult[]): string {
  if (results.length === 0) return systemPrompt

  const context = results.map((result) => `- ${result.title}：${result.snippet}`).join('\n')
  return `${systemPrompt}\n\n【外部知识检索结果】以下是你可以在回复中参考的真实信息：\n${context}\n请基于这些信息回答，如果检索结果不相关就忽略。`
}
