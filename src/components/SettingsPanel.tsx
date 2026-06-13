import React, { useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { API_PRESETS, LIVE2D_MODELS } from '../types'
import { getVoices } from '../services/ttsService'

interface Props {
  onClose: () => void
}

export const SettingsPanel: React.FC<Props> = ({ onClose }) => {
  const { aiSettings, ttsSettings, live2dModelIndex, setAISettings, setTTSSettings, applyPreset, setLive2dModelIndex } = useSettingsStore()
  const [presetIndex, setPresetIndex] = React.useState(() => {
    const idx = API_PRESETS.findIndex(p => p.endpoint === aiSettings.endpoint)
    return idx >= 0 ? idx : API_PRESETS.length - 1
  })
  const [tab, setTab] = React.useState<'ai' | 'tts' | 'about'>('ai')
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    const load = () => setVoices(getVoices())
    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => { window.speechSynthesis.onvoiceschanged = null }
  }, [])

  const testTTS = () => {
    const utterance = new SpeechSynthesisUtterance('哥哥你好呀，我是灵伴~')
    const voice = voices.find(v => v.voiceURI === ttsSettings.voiceURI)
    if (voice) utterance.voice = voice
    utterance.rate = ttsSettings.rate
    utterance.pitch = ttsSettings.pitch
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  const isCustom = presetIndex >= API_PRESETS.length - 1

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-tabs">
          <button className={`tab-btn ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>AI 对话</button>
          <button className={`tab-btn ${tab === 'tts' ? 'active' : ''}`} onClick={() => setTab('tts')}>语音</button>
          <button className={`tab-btn ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>关于</button>
        </div>

        <div className="settings-body">
          {tab === 'ai' && (
            <div className="settings-section">
              <div className="form-group">
                <label>Live2D 模型</label>
                <select
                  value={live2dModelIndex}
                  onChange={e => setLive2dModelIndex(parseInt(e.target.value))}
                >
                  {LIVE2D_MODELS.map((m, i) => (
                    <option key={i} value={i}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>API 服务商</label>
                <select
                  value={presetIndex}
                  onChange={e => {
                    const idx = parseInt(e.target.value)
                    setPresetIndex(idx)
                    applyPreset(idx)
                  }}
                >
                  {API_PRESETS.map((p, i) => (
                    <option key={i} value={i}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>API 密钥 (Key)</label>
                <input
                  type="password"
                  placeholder="sk-xxxxxxxxxxxxxxxx"
                  value={aiSettings.apiKey}
                  onChange={e => setAISettings({ apiKey: e.target.value })}
                />
              </div>

              {isCustom && (
                <div className="form-group">
                  <label>API 接口地址</label>
                  <input
                    placeholder="https://api.openai.com/v1/chat/completions"
                    value={aiSettings.endpoint}
                    onChange={e => setAISettings({ endpoint: e.target.value })}
                  />
                </div>
              )}

              <div className="form-group">
                <label>模型</label>
                <input
                  className="model-input"
                  placeholder="输入模型名或选择推荐"
                  value={aiSettings.model}
                  onChange={e => setAISettings({ model: e.target.value })}
                  list="model-list"
                />
                <datalist id="model-list">
                  {API_PRESETS.flatMap(p => p.models).map(m => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <div className="model-tags">
                  {API_PRESETS[presetIndex].models.map(m => (
                    <button
                      key={m}
                      className={`tag ${aiSettings.model === m ? 'active' : ''}`}
                      onClick={() => setAISettings({ model: m })}
                    >
                      {m.length > 25 ? m.slice(-20) : m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group half">
                  <label>温度: {aiSettings.temperature}</label>
                  <input
                    type="range" min="0" max="2" step="0.05"
                    value={aiSettings.temperature}
                    onChange={e => setAISettings({ temperature: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="form-group half">
                  <label>最大长度: {aiSettings.maxTokens}</label>
                  <input
                    type="range" min="64" max="1024" step="32"
                    value={aiSettings.maxTokens}
                    onChange={e => setAISettings({ maxTokens: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          )}

          {tab === 'tts' && (
            <div className="settings-section">
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={ttsSettings.enabled}
                    onChange={e => setTTSSettings({ enabled: e.target.checked })}
                  />
                  启用语音合成
                </label>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={ttsSettings.autoPlay}
                    onChange={e => setTTSSettings({ autoPlay: e.target.checked })}
                    disabled={!ttsSettings.enabled}
                  />
                  自动朗读 AI 回复
                </label>
              </div>

              <div className="form-group">
                <label>语音</label>
                <select
                  value={ttsSettings.voiceURI}
                  onChange={e => setTTSSettings({ voiceURI: e.target.value })}
                  disabled={!ttsSettings.enabled}
                >
                  <option value="">自动选择</option>
                  {voices.filter(v => v.lang.startsWith('zh')).map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                  ))}
                  {voices.filter(v => !v.lang.startsWith('zh')).map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>语速: {ttsSettings.rate.toFixed(1)}</label>
                <input
                  type="range" min="0.5" max="2" step="0.1"
                  value={ttsSettings.rate}
                  onChange={e => setTTSSettings({ rate: parseFloat(e.target.value) })}
                  disabled={!ttsSettings.enabled}
                />
              </div>

              <div className="form-group">
                <label>音调: {ttsSettings.pitch.toFixed(1)}</label>
                <input
                  type="range" min="0.5" max="2" step="0.1"
                  value={ttsSettings.pitch}
                  onChange={e => setTTSSettings({ pitch: parseFloat(e.target.value) })}
                  disabled={!ttsSettings.enabled}
                />
              </div>

              <button
                className="tts-test-btn"
                onClick={testTTS}
                disabled={!ttsSettings.enabled}
              >
                测试语音效果
              </button>
            </div>
          )}

          {tab === 'about' && (
            <div className="settings-section about-section">
              <div className="about-emoji">🌸</div>
              <h3>灵伴 SoulMate</h3>
              <p>版本 2.0</p>
              <div className="about-features">
                <div className="feature-item">
                  <span>💬</span> AI 对话 —— 支持通用 API 接口
                </div>
                <div className="feature-item">
                  <span>🎭</span> 虚拟角色形象 —— 实时表情变化，可自定义人设
                </div>
                <div className="feature-item">
                  <span>🔊</span> 语音合成 —— 自动朗读回复
                </div>
                <div className="feature-item">
                  <span>🔒</span> 数据本地存储 —— 信息仅保存在你的电脑
                </div>
                <div className="feature-item">
                  <span>🎨</span> 可定制外观 —— 调整发色/瞳色/性格/关系
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
