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
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await exportPortableBackup()
      setStatus('完整备份已导出')
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
      const summary = await importPortableBackup(file)
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
