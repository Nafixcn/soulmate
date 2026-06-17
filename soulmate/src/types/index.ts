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
  { name: '自定义', endpoint: '', models: [] }
]

export interface AiChunk {
  content: string
  thinking: string
  done: boolean
}
