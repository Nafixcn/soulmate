export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  timestamp: number
  alternatives?: AssistantAlternative[]
  activeAlternative?: number
  memoryReferences?: MemoryReference[]
}

export interface AssistantAlternative {
  content: string
  thinking?: string
  memoryReferences?: MemoryReference[]
}

export interface MemoryReference {
  id: string
  content: string
}

export type MemoryCategory = 'profile' | 'preference' | 'event' | 'boundary'

export interface Memory {
  id: string
  personaId: string
  category: MemoryCategory
  content: string
  sourceMessageId?: string
  confidence: number
  pinned: boolean
  enabled?: boolean
  createdAt: number
  updatedAt: number
}

export type RelationshipStage = '刚认识' | '朋友' | '暧昧' | '热恋' | '老夫老妻'

export interface StageAppearance {
  label: string
  icon: string
}

export interface Persona {
  id: string
  name: string
  age: number
  personality: string
  hobby: string
  nickname: string
  speakingStyle: string
  relationshipStage: RelationshipStage
  stageAppearance?: Partial<Record<RelationshipStage, StageAppearance>>
  emoji: string
  hairColor: string
  eyeColor: string
  avatar: string
  description: string
  scenario: string
  firstMessage: string
  exampleDialogue: string
  systemPrompt: string
  creator: string
  tags: string[]
  lorebook: LorebookEntry[]
}

export interface LorebookEntry {
  id: string
  name: string
  keywords: string[]
  content: string
  enabled: boolean
  priority: number
}

export interface UserProfile {
  name: string
  preferredAddress: string
  relationshipLabel: string
  interests: string
  boundaries: string
}

export type Expression = 'neutral' | 'happy' | 'shy' | 'loving' | 'surprised' | 'thinking'

export interface AISettings {
  endpoint: string
  model: string
  temperature: number
  maxTokens: number
  autoProgress: boolean
  evalInterval: number
  useWebSearch: boolean
  memoryEnabled?: boolean
  memoryExtractionInterval?: number
}

export interface GreetingSettings {
  enabled: boolean
  dailyCount: number
  quietStart: number
  quietEnd: number
}

export interface MessagePage {
  messages: Message[]
  hasMore: boolean
  userMessageCount: number
}

export interface TTSSettings {
  enabled: boolean
  autoPlay: boolean
  rate: number
  pitch: number
  voiceURI: string
}

export interface ThemeColors {
  primary: string
  bg: string
  chatBg: string
  userBubble: string
  aiBubble: string
  text: string
  subText: string
  petals: string[]
}

export const THEME_PRESETS: { name: string; colors: ThemeColors }[] = [
  {
    name: '樱花粉',
    colors: {
      primary: '#e896b0',
      bg: '#faf5f7',
      chatBg: '#fef5f8',
      userBubble: '#f0a8c0',
      aiBubble: '#ffffff',
      text: '#4a3040',
      subText: '#998893',
      petals: ['🌸', '💮', '🌷', '🏵️', '✿', '❀', '🌸', '💮'],
    },
  },
  {
    name: '天空蓝',
    colors: {
      primary: '#6baed6',
      bg: '#f0f5fa',
      chatBg: '#f5f8fc',
      userBubble: '#6baed6',
      aiBubble: '#ffffff',
      text: '#2a3a4a',
      subText: '#7a8a9a',
      petals: ['🪻', '💠', '🦋', '❄️', '🔹', '🪻', '💙', '🌊'],
    },
  },
  {
    name: '薄荷绿',
    colors: {
      primary: '#5dae7e',
      bg: '#f2f8f3',
      chatBg: '#f6faf7',
      userBubble: '#5dae7e',
      aiBubble: '#ffffff',
      text: '#2a3a30',
      subText: '#7a8a80',
      petals: ['🍀', '🌿', '🍃', '🌱', '🪴', '🍀', '🪷', '☘️'],
    },
  },
  {
    name: '薰衣草',
    colors: {
      primary: '#b07cd8',
      bg: '#f5f2fa',
      chatBg: '#faf7fc',
      userBubble: '#b07cd8',
      aiBubble: '#ffffff',
      text: '#3a2a4a',
      subText: '#8a7a9a',
      petals: ['💜', '🪻', '💐', '🌌', '✨', '💫', '🪻', '💜'],
    },
  },
  {
    name: '暖橘',
    colors: {
      primary: '#e8965a',
      bg: '#faf5f0',
      chatBg: '#fcf8f5',
      userBubble: '#e8965a',
      aiBubble: '#ffffff',
      text: '#4a3020',
      subText: '#9a8078',
      petals: ['🍂', '🍁', '🌻', '🧡', '🌾', '🍂', '🌼', '🏵️'],
    },
  },
  {
    name: '暗夜',
    colors: {
      primary: '#4a3040',
      bg: '#1a1418',
      chatBg: '#221a1e',
      userBubble: '#4a3040',
      aiBubble: '#2a2228',
      text: '#e8d8e0',
      subText: '#a09098',
      petals: ['🌙', '⭐', '✨', '💫', '🌠', '🕯️', '🌙', '💜'],
    },
  },
  {
    name: '自定义',
    colors: {
      primary: '#e896b0',
      bg: '#faf5f7',
      chatBg: '#fef5f8',
      userBubble: '#f0a8c0',
      aiBubble: '#ffffff',
      text: '#4a3040',
      subText: '#998893',
      petals: ['🌸', '💮', '🌷', '🏵️', '✿', '❀', '🌸', '💮'],
    },
  },
]

export interface AiChunk {
  content: string
  thinking: string
  done: boolean
}

export const DEFAULT_PERSONA: Persona = {
  id: 'default',
  name: '灵伴',
  age: 20,
  personality: '温柔体贴',
  hobby: '看电影、听音乐',
  nickname: '哥哥',
  speakingStyle: '可爱活泼，喜欢用语气词',
  relationshipStage: '刚认识',
  emoji: '🌸',
  hairColor: '#ff9fbf',
  eyeColor: '#ff6b9d',
  avatar: '',
  description: '',
  scenario: '',
  firstMessage: '',
  exampleDialogue: '',
  systemPrompt: '',
  creator: '',
  tags: [],
  lorebook: [],
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  name: '',
  preferredAddress: '你',
  relationshipLabel: '伴侣',
  interests: '',
  boundaries: '',
}
