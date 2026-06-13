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
    name: 'SiliconFlow',
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    models: [
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'Pro/deepseek-ai/DeepSeek-V3',
      'Pro/deepseek-ai/DeepSeek-R1',
      'Qwen/Qwen2.5-7B-Instruct',
      'Qwen/Qwen2.5-72B-Instruct',
      'Qwen/Qwen3-235B-Thinking',
      'Pro/zai-org/GLM-4.5',
      'Pro/meta-llama/Llama-4-Maverick',
    ]
  },
  {
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner']
  },
  {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini', 'o4-mini']
  },
  {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['llama-3.3-70b-versatile', 'llama-4-maverick-128k', 'deepseek-r1-distill-llama-70b']
  },
  {
    name: '自定义',
    endpoint: '',
    models: []
  }
]
