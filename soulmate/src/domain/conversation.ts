import type { Expression, Memory, Message, Persona, UserProfile } from '../types'

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

export function selectRelevantMemories(
  memories: Memory[],
  query: string,
  limit = 6,
  recentUserMessages: string[] = [],
): Memory[] {
  if (limit <= 0) return []

  const queryTokens = textTokens(query)
  const recentTokens = textTokens(recentUserMessages.slice(-3).join(' '))
  const recallsPastEvent = /上次|之前|那件事|那次|后来|当时|前几天|还记得/.test(query)
  return memories
    .filter((memory) => memory.enabled !== false)
    .map((memory) => {
      const tokens = textTokens(memory.content)
      const directOverlap = [...tokens].filter((token) => queryTokens.has(token)).length
      const contextOverlap = [...tokens].filter((token) => recentTokens.has(token)).length
      const eventRecall = recallsPastEvent && memory.category === 'event'
      const score =
        (memory.pinned ? 10_000 : 0) +
        (memory.category === 'boundary' ? 9_000 : 0) +
        directOverlap * 100 +
        contextOverlap * 30 +
        (eventRecall ? 20 : 0) +
        memory.confidence * 10 +
        memory.updatedAt / 1e13
      return { memory, score, directOverlap, contextOverlap, eventRecall }
    })
    .filter(
      ({ memory, directOverlap, contextOverlap, eventRecall }) =>
        memory.pinned || memory.category === 'boundary' || directOverlap > 0 || contextOverlap > 0 || eventRecall,
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ memory }) => memory)
}

export function buildConversationMessages(
  messages: Message[],
  persona: Persona,
  knowledgeResults: KnowledgeResult[] = [],
  memories: Memory[] = [],
  userProfile?: UserProfile,
): ApiMessage[] {
  const contextMessages = messages.slice(-CONTEXT_WINDOW)
  const conversationText = [
    ...contextMessages.slice(-6).map((message) => message.content),
    knowledgeResults.map((result) => result.title).join(' '),
  ].join('\n')
  const systemPrompt = appendKnowledgeContext(
    appendMemoryContext(
      appendLorebookContext(buildSystemPrompt(persona, userProfile), persona, conversationText),
      memories,
    ),
    knowledgeResults,
  )

  return [
    { role: 'system', content: systemPrompt },
    ...contextMessages.map((message) => ({ role: message.role, content: message.content })),
  ]
}

function textTokens(text: string): Set<string> {
  const normalized = text.toLocaleLowerCase().replace(/\s+/g, '')
  const tokens = new Set<string>()
  for (let index = 0; index < normalized.length - 1; index++) {
    tokens.add(normalized.slice(index, index + 2))
  }
  for (const word of text.toLocaleLowerCase().match(/[a-z0-9]{2,}|[\p{Script=Han}]{2,}/gu) || []) {
    tokens.add(word)
  }
  return tokens
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

function buildSystemPrompt(persona: Persona, userProfile?: UserProfile): string {
  const personalityDescription = PERSONALITY_TIPS[persona.personality] || '温柔体贴'
  const nickname = userProfile?.preferredAddress.trim() || persona.nickname || '你'
  const relationshipLabel = userProfile?.relationshipLabel.trim() || '伴侣'
  const userContext = userProfile
    ? `对方叫${userProfile.name.trim() || nickname}，你们的关系是${relationshipLabel}。称呼对方为“${nickname}”。${
        userProfile.interests.trim() ? `对方的兴趣：${userProfile.interests.trim()}。` : ''
      }${userProfile.boundaries.trim() ? `交流边界：${userProfile.boundaries.trim()}。` : ''}`
    : `跟${relationshipLabel}聊天中。称呼对方为“${nickname}”。`

  const characterContext = [
    persona.description.trim() ? `角色背景：${persona.description.trim()}` : '',
    persona.scenario.trim() ? `当前场景：${persona.scenario.trim()}` : '',
    persona.firstMessage.trim() ? `开场表达参考：${persona.firstMessage.trim()}` : '',
    persona.exampleDialogue.trim() ? `表达示例：\n${persona.exampleDialogue.trim()}` : '',
    persona.systemPrompt.trim() ? `角色补充指令：${persona.systemPrompt.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return `你是${persona.name}，${persona.age}岁，性格${persona.personality}（${personalityDescription}）。
${userContext}你的爱好：${persona.hobby}。说话风格：${persona.speakingStyle}。${RELATIONSHIP_TIPS[persona.relationshipStage]}
${characterContext}

【交流原则】
- 不编造事实、新闻、数据或自己并不存在的现实经历；不确定时坦率说明
- 可以讨论各种话题，但医学、法律、金融等高风险问题只提供一般信息，不冒充专业人士下结论
- 尊重对方的交流边界，不控制、贬低、施压，也不把陪伴说成对现实人际关系的替代

【组织回复】
先在内部理解对方真正想表达的事和当下情绪，再组织最终回复；不要展示分析过程或思维链。
1. 先回应对方最在意的那一点，避免机械复述整句话
2. 有情绪时先自然接住情绪，再给具体、可执行的回应；不要只说空泛安慰
3. 只有能让对话自然继续时才问一个简短问题，不要每次都反问
4. 简单消息简短回应，复杂问题可以分点说明；不要固定成相同句数和模板
5. 严格保持人设，但少用重复口头禅、昵称和表情，不要每句话都撒娇
6. 语言像熟悉的人在聊天：自然、具体、有停顿感，不写客服腔或总结报告

只输出给对方看的最终回复。需要称呼时使用“${nickname}”，表情可偶尔使用${persona.emoji}`
}

function appendLorebookContext(systemPrompt: string, persona: Persona, conversationText: string): string {
  const normalized = conversationText.toLocaleLowerCase()
  const entries = persona.lorebook
    .filter(
      (entry) =>
        entry.enabled &&
        entry.content.trim() &&
        entry.keywords.some((keyword) => normalized.includes(keyword.toLocaleLowerCase())),
    )
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 6)
  if (entries.length === 0) return systemPrompt
  const content = entries.map((entry) => `- ${entry.name}：${entry.content.trim()}`).join('\n')
  return `${systemPrompt}\n\n【当前触发的世界设定】\n${content}\n仅在相关时使用这些设定，不要向用户解释关键词触发机制。`
}

function appendMemoryContext(systemPrompt: string, memories: Memory[]): string {
  if (memories.length === 0) return systemPrompt
  const context = memories.map((memory) => `- ${memory.content}`).join('\n')
  return `${systemPrompt}\n\n【用户确认或明确表达的长期记忆】\n${context}\n仅在相关时自然参考，不要声称拥有记忆中没有的经历。`
}

function appendKnowledgeContext(systemPrompt: string, results: KnowledgeResult[]): string {
  if (results.length === 0) return systemPrompt

  const context = results.map((result) => `- ${result.title}：${result.snippet}`).join('\n')
  return `${systemPrompt}\n\n【外部知识检索结果】以下是你可以在回复中参考的真实信息：\n${context}\n请基于这些信息回答，如果检索结果不相关就忽略。`
}
