export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  timestamp: number
}

export interface Persona {
  name: string
  age: number
  personality: string
  hobby: string
  speakingStyle: string
  relationshipStage: '刚认识' | '朋友' | '暧昧' | '热恋' | '老夫老妻'
  emoji: string
  hairColor: string
  eyeColor: string
  avatar: string
}

export type Expression = 'neutral' | 'happy' | 'shy' | 'loving' | 'surprised' | 'thinking'

export interface AISettings {
  apiKey: string
  endpoint: string
  model: string
  temperature: number
  maxTokens: number
}

export interface TTSSettings {
  enabled: boolean
  autoPlay: boolean
  rate: number
  pitch: number
  voiceURI: string
}

export const API_PRESETS: { name: string; endpoint: string; models: string[] }[] = [
  {
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    models: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-pro', 'deepseek-v4-flash']
  },
  {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o4-mini']
  },
  {
    name: '阿里百炼 (Qwen)',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    models: ['qwen3-235b-a22b', 'qwen3-max', 'qwen-plus', 'qwen-turbo']
  },
  {
    name: '智谱 (GLM)',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    models: ['glm-4.5', 'glm-4-plus', 'glm-4-flash', 'glm-z1-air']
  },
  {
    name: 'Moonshot (Kimi)',
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']
  },
  {
    name: '硅基流动',
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    models: ['deepseek-ai/DeepSeek-V3', 'Pro/zai-org/GLM-4.5', 'Qwen/Qwen3-235B-A22B']
  },
  { name: '自定义', endpoint: '', models: [] }
]

export interface AiChunk {
  content: string
  thinking: string
  done: boolean
}

export const DEFAULT_PERSONA: Persona = {
  name: '灵伴',
  age: 20,
  personality: '温柔体贴',
  hobby: '看电影、听音乐',
  speakingStyle: '可爱活泼，喜欢用语气词，会称呼你为"哥哥"',
  relationshipStage: '刚认识',
  emoji: '🌸',
  hairColor: '#ff9fbf',
  eyeColor: '#ff6b9d',
  avatar: ''
}
