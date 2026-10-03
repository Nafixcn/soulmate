import React from 'react'
import { ArrowLeft, ArrowRight, Check, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'
import { memoryService } from '../services/memoryService'
import { useSettingsStore } from '../store/settingsStore'
import { discoverLocalModels } from '../services/localModelService'
import { getModelDisplayName, getModelProvider, getModelProviderIndex, MODEL_PROVIDERS } from '../domain/modelProvider'
import { toUserMessage } from '../services/appError'

type ConnectionState = 'idle' | 'testing' | 'success' | 'error'

export const Onboarding: React.FC = () => {
  const {
    aiSettings,
    aiConfigured,
    applyPreset,
    setAISettings,
    setApiKey,
    userProfile,
    setUserProfile,
    persona,
    setPersona,
    completeOnboarding,
  } = useSettingsStore()
  const [step, setStep] = React.useState(0)
  const [apiKey, setApiKeyDraft] = React.useState('')
  const [connectionState, setConnectionState] = React.useState<ConnectionState>('idle')
  const [status, setStatus] = React.useState('')
  const [finishing, setFinishing] = React.useState(false)
  const [localModels, setLocalModels] = React.useState<string[]>([])
  const presetIndex = getModelProviderIndex(aiSettings.endpoint)
  const currentPreset = getModelProvider(aiSettings.endpoint)
  const localProvider = currentPreset.localProvider
  const canContinueProfile =
    userProfile.name.trim().length > 0 &&
    userProfile.preferredAddress.trim().length > 0 &&
    persona.name.trim().length > 0

  const testConnection = async () => {
    setConnectionState('testing')
    setStatus('正在验证钥匙串和模型连接…')
    if (!localProvider && apiKey.trim() && !(await setApiKey(apiKey))) {
      setConnectionState('error')
      setStatus('API Key 无法写入系统钥匙串')
      return
    }
    if (!localProvider && !aiConfigured && !apiKey.trim()) {
      setConnectionState('error')
      setStatus('请先输入 API Key')
      return
    }
    try {
      await memoryService.testConnection(aiSettings)
      setApiKeyDraft('')
      setConnectionState('success')
      setStatus('连接成功，可以开始聊天')
    } catch (error) {
      setConnectionState('error')
      setStatus(toUserMessage(error, '连接失败，请检查模型设置'))
    }
  }

  const refreshLocalModels = async () => {
    if (!localProvider) return
    setConnectionState('testing')
    setStatus('正在发现本地模型…')
    try {
      const models = await discoverLocalModels(localProvider)
      setLocalModels(models)
      if (!models.includes(aiSettings.model)) setAISettings({ model: models[0] })
      setConnectionState('idle')
      setStatus(`已发现 ${models.length} 个模型，请测试连接`)
    } catch (error) {
      setConnectionState('error')
      setStatus(toUserMessage(error, '没有发现可用的本地模型'))
    }
  }

  const finish = async () => {
    setFinishing(true)
    if (!(await completeOnboarding())) {
      setStatus('首次设置保存失败，请重试')
      setFinishing(false)
    }
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-panel" aria-labelledby="onboarding-title">
        <div className="onboarding-progress" aria-label={`首次设置，第 ${step + 1} 步，共 3 步`}>
          {[0, 1, 2].map((index) => (
            <span key={index} className={index <= step ? 'active' : ''} />
          ))}
        </div>

        {step === 0 && (
          <div className="onboarding-step">
            <div className="onboarding-icon">
              <ShieldCheck aria-hidden="true" />
            </div>
            <p className="onboarding-kicker">欢迎使用灵伴</p>
            <h1 id="onboarding-title">你的对话，由你掌控</h1>
            <p>
              角色、记忆与聊天记录保存在本机；API Key
              进入系统钥匙串。生成回复时，近期对话和相关记忆会发送给你选择的模型服务商。
            </p>
            <div className="onboarding-facts">
              <span>
                <Check size={16} /> 无自有云端账户或遥测
              </span>
              <span>
                <Check size={16} /> 记忆可查看、固定和删除
              </span>
              <span>
                <Check size={16} /> 可随时导出完整备份
              </span>
            </div>
            <button type="button" className="primary-action" onClick={() => setStep(1)}>
              开始设置 <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 1 && (
          <form
            className="onboarding-step onboarding-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (canContinueProfile) setStep(2)
            }}
          >
            <div className="onboarding-icon">
              <Sparkles aria-hidden="true" />
            </div>
            <p className="onboarding-kicker">彼此认识</p>
            <h1 id="onboarding-title">先确定怎么相处</h1>
            <div className="onboarding-grid">
              <label>
                你的名字
                <input
                  value={userProfile.name}
                  onChange={(event) => setUserProfile({ name: event.target.value })}
                  placeholder="例如：小航"
                  maxLength={40}
                  required
                />
              </label>
              <label>
                希望她怎么称呼你
                <input
                  value={userProfile.preferredAddress}
                  onChange={(event) => setUserProfile({ preferredAddress: event.target.value })}
                  placeholder="例如：阿航"
                  maxLength={40}
                  required
                />
              </label>
              <label>
                她的名字
                <input
                  value={persona.name}
                  onChange={(event) => setPersona({ ...persona, name: event.target.value })}
                  maxLength={40}
                  required
                />
              </label>
              <label>
                关系称呼
                <input
                  value={userProfile.relationshipLabel}
                  onChange={(event) => setUserProfile({ relationshipLabel: event.target.value })}
                  placeholder="伴侣、朋友、知己"
                  maxLength={40}
                />
              </label>
            </div>
            <label>
              你的兴趣
              <input
                value={userProfile.interests}
                onChange={(event) => setUserProfile({ interests: event.target.value })}
                placeholder="音乐、电影、旅行…"
                maxLength={200}
              />
            </label>
            <label>
              交流边界
              <textarea
                value={userProfile.boundaries}
                onChange={(event) => setUserProfile({ boundaries: event.target.value })}
                placeholder="例如：不要催促回复，不讨论工作压力"
                maxLength={300}
                rows={3}
              />
            </label>
            <div className="onboarding-actions">
              <button type="button" className="secondary-action" onClick={() => setStep(0)}>
                <ArrowLeft size={18} /> 返回
              </button>
              <button type="submit" className="primary-action" disabled={!canContinueProfile}>
                下一步 <ArrowRight size={18} />
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="onboarding-step onboarding-form">
            <div className="onboarding-icon">
              <KeyRound aria-hidden="true" />
            </div>
            <p className="onboarding-kicker">连接模型</p>
            <h1 id="onboarding-title">验证一次，再开始聊天</h1>
            <label>
              模型服务商
              <select
                value={presetIndex}
                onChange={(event) => {
                  applyPreset(Number(event.target.value))
                  setConnectionState('idle')
                }}
              >
                {MODEL_PROVIDERS.map((preset, index) => (
                  <option key={preset.name} value={index}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
            {currentPreset.id === 'custom' && (
              <label>
                API 地址
                <input
                  value={aiSettings.endpoint}
                  onChange={(event) => setAISettings({ endpoint: event.target.value })}
                  placeholder="https://example.com/v1/chat/completions"
                />
              </label>
            )}
            <label>
              模型
              {(localProvider ? localModels : currentPreset.models).length > 0 ? (
                <select value={aiSettings.model} onChange={(event) => setAISettings({ model: event.target.value })}>
                  {aiSettings.model &&
                    !(localProvider ? localModels : currentPreset.models).includes(aiSettings.model) && (
                      <option value={aiSettings.model}>当前保存的模型：{aiSettings.model}（不在推荐列表）</option>
                    )}
                  {(localProvider ? localModels : currentPreset.models).map((model) => (
                    <option key={model} value={model}>
                      {getModelDisplayName(model)}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={aiSettings.model} onChange={(event) => setAISettings({ model: event.target.value })} />
              )}
            </label>
            {localProvider && (
              <button
                type="button"
                className="connection-test-button"
                onClick={() => void refreshLocalModels()}
                disabled={connectionState === 'testing'}
              >
                发现本地模型
              </button>
            )}
            {!localProvider && (
              <label>
                API Key
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => {
                    setApiKeyDraft(event.target.value)
                    setConnectionState('idle')
                  }}
                  placeholder={aiConfigured ? '已安全保存，可直接测试' : '仅写入系统钥匙串'}
                  autoComplete="off"
                />
              </label>
            )}
            <button
              type="button"
              className="connection-test-button"
              onClick={() => void testConnection()}
              disabled={connectionState === 'testing' || !aiSettings.endpoint || !aiSettings.model}
            >
              {connectionState === 'testing' ? '正在测试…' : '测试连接'}
            </button>
            {status && (
              <p className={`onboarding-status ${connectionState}`} role="status">
                {status}
              </p>
            )}
            <div className="onboarding-actions">
              <button type="button" className="secondary-action" onClick={() => setStep(1)}>
                <ArrowLeft size={18} /> 返回
              </button>
              <button
                type="button"
                className="primary-action"
                disabled={connectionState !== 'success' || finishing}
                onClick={() => void finish()}
              >
                {finishing ? '正在保存…' : '进入灵伴'} <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
