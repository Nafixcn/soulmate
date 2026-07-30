import { invoke } from '@tauri-apps/api/core'

export interface StartupWarning {
  code: 'databaseRecovered'
  message: string
  isolatedDatabasePath: string
  occurredAt: number
}

export interface BackupImportSummary {
  messageCount: number
  personaCount: number
  hasSettings: boolean
}

export async function takeStartupWarning(): Promise<StartupWarning | null> {
  return invoke<StartupWarning | null>('take_startup_warning')
}

export async function exportPortableBackup(): Promise<void> {
  const backupJson = await invoke<string>('export_database_backup')
  downloadPortableBackup(backupJson)
}

export async function importPortableBackup(file: File): Promise<BackupImportSummary> {
  const backupJson = await file.text()
  return invoke<BackupImportSummary>('import_database_backup', { backupJson })
}

export function portableBackupFilename(exportedAt = new Date()): string {
  const timestamp = exportedAt.toISOString().replace(/[:.]/g, '-')
  return `soulmate-backup-${timestamp}.json`
}

function downloadPortableBackup(backupJson: string): void {
  const url = URL.createObjectURL(new Blob([backupJson], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = portableBackupFilename()
  anchor.click()
  URL.revokeObjectURL(url)
}
