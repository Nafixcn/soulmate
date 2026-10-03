export interface AppErrorPayload {
  code?: string
  userMessage?: string
  retryable?: boolean
}

export function toUserMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  const payload = asPayload(error)
  if (payload?.userMessage) return payload.userMessage

  const message = rawErrorMessage(error)
  if (/\b(401|403)\b|unauthorized|forbidden|invalid.*(?:key|token)/i.test(message)) {
    return '身份验证失败，请检查 API Key 是否正确或已过期'
  }
  if (/\b429\b|rate.?limit|too many requests/i.test(message)) {
    return '请求有点频繁，模型服务正在限流，请稍后再试'
  }
  if (/timeout|timed out|deadline/i.test(message)) {
    return '模型响应超时，请检查网络或稍后再试'
  }
  if (/connect|connection|dns|network|error sending request/i.test(message)) {
    return '暂时连接不到模型服务，请检查网络和 API 地址'
  }
  if (/API 端点|endpoint|invalid url/i.test(message)) return 'API 地址无效，请在模型设置中检查'
  if (/keyring|钥匙串/i.test(message)) return '无法访问系统钥匙串，请稍后重试或检查系统权限'
  return message && message !== '[object Object]' ? message : fallback
}

export function isRetryableError(error: unknown): boolean {
  const payload = asPayload(error)
  if (typeof payload?.retryable === 'boolean') return payload.retryable
  const message = rawErrorMessage(error)
  return !/\b(400|401|403|404|422)\b|unauthorized|forbidden|API 端点|invalid.*(?:key|token|url)/i.test(message)
}

function asPayload(error: unknown): AppErrorPayload | null {
  if (!error || typeof error !== 'object') return null
  return error as AppErrorPayload
}

function rawErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return ''
}
