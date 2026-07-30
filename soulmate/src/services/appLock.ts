import { invoke } from '@tauri-apps/api/core'

export const appLock = {
  hasLock(): Promise<boolean> {
    return invoke<boolean>('has_app_lock')
  },

  setPin(pin: string): Promise<void> {
    return invoke('set_app_lock', { pin })
  },

  verifyPin(pin: string): Promise<boolean> {
    return invoke<boolean>('verify_app_lock', { pin })
  },
}
