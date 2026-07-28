import { mockIPC } from '@tauri-apps/api/mocks'
import type { AiChunk, Message, MessagePage } from '../types'

const historicalMessages: Message[] = [
  { id: 'old-message', role: 'user', content: '记得那场电影吗', timestamp: 1 },
  { id: 'old-reply', role: 'assistant', content: '当然记得呀', timestamp: 2 },
]

function page(messages: Message[], hasMore = false): MessagePage {
  return {
    messages,
    hasMore,
    userMessageCount: messages.filter((message) => message.role === 'user').length,
  }
}

export function setupTauriMock(): void {
  let settingsJson: string | null = null
  let apiConfigured = false

  mockIPC((command, payload = {}) => {
    const args = payload as Record<string, unknown>
    switch (command) {
      case 'get_settings':
        return settingsJson
      case 'save_settings':
        settingsJson = args.settingsJson as string
        return null
      case 'has_api_key':
        return apiConfigured
      case 'save_api_key':
        apiConfigured = Boolean(args.apiKey)
        return null
      case 'get_messages':
        return page([])
      case 'search_messages':
        return historicalMessages.slice(0, 1)
      case 'get_messages_from':
        return page(historicalMessages)
      case 'get_all_messages':
        return historicalMessages
      case 'save_message':
        return null
      case 'send_message': {
        const channel = args.onChunk as { onmessage: (chunk: AiChunk) => void }
        queueMicrotask(() => {
          channel.onmessage({ content: '这是来自测试模型的回复', thinking: '', done: false })
          channel.onmessage({ content: '', thinking: '', done: true })
        })
        return null
      }
      case 'clear_messages':
      case 'delete_persona':
        return null
      case 'delete_messages_from':
        return 0
      case 'plugin:store|load':
        return 1
      case 'plugin:store|get':
        return [null, false]
      case 'plugin:store|delete':
        return false
      case 'plugin:store|save':
        return null
      default:
        throw new Error(`Unhandled Tauri command in E2E test: ${command}`)
    }
  })
}
