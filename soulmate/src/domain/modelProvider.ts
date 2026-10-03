export type LocalModelProvider = 'ollama' | 'lmstudio'

export interface ModelProvider {
  id: string
  name: string
  endpoint: string
  models: string[]
  localProvider?: LocalModelProvider
  requiresApiKey: boolean
}

export const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    models: [],
    localProvider: 'ollama',
    requiresApiKey: false,
  },
  {
    id: 'lmstudio',
    name: 'LM Studio（本地）',
    endpoint: 'http://localhost:1234/v1/chat/completions',
    models: [],
    localProvider: 'lmstudio',
    requiresApiKey: false,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    models: ['deepseek-flash', 'deepseek-v4-pro'],
    requiresApiKey: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra', 'gpt-4.1-mini'],
    requiresApiKey: true,
  },
  {
    id: 'qwen',
    name: '阿里百炼 (Qwen)',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    models: ['qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-max', 'qwen-plus-character'],
    requiresApiKey: true,
  },
  {
    id: 'glm',
    name: '智谱 (GLM)',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    models: ['glm-5.3-flash', 'glm-5.3', 'glm-5.2'],
    requiresApiKey: true,
  },
  {
    id: 'kimi',
    name: 'Moonshot (Kimi)',
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    models: ['kimi-k3', 'kimi-k2.6'],
    requiresApiKey: true,
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    models: [
      'deepseek-ai/DeepSeek-V4-Flash',
      'deepseek-ai/DeepSeek-V4-Pro',
      'Pro/zai-org/GLM-5.1',
      'Qwen/Qwen3.6-35B-A3B',
    ],
    requiresApiKey: true,
  },
  { id: 'custom', name: '自定义', endpoint: '', models: [], requiresApiKey: true },
]

export const DEFAULT_MODEL_PROVIDER = MODEL_PROVIDERS.find((provider) => provider.id === 'deepseek')!

export function getModelDisplayName(model: string): string {
  return model === 'deepseek-flash' ? 'DeepSeek V4.1 Flash (deepseek-flash)' : model
}

export function getModelProvider(endpoint: string): ModelProvider {
  return (
    MODEL_PROVIDERS.find((provider) => provider.endpoint && provider.endpoint === endpoint) ||
    MODEL_PROVIDERS[MODEL_PROVIDERS.length - 1]
  )
}

export function getModelProviderIndex(endpoint: string): number {
  const index = MODEL_PROVIDERS.findIndex((provider) => provider.endpoint && provider.endpoint === endpoint)
  return index >= 0 ? index : MODEL_PROVIDERS.length - 1
}

export function normalizeSavedModel(endpoint: string, model: string): string {
  const provider = getModelProvider(endpoint)
  if (provider.id === 'deepseek' && ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-flash'].includes(model)) {
    return 'deepseek-flash'
  }
  if (
    provider.id === 'kimi' &&
    (model.startsWith('moonshot-v1') ||
      model === 'kimi-k2.5' ||
      model === 'kimi-k2' ||
      model.startsWith('kimi-k2-') ||
      model === 'kimi-latest')
  ) {
    return 'kimi-k3'
  }
  if (provider.id === 'siliconflow') {
    const retired: Record<string, string> = {
      'Pro/zai-org/GLM-4.5': 'Pro/zai-org/GLM-5.1',
      'Qwen/Qwen3-235B-A22B': 'Qwen/Qwen3.6-35B-A3B',
    }
    return retired[model] || model
  }
  return model
}
