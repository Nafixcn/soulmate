import type { Message } from '../types'

export function buildChatTranscript(messages: Message[], personaName: string, exportedAt = new Date()): string {
  const lines = messages.map((message) => {
    const time = new Date(message.timestamp).toLocaleString('zh-CN')
    const sender = message.role === 'user' ? '我' : personaName
    return `[${time}] ${sender}：${message.content}`
  })

  return `# 与${personaName}的聊天记录\n\n导出时间：${exportedAt.toLocaleString('zh-CN')}\n\n---\n\n${lines.join('\n\n')}`
}

export function downloadChatTranscript(messages: Message[], personaName: string): void {
  const exportedAt = new Date()
  const content = buildChatTranscript(messages, personaName, exportedAt)
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = `soulmate-chat-${exportedAt.getTime()}.md`
  anchor.click()
  URL.revokeObjectURL(url)
}
