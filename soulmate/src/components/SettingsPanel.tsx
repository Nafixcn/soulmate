import React, { useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { API_PRESETS, THEME_PRESETS } from '../types'
import { getVoices } from '../services/ttsService'
import { X, Bot, Volume2, Info, Palette, KeyRound, Trash2, DatabaseBackup, Brain } from 'lucide-react'
import { Dialog } from './Dialog'
import { DataSettings } from './DataSettings'
import { MemorySettings } from './MemorySettings'
import { memoryService } from '../services/memoryService'

interface Props {
  onClose: () => void
}

export const SettingsPanel: React.FC<Props> = ({ onClose }) => {
  const {
    aiSettings,
    ttsSettings,
    setAISettings,
    setTTSSettings,
    applyPreset,
    theme,
    themePresetIndex,
    applyThemePreset,
    setTheme,
    aiConfigured,
    setApiKey,
  } = useSettingsStore()
  const [tab, setTab] = React.useState<'ai' | 'memory' | 'tts' | 'theme' | 'data' | 'about'>('ai')
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([])
  const [apiKeyDraft, setApiKeyDraft] = React.useState('')
  const [savingApiKey, setSavingApiKey] = React.useState(false)
  const [connectionStatus, setConnectionStatus] = React.useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [connectionMessage, setConnectionMessage] = React.useState('')
  const formId = React.useId()
  const presetIndex = API_PRESETS.findIndex((p) => p.endpoint === aiSettings.endpoint)
  const isCustom = presetIndex < 0 || presetIndex >= API_PRESETS.length - 1
  const presetModels = isCustom ? [] : API_PRESETS[presetIndex]?.models || []

  useEffect(() => {
    const load = () => setVoices(getVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load)
    }
  }, [])

  const persistApiKey = async (apiKey: string) => {
    setSavingApiKey(true)
    const saved = await setApiKey(apiKey)
    if (saved) setApiKeyDraft('')
    setSavingApiKey(false)
  }

  const testConnection = async () => {
    setConnectionStatus('testing')
    setConnectionMessage('正在测试连接…')
    if (apiKeyDraft.trim() && !(await setApiKey(apiKeyDraft))) {
      setConnectionStatus('error')
      setConnectionMessage('API Key 无法写入系统钥匙串')
      return
    }
    try {
      await memoryService.testConnection(aiSettings)
      setApiKeyDraft('')
      setConnectionStatus('success')
      setConnectionMessage('连接成功')
    } catch (error) {
      setConnectionStatus('error')
      setConnectionMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <Dialog
      ariaLabelledBy={`${formId}-title`}
      onClose={onClose}
      overlayClassName="settings-overlay"
      panelClassName="settings-panel"
    >
      <div className="settings-header">
        <h2 id={`${formId}-title`}>设置</h2>
        <button type="button" className="close-btn" onClick={onClose} aria-label="关闭设置">
          <X size={20} />
        </button>
      </div>
      <div className="settings-tabs" role="tablist" aria-label="设置分类">
        <button
          type="button"
          id={`${formId}-ai-tab`}
          className={`tab-btn ${tab === 'ai' ? 'active' : ''}`}
          onClick={() => setTab('ai')}
          role="tab"
          aria-selected={tab === 'ai'}
          aria-controls={`${formId}-ai-panel`}
        >
          <Bot size={14} /> AI
        </button>
        <button
          type="button"
          id={`${formId}-memory-tab`}
          className={`tab-btn ${tab === 'memory' ? 'active' : ''}`}
          onClick={() => setTab('memory')}
          role="tab"
          aria-selected={tab === 'memory'}
          aria-controls={`${formId}-memory-panel`}
        >
          <Brain size={14} /> 记忆
        </button>
        <button
          type="button"
          id={`${formId}-tts-tab`}
          className={`tab-btn ${tab === 'tts' ? 'active' : ''}`}
          onClick={() => setTab('tts')}
          role="tab"
          aria-selected={tab === 'tts'}
          aria-controls={`${formId}-tts-panel`}
        >
          <Volume2 size={14} /> 语音
        </button>
        <button
          type="button"
          id={`${formId}-theme-tab`}
          className={`tab-btn ${tab === 'theme' ? 'active' : ''}`}
          onClick={() => setTab('theme')}
          role="tab"
          aria-selected={tab === 'theme'}
          aria-controls={`${formId}-theme-panel`}
        >
          <Palette size={14} /> 主题
        </button>
        <button
          type="button"
          id={`${formId}-data-tab`}
          className={`tab-btn ${tab === 'data' ? 'active' : ''}`}
          onClick={() => setTab('data')}
          role="tab"
          aria-selected={tab === 'data'}
          aria-controls={`${formId}-data-panel`}
        >
          <DatabaseBackup size={14} /> 数据
        </button>
        <button
          type="button"
          id={`${formId}-about-tab`}
          className={`tab-btn ${tab === 'about' ? 'active' : ''}`}
          onClick={() => setTab('about')}
          role="tab"
          aria-selected={tab === 'about'}
          aria-controls={`${formId}-about-panel`}
        >
          <Info size={14} /> 关于
        </button>
      </div>
      <div className="settings-body">
        {tab === 'ai' && (
          <div
            id={`${formId}-ai-panel`}
            className="settings-section"
            role="tabpanel"
            aria-labelledby={`${formId}-ai-tab`}
          >
            <div className="form-group">
              <label htmlFor={`${formId}-provider`}>API 服务商</label>
              <select
                id={`${formId}-provider`}
                value={isCustom ? API_PRESETS.length - 1 : presetIndex}
                onChange={(e) => {
                  const i = parseInt(e.target.value)
                  if (i < API_PRESETS.length - 1) {
                    applyPreset(i)
                  } else {
                    setAISettings({ endpoint: '' })
                  }
                }}
              >
                {API_PRESETS.map((p, i) => (
                  <option key={i} value={i}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={`${formId}-endpoint`}>API 地址</label>
              <input
                id={`${formId}-endpoint`}
                value={aiSettings.endpoint}
                onChange={(e) => setAISettings({ endpoint: e.target.value })}
                placeholder="https://api.deepseek.com/v1/chat/completions"
              />
            </div>
            <div className="form-group">
              <label htmlFor={`${formId}-api-key`}>API Key</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id={`${formId}-api-key`}
                  type="password"
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  placeholder={aiConfigured ? '已安全保存' : 'sk-...'}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="tag active"
                  onClick={() => void persistApiKey(apiKeyDraft)}
                  disabled={savingApiKey || !apiKeyDraft.trim()}
                  title="保存 API Key"
                >
                  <KeyRound size={14} /> 保存
                </button>
                {aiConfigured && (
                  <button
                    type="button"
                    className="tag"
                    onClick={() => void persistApiKey('')}
                    disabled={savingApiKey}
                    title="移除 API Key"
                    aria-label="移除 API Key"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="form-group">
              <label htmlFor={`${formId}-model`}>模型</label>
              {presetModels.length > 0 ? (
                <select
                  id={`${formId}-model`}
                  value={aiSettings.model}
                  onChange={(e) => setAISettings({ model: e.target.value })}
                >
                  {presetModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`${formId}-model`}
                  value={aiSettings.model}
                  onChange={(e) => setAISettings({ model: e.target.value })}
                  placeholder="deepseek-chat"
                />
              )}
              <button
                type="button"
                className="connection-test-button"
                onClick={() => void testConnection()}
                disabled={
                  connectionStatus === 'testing' ||
                  (!aiConfigured && !apiKeyDraft.trim()) ||
                  !aiSettings.endpoint ||
                  !aiSettings.model
                }
              >
                {connectionStatus === 'testing' ? '正在测试…' : '测试当前连接'}
              </button>
              {connectionMessage && (
                <p className={`onboarding-status ${connectionStatus}`} role="status">
                  {connectionMessage}
                </p>
              )}
              <div className="form-group">
                <div>
                  <input
                    id={`${formId}-web-search`}
                    type="checkbox"
                    checked={aiSettings.useWebSearch}
                    onChange={(e) => setAISettings({ useWebSearch: e.target.checked })}
                  />{' '}
                  <label htmlFor={`${formId}-web-search`}>联网搜索</label>
                </div>
                <span style={{ fontSize: 11, color: '#998', marginTop: 2 }}>
                  发送消息前搜索网络，用真实信息减少胡言乱语
                </span>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor={`${formId}-temperature`}>Temperature ({aiSettings.temperature})</label>
              <input
                id={`${formId}-temperature`}
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={aiSettings.temperature}
                onChange={(e) => setAISettings({ temperature: parseFloat(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label htmlFor={`${formId}-max-tokens`}>Max Tokens ({aiSettings.maxTokens})</label>
              <input
                id={`${formId}-max-tokens`}
                type="range"
                min={64}
                max={4096}
                step={64}
                value={aiSettings.maxTokens}
                onChange={(e) => setAISettings({ maxTokens: parseInt(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <div>
                <input
                  id={`${formId}-auto-progress`}
                  type="checkbox"
                  checked={aiSettings.autoProgress}
                  onChange={(e) => setAISettings({ autoProgress: e.target.checked })}
                />{' '}
                <label htmlFor={`${formId}-auto-progress`}>自动推进关系阶段</label>
              </div>
              <span style={{ fontSize: 11, color: '#998', marginTop: 2 }}>
                每 {aiSettings.evalInterval} 条消息评估一次，由 AI 判断关系阶段
              </span>
            </div>
            {aiSettings.autoProgress && (
              <div className="form-group">
                <label htmlFor={`${formId}-eval-interval`}>评估间隔（条消息）</label>
                <input
                  id={`${formId}-eval-interval`}
                  type="number"
                  min={1}
                  max={100}
                  value={aiSettings.evalInterval}
                  onChange={(e) => setAISettings({ evalInterval: Math.max(1, parseInt(e.target.value) || 20) })}
                />
              </div>
            )}
          </div>
        )}
        {tab === 'memory' && (
          <div id={`${formId}-memory-panel`} role="tabpanel" aria-labelledby={`${formId}-memory-tab`}>
            <MemorySettings />
          </div>
        )}
        {tab === 'tts' && (
          <div
            id={`${formId}-tts-panel`}
            className="settings-section"
            role="tabpanel"
            aria-labelledby={`${formId}-tts-tab`}
          >
            <div className="form-group">
              <div>
                <input
                  id={`${formId}-tts-enabled`}
                  type="checkbox"
                  checked={ttsSettings.enabled}
                  onChange={(e) => setTTSSettings({ enabled: e.target.checked })}
                />{' '}
                <label htmlFor={`${formId}-tts-enabled`}>启用语音</label>
              </div>
            </div>
            <div className="form-group">
              <div>
                <input
                  id={`${formId}-tts-auto-play`}
                  type="checkbox"
                  checked={ttsSettings.autoPlay}
                  onChange={(e) => setTTSSettings({ autoPlay: e.target.checked })}
                />{' '}
                <label htmlFor={`${formId}-tts-auto-play`}>自动播放</label>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor={`${formId}-tts-rate`}>语速</label>
              <input
                id={`${formId}-tts-rate`}
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={ttsSettings.rate}
                onChange={(e) => setTTSSettings({ rate: parseFloat(e.target.value) })}
              />
              <span style={{ marginLeft: 8 }}>{ttsSettings.rate}</span>
            </div>
            <div className="form-group">
              <label htmlFor={`${formId}-tts-pitch`}>音调</label>
              <input
                id={`${formId}-tts-pitch`}
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={ttsSettings.pitch}
                onChange={(e) => setTTSSettings({ pitch: parseFloat(e.target.value) })}
              />
              <span style={{ marginLeft: 8 }}>{ttsSettings.pitch}</span>
            </div>
            <div className="form-group">
              <label htmlFor={`${formId}-tts-voice`}>语音包</label>
              <select
                id={`${formId}-tts-voice`}
                value={ttsSettings.voiceURI}
                onChange={(e) => setTTSSettings({ voiceURI: e.target.value })}
              >
                <option value="">自动</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {tab === 'theme' && (
          <div
            id={`${formId}-theme-panel`}
            className="settings-section"
            role="tabpanel"
            aria-labelledby={`${formId}-theme-tab`}
          >
            <div className="form-group">
              <label htmlFor={`${formId}-theme-preset`}>预设主题</label>
              <select
                id={`${formId}-theme-preset`}
                value={themePresetIndex}
                onChange={(e) => {
                  const i = parseInt(e.target.value)
                  applyThemePreset(i)
                }}
              >
                {THEME_PRESETS.map((p, i) => (
                  <option key={i} value={i}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {themePresetIndex === THEME_PRESETS.length - 1 && (
              <>
                {(
                  [
                    ['主色调', 'primary'],
                    ['背景色', 'bg'],
                    ['聊天区背景', 'chatBg'],
                    ['用户气泡', 'userBubble'],
                    ['AI 气泡', 'aiBubble'],
                    ['文字色', 'text'],
                    ['副文字色', 'subText'],
                  ] as const
                ).map(([label, key]) => (
                  <div className="form-group" key={key}>
                    <label htmlFor={`${formId}-theme-${key}`}>{label}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        aria-hidden="true"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          background: theme[key],
                          border: '2px solid rgba(0,0,0,0.15)',
                          flexShrink: 0,
                        }}
                      />
                      <input
                        id={`${formId}-theme-${key}`}
                        value={theme[key]}
                        onChange={(e) => setTheme({ ...theme, [key]: e.target.value })}
                        placeholder="#e896b0"
                        style={{ flex: 1 }}
                      />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        {tab === 'data' && (
          <div
            id={`${formId}-data-panel`}
            className="settings-section"
            role="tabpanel"
            aria-labelledby={`${formId}-data-tab`}
          >
            <DataSettings idPrefix={`${formId}-data`} />
          </div>
        )}
        {tab === 'about' && (
          <div
            id={`${formId}-about-panel`}
            className="settings-section"
            role="tabpanel"
            aria-labelledby={`${formId}-about-tab`}
            style={{ textAlign: 'center', padding: 24 }}
          >
            <h3>灵伴 SoulMate v{__APP_VERSION__}</h3>
            <p style={{ marginTop: 8, color: '#999' }}>Tauri 2 + React 19 + Rust</p>
            <p style={{ marginTop: 4, color: '#999' }}>AI 女友陪伴 · 桌面伴侣</p>
          </div>
        )}
      </div>
    </Dialog>
  )
}
