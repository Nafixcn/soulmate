import { invoke } from '@tauri-apps/api/core'

export interface AppLockVerification {
  unlocked: boolean
  retryAfterMs: number
}

export const appLock = {
  hasLock(): Promise<boolean> {
    return invoke<boolean>('has_app_lock')
  },

  setPin(pin: string): Promise<void> {
    return invoke('set_app_lock', { pin })
  },

  verifyPin(pin: string): Promise<AppLockVerification> {
    return invoke<AppLockVerification>('verify_app_lock', { pin })
  },
}
