import React, { useEffect, useRef, useState } from 'react'
import { DatabaseBackup, Download, KeyRound, Trash2, Upload } from 'lucide-react'
import { appLock } from '../services/appLock'
import { exportPortableBackup, importPortableBackup } from '../services/dataPortability'

interface Props {
  idPrefix: string
}

export const DataSettings: React.FC<Props> = ({ idPrefix }) => {
  const [hasLock, setHasLock] = useState(false)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [backupPassword, setBackupPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void appLock
      .hasLock()
      .then(setHasLock)
      .catch((loadError) => {
        console.error('Failed to load app lock state:', loadError)
        setError('无法读取应用锁状态')
      })
  }, [])

  const updateAppLock = async (nextPin: string) => {
    if (nextPin && (!/^\d{4,12}$/.test(nextPin) || nextPin !== confirmPin)) {
      setError(nextPin !== confirmPin ? '两次输入的 PIN 不一致' : 'PIN 必须是 4-12 位数字')
      return
    }

    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await appLock.setPin(nextPin)
      setHasLock(Boolean(nextPin))
      setPin('')
      setConfirmPin('')
      setStatus(nextPin ? '应用锁已启用' : '应用锁已关闭')
    } catch (saveError) {
      console.error('Failed to update app lock:', saveError)
      setError('应用锁更新失败')
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async () => {
    if (backupPassword && backupPassword.length < 8) {
      setError('备份密码至少需要 8 个字符')
      return
    }
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await exportPortableBackup(backupPassword)
      setStatus(backupPassword ? '加密备份已导出，请妥善保存密码' : '明文备份已导出')
    } catch (exportError) {
      console.error('Failed to export portable backup:', exportError)
      setError('完整备份导出失败')
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async (file: File) => {
    if (!window.confirm('导入会替换当前全部角色、设置和聊天记录，确定继续？')) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const summary = await importPortableBackup(file, backupPassword)
      setStatus(
        `已导入 ${summary.personaCount} 个角色、${summary.messageCount} 条消息、${summary.memoryCount} 条记忆，正在重新加载`,
      )
      setTimeout(() => window.location.reload(), 600)
    } catch (importError) {
      console.error('Failed to import portable backup:', importError)
      setError(importError instanceof Error ? importError.message : '备份导入失败')
    } finally {
      setBusy(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div className="data-settings">
      <section className="data-settings-section" aria-labelledby={`${idPrefix}-backup-title`}>
        <h3 id={`${idPrefix}-backup-title`}>
          <DatabaseBackup size={16} aria-hidden="true" /> 数据备份
        </h3>
        <p className="data-settings-note">
          备份包含私密聊天与记忆。设置密码后会在本机使用 AES-256-GCM 加密；密码不会被保存，也无法找回。
        </p>
        <div className="form-group">
          <label htmlFor={`${idPrefix}-backup-password`}>备份密码（建议设置）</label>
          <input
            id={`${idPrefix}-backup-password`}
            type="password"
            autoComplete="new-password"
            value={backupPassword}
            minLength={8}
            onChange={(event) => setBackupPassword(event.target.value)}
            placeholder="至少 8 个字符；导入加密备份时也填在这里"
          />
        </div>
        <div className="data-settings-actions">
          <button type="button" className="tag active" onClick={() => void handleExport()} disabled={busy}>
            <Download size={14} aria-hidden="true" /> 导出完整备份
          </button>
          <button type="button" className="tag" onClick={() => importInputRef.current?.click()} disabled={busy}>
            <Upload size={14} aria-hidden="true" /> 导入备份
          </button>
          <input
            ref={importInputRef}
            className="hidden-file-input"
            type="file"
            accept="application/json,.json"
            aria-label="选择 SoulMate 备份文件"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleImport(file)
            }}
          />
        </div>
      </section>

      <section className="data-settings-section" aria-labelledby={`${idPrefix}-lock-title`}>
        <h3 id={`${idPrefix}-lock-title`}>
          <KeyRound size={16} aria-hidden="true" /> 应用锁
        </h3>
        <div className="form-group">
          <label htmlFor={`${idPrefix}-lock-pin`}>{hasLock ? '新 PIN' : 'PIN'}</label>
          <input
            id={`${idPrefix}-lock-pin`}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
            placeholder="4-12 位数字"
          />
        </div>
        <div className="form-group">
          <label htmlFor={`${idPrefix}-lock-confirm`}>确认 PIN</label>
          <input
            id={`${idPrefix}-lock-confirm`}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={confirmPin}
            onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
          />
        </div>
        <div className="data-settings-actions">
          <button
            type="button"
            className="tag active"
            onClick={() => void updateAppLock(pin)}
            disabled={busy || pin.length < 4}
          >
            <KeyRound size={14} aria-hidden="true" /> {hasLock ? '更新应用锁' : '启用应用锁'}
          </button>
          {hasLock && (
            <button type="button" className="tag" onClick={() => void updateAppLock('')} disabled={busy}>
              <Trash2 size={14} aria-hidden="true" /> 关闭应用锁
            </button>
          )}
        </div>
      </section>

      {status && (
        <p className="settings-status" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
