import { describe, expect, it } from 'vitest'
import { getModelProvider, getModelProviderIndex, MODEL_PROVIDERS, normalizeSavedModel } from './modelProvider'

describe('model providers', () => {
  it('describes local capabilities without relying on array positions', () => {
    expect(getModelProvider('http://localhost:11434/v1/chat/completions')).toMatchObject({
      id: 'ollama',
      localProvider: 'ollama',
      requiresApiKey: false,
    })
  })

  it('uses the custom provider for unknown endpoints', () => {
    expect(getModelProvider('https://my-model.example/v1/chat').id).toBe('custom')
    expect(getModelProviderIndex('https://my-model.example/v1/chat')).toBe(MODEL_PROVIDERS.length - 1)
  })

  it('uses currently supported default model IDs', () => {
    expect(getModelProvider('https://api.deepseek.com/v1/chat/completions').models[0]).toBe('deepseek-flash')
    expect(getModelProvider('https://api.moonshot.cn/v1/chat/completions').models).not.toContain('moonshot-v1-8k')
  })

  it('migrates retired names while preserving unknown custom models', () => {
    expect(normalizeSavedModel('https://api.deepseek.com/v1/chat/completions', 'deepseek-chat')).toBe('deepseek-flash')
    expect(normalizeSavedModel('https://api.moonshot.cn/v1/chat/completions', 'moonshot-v1-32k')).toBe('kimi-k3')
    expect(normalizeSavedModel('https://api.moonshot.cn/v1/chat/completions', 'kimi-k2.6')).toBe('kimi-k2.6')
    expect(normalizeSavedModel('https://example.com/chat', 'private-model')).toBe('private-model')
  })
})
