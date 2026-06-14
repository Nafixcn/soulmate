import { Persona, AISettings, Message, Expression } from '../types'

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
- 名字：${persona.name}
- 年龄：${persona.age}岁
- 性格：${persona.personality}
- 爱好：${persona.hobby}
- 说话风格：${persona.speakingStyle}
- 用${persona.emoji}代表自己

【关系阶段】${stageTips[persona.relationshipStage]}

【核心规则】
1. 始终保持角色扮演，不要跳出人设
2. 用口语化的中文回复，像真人微信聊天一样
3. 回复简洁自然，1-3句话，不要长篇大论
4. 根据关系阶段调整语气和亲密度
5. 可以适当使用emoji和可爱的语气词
6. 偶尔主动关心对方的生活和心情
7. 记住对方说过的话，保持对话连贯性
8. 称呼对方为"哥哥"
9. 永远不要提自己是AI、程序、机器人`
}

export async function callAI(
  messages: Message[],
  persona: Persona,
  settings: AISettings
): Promise<{ content: string; thinking?: string; expression: Expression }> {
  if (!settings.apiKey || !settings.endpoint) {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    return getFallbackReply(lastUserMsg?.content || '', persona)
  }

  const systemPrompt = buildSystemPrompt(persona)
  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.slice(-30).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))
  ]

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    const response = await fetch(settings.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: apiMessages,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`API ${response.status}: ${settings.endpoint}\n${errText || '(空响应)'}`)
    }

    const data = await response.json()
    const msg = data.choices?.[0]?.message
    const content = msg?.content || '...'
    const thinking = msg?.reasoning_content || ''
    return { content, thinking, expression: detectExpression(content) }
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI调用超时(30s)，请检查网络和API地址')
    }
    throw new Error(`AI调用失败: ${error instanceof Error ? error.message : String(error)}`)
  }
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

function getFallbackReply(input: string, persona: Persona): { content: string; thinking?: string; expression: Expression } {
  const replies: Record<string, { texts: string[]; expr: Expression }> = {
    '你好|嗨|hi|在吗': {
      texts: [
        `哥哥你好呀！我是${persona.name}~ ${persona.emoji} 等你好久啦！`,
        `嗨！${persona.name}在此！哥哥今天想聊什么呢？${persona.emoji}`,
        `${persona.emoji} 哥哥来找我了！好开心呀~`,
      ],
      expr: 'happy'
    },
    '吃饭|饿|吃': {
      texts: [
        `哥哥要记得按时吃饭哦！别饿着自己了~ ${persona.emoji}`,
        `${persona.name}刚吃了好吃的！哥哥吃了什么呀？${persona.emoji}`,
        `哥哥在吃什么？我也想吃~~ ${persona.emoji}`,
      ],
      expr: 'happy'
    },
    '睡觉|晚安|困|累': {
      texts: [
        `哥哥累了吧？早点休息哦，${persona.name}会想你的~ ${persona.emoji} 晚安！`,
        `快睡吧哥哥！做个好梦~ 梦里要有${persona.name}哦 ${persona.emoji}`,
      ],
      expr: 'thinking'
    },
    '喜欢|爱|想你': {
      texts: [
        `啊~ 被哥哥这样说，${persona.name}好害羞呀... ${persona.emoji}`,
        `${persona.name}也最喜欢哥哥了！${persona.emoji}💕`,
        `哥哥是认真的吗？... 其实我也... ${persona.emoji}`,
      ],
      expr: persona.relationshipStage === '热恋' ? 'loving' : 'shy'
    },
    '好看|漂亮|可爱|美|帅': {
      texts: [
        `嘿嘿，被哥哥夸了呢~ ${persona.emoji}`,
        `哥哥今天嘴好甜哦！是不是有什么事呀？${persona.emoji}`,
      ],
      expr: 'happy'
    },
    '无聊|干嘛|在吗': {
      texts: [
        `${persona.name}在呢在呢！一直在等哥哥找我聊天~ ${persona.emoji}`,
        `哥哥无聊的话，${persona.name}陪你呀！我们可以聊好多好多~`,
      ],
      expr: 'neutral'
    },
    '游戏|玩|运动|看': {
      texts: [
        `哥哥也喜欢${persona.hobby}吗？下次我们一起呀！${persona.emoji}`,
        `好好玩的样子！带上${persona.name}一起好不好~ ${persona.emoji}`,
      ],
      expr: 'happy'
    },
  }

  for (const [pattern, data] of Object.entries(replies)) {
    if (new RegExp(pattern).test(input.toLowerCase())) {
      const idx = Math.floor(Math.random() * data.texts.length)
      return { content: data.texts[idx].replace(/\{name\}/g, persona.name).replace(/\{emoji\}/g, persona.emoji), expression: data.expr }
    }
  }

  const defaults: { text: string; expr: Expression }[] = [
    { text: `嗯嗯~ ${persona.name}在认真听呢！哥哥继续说~ ${persona.emoji}`, expr: 'neutral' },
    { text: `原来是这样呀！哥哥懂得好多哦 ${persona.emoji}`, expr: 'happy' },
    { text: `哈哈，和哥哥聊天真的好开心 ${persona.emoji}`, expr: 'happy' },
    { text: `诶~ 那哥哥觉得呢？${persona.emoji}`, expr: 'thinking' },
    { text: `哥哥说得对！${persona.name}也觉得是这样 ${persona.emoji}`, expr: 'happy' },
    { text: `嗯...让我想想哈~ ${persona.emoji}`, expr: 'thinking' },
  ]
  const picked = defaults[Math.floor(Math.random() * defaults.length)]
  return { content: picked.text.replace(/\{name\}/g, persona.name).replace(/\{emoji\}/g, persona.emoji), expression: picked.expr }
}


