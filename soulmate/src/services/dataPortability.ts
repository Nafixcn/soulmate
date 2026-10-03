import { invoke } from '@tauri-apps/api/core'

const MAX_PLAIN_BACKUP_BYTES = 64 * 1024 * 1024
const MAX_ENCRYPTED_BACKUP_BYTES = 96 * 1024 * 1024
const BACKUP_ENCRYPTION_FORMAT = 'soulmate-encrypted-backup'
const BACKUP_KDF_ITERATIONS = 310_000

interface EncryptedBackupEnvelope {
  format: typeof BACKUP_ENCRYPTION_FORMAT
  version: 1
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  cipher: { name: 'AES-GCM'; iv: string }
  payload: string
}

export interface StartupWarning {
  code: 'databaseRecovered'
  message: string
  isolatedDatabasePath: string
  occurredAt: number
}

export interface BackupImportSummary {
  messageCount: number
  memoryCount: number
  personaCount: number
  hasSettings: boolean
}

export async function takeStartupWarning(): Promise<StartupWarning | null> {
  return invoke<StartupWarning | null>('take_startup_warning')
}

export async function exportPortableBackup(passphrase = ''): Promise<void> {
  const backupJson = await invoke<string>('export_database_backup')
  const content = passphrase ? await encryptPortableBackup(backupJson, passphrase) : backupJson
  downloadPortableBackup(content, Boolean(passphrase))
}

export async function importPortableBackup(file: File, passphrase = ''): Promise<BackupImportSummary> {
  if (file.size > MAX_ENCRYPTED_BACKUP_BYTES) throw new Error('备份文件超过 96 MiB 安全限制')
  const content = await file.text()
  const backupJson = isEncryptedPortableBackup(content) ? await decryptPortableBackup(content, passphrase) : content
  if (new TextEncoder().encode(backupJson).byteLength > MAX_PLAIN_BACKUP_BYTES) {
    throw new Error('解密后的备份超过 64 MiB 安全限制')
  }
  return invoke<BackupImportSummary>('import_database_backup', { backupJson })
}

export async function encryptPortableBackup(backupJson: string, passphrase: string): Promise<string> {
  if (passphrase.length < 8) throw new Error('备份密码至少需要 8 个字符')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveBackupKey(passphrase, salt, ['encrypt'])
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(BACKUP_ENCRYPTION_FORMAT) },
    key,
    new TextEncoder().encode(backupJson),
  )
  const envelope: EncryptedBackupEnvelope = {
    format: BACKUP_ENCRYPTION_FORMAT,
    version: 1,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: BACKUP_KDF_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    payload: bytesToBase64(new Uint8Array(encrypted)),
  }
  return JSON.stringify(envelope)
}

export async function decryptPortableBackup(encryptedJson: string, passphrase: string): Promise<string> {
  if (!passphrase) throw new Error('这是加密备份，请先输入备份密码')
  let envelope: EncryptedBackupEnvelope
  try {
    envelope = JSON.parse(encryptedJson) as EncryptedBackupEnvelope
    if (
      envelope.format !== BACKUP_ENCRYPTION_FORMAT ||
      envelope.version !== 1 ||
      envelope.kdf?.iterations !== BACKUP_KDF_ITERATIONS
    ) {
      throw new Error('unsupported')
    }
    const salt = base64ToBytes(envelope.kdf.salt)
    const iv = base64ToBytes(envelope.cipher.iv)
    const key = await deriveBackupKey(passphrase, salt, ['decrypt'])
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(BACKUP_ENCRYPTION_FORMAT) },
      key,
      base64ToBytes(envelope.payload),
    )
    return new TextDecoder().decode(decrypted)
  } catch {
    throw new Error('备份密码错误，或文件已经损坏')
  }
}

export function isEncryptedPortableBackup(content: string): boolean {
  try {
    return (JSON.parse(content) as Partial<EncryptedBackupEnvelope>).format === BACKUP_ENCRYPTION_FORMAT
  } catch {
    return false
  }
}

export function portableBackupFilename(exportedAt = new Date()): string {
  const timestamp = exportedAt.toISOString().replace(/[:.]/g, '-')
  return `soulmate-backup-${timestamp}.json`
}

async function deriveBackupKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: BACKUP_KDF_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  )
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function downloadPortableBackup(backupJson: string, encrypted: boolean): void {
  const url = URL.createObjectURL(new Blob([backupJson], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = encrypted
    ? portableBackupFilename().replace(/\.json$/, '.encrypted.json')
    : portableBackupFilename()
  anchor.click()
  URL.revokeObjectURL(url)
}
