export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
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
    name: 'SiliconFlow',
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-7B-Instruct', 'Pro/zai-org/GLM-4.5']
  },
  {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo']
  },
  {
    name: '自定义',
    endpoint: '',
    models: []
  }
]