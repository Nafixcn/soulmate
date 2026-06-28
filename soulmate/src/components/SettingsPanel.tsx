import React, { useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { API_PRESETS } from '../types'
import { getVoices } from '../services/ttsService'
import { X, Bot, Volume2, Info } from 'lucide-react'

interface Props { onClose: () => void }

export const SettingsPanel: React.FC<Props> = ({ onClose }) => {
  const { aiSettings, ttsSettings, setAISettings, setTTSSettings, applyPreset } = useSettingsStore()
  const [tab, setTab] = React.useState<'ai' | 'tts' | 'about'>('ai')
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([])
  const presetIndex = API_PRESETS.findIndex(p => p.endpoint === aiSettings.endpoint)
  const isCustom = presetIndex < 0 || presetIndex >= API_PRESETS.length - 1
  const presetModels = isCustom ? [] : (API_PRESETS[presetIndex]?.models || [])

  useEffect(() => {
    const load = () => setVoices(getVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => { window.speechSynthesis.removeEventListener('voiceschanged', load) }
  }, [])

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="settings-tabs">
          <button className={`tab-btn ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>
            <Bot size={14} /> AI
          </button>
          <button className={`tab-btn ${tab === 'tts' ? 'active' : ''}`} onClick={() => setTab('tts')}>
            <Volume2 size={14} /> 语音
          </button>
          <button className={`tab-btn ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>
            <Info size={14} /> 关于
          </button>
        </div>
        <div className="settings-body">
          {tab === 'ai' && (
            <div className="settings-section">
              <div className="form-group">
                <label>API 服务商</label>
                <select value={isCustom ? API_PRESETS.length - 1 : presetIndex}
                  onChange={e => { const i = parseInt(e.target.value); i < API_PRESETS.length - 1 ? applyPreset(i) : setAISettings({ endpoint: '' }) }}>
                  {API_PRESETS.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>API 地址</label>
                <input value={aiSettings.endpoint} onChange={e => setAISettings({ endpoint: e.target.value })} placeholder="https://api.deepseek.com/v1/chat/completions" />
              </div>
              <div className="form-group">
                <label>API Key</label>
                <input type="password" value={aiSettings.apiKey} onChange={e => setAISettings({ apiKey: e.target.value })} placeholder="sk-..." />
              </div>
              <div className="form-group">
                <label>模型</label>
                {presetModels.length > 0 ? (
                  <select value={aiSettings.model} onChange={e => setAISettings({ model: e.target.value })}>
                    {presetModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input value={aiSettings.model} onChange={e => setAISettings({ model: e.target.value })} placeholder="deepseek-chat" />
                )}
              </div>
              <div className="form-group">
                <label>Temperature ({aiSettings.temperature})</label>
                <input type="range" min={0} max={2} step={0.05} value={aiSettings.temperature}
                  onChange={e => setAISettings({ temperature: parseFloat(e.target.value) })} />
              </div>
              <div className="form-group">
                <label>Max Tokens ({aiSettings.maxTokens})</label>
                <input type="range" min={64} max={4096} step={64} value={aiSettings.maxTokens}
                  onChange={e => setAISettings({ maxTokens: parseInt(e.target.value) })} />
              </div>
              <div className="form-group">
                <label>
                  <input type="checkbox" checked={aiSettings.autoProgress} onChange={e => setAISettings({ autoProgress: e.target.checked })} />
                  {' '}自动推进关系阶段
                </label>
                <span style={{ fontSize: 11, color: '#998', marginTop: 2 }}>每 20 条消息评估一次，由 AI 判断关系阶段</span>
              </div>
            </div>
          )}
          {tab === 'tts' && (
            <div className="settings-section">
              <div className="form-group">
                <label><input type="checkbox" checked={ttsSettings.enabled} onChange={e => setTTSSettings({ enabled: e.target.checked })} /> 启用语音</label>
              </div>
              <div className="form-group">
                <label><input type="checkbox" checked={ttsSettings.autoPlay} onChange={e => setTTSSettings({ autoPlay: e.target.checked })} /> 自动播放</label>
              </div>
              <div className="form-group">
                <label>语速</label>
                <input type="range" min={0.5} max={2} step={0.1} value={ttsSettings.rate} onChange={e => setTTSSettings({ rate: parseFloat(e.target.value) })} />
                <span style={{ marginLeft: 8 }}>{ttsSettings.rate}</span>
              </div>
              <div className="form-group">
                <label>音调</label>
                <input type="range" min={0.5} max={2} step={0.1} value={ttsSettings.pitch} onChange={e => setTTSSettings({ pitch: parseFloat(e.target.value) })} />
                <span style={{ marginLeft: 8 }}>{ttsSettings.pitch}</span>
              </div>
              <div className="form-group">
                <label>语音包</label>
                <select value={ttsSettings.voiceURI} onChange={e => setTTSSettings({ voiceURI: e.target.value })}>
                  <option value="">自动</option>
                  {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                </select>
              </div>
            </div>
          )}
          {tab === 'about' && (
            <div className="settings-section" style={{ textAlign: 'center', padding: 24 }}>
              <h3>灵伴 SoulMate v2.0</h3>
              <p style={{ marginTop: 8, color: '#999' }}>Tauri 2 + React 19 + Rust</p>
              <p style={{ marginTop: 4, color: '#999' }}>AI 女友陪伴 · 桌面伴侣</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
