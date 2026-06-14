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

export const LIVE2D_MODELS: { name: string; path: string; sdk: 'cubism2' | 'cubism4' }[] = [
  { name: 'Shizuku', path: './models/shizuku/shizuku.model.json', sdk: 'cubism2' },
  { name: 'Haru (Cubism4)', path: './models/haru/haru.model3.json', sdk: 'cubism4' },
]

export const API_PRESETS: { name: string; endpoint: string; models: string[] }[] = [
  {
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner']
  },
  {
    name: '自定义',
    endpoint: '',
    models: []
  }
]
