import { invoke } from '@tauri-apps/api/core'

export const settingsGateway = {
  loadSettings(): Promise<string | null> {
    return invoke<string | null>('get_settings')
  },

  saveSettings(settingsJson: string): Promise<void> {
    return invoke('save_settings', { settingsJson })
  },

  deletePersona(personaId: string, settingsJson: string): Promise<void> {
    return invoke('delete_persona', { personaId, settingsJson })
  },

  hasApiKey(): Promise<boolean> {
    return invoke<boolean>('has_api_key')
  },

  saveApiKey(apiKey: string): Promise<void> {
    return invoke('save_api_key', { apiKey })
  },
}
