import { invoke } from '@tauri-apps/api/core'
import type { LocalModelProvider } from '../domain/modelProvider'

export interface LocalModelDiscovery {
  provider: LocalModelProvider
  models: string[]
}

export function discoverLocalModels(provider: LocalModelDiscovery['provider']): Promise<string[]> {
  return invoke<string[]>('discover_local_models', { provider })
}
