import { describe, expect, it } from 'vitest'
import { buildChatTranscript } from './chatExport'

describe('buildChatTranscript', () => {
  it('labels participants and includes the export time', () => {
    const transcript = buildChatTranscript(
      [
        { id: '1', role: 'user', content: '你好', timestamp: 0 },
        { id: '2', role: 'assistant', content: '你好呀', timestamp: 1000 },
      ],
      '灵伴',
      new Date(2000),
    )

    expect(transcript).toContain('# 与灵伴的聊天记录')
    expect(transcript).toContain('我：你好')
    expect(transcript).toContain('灵伴：你好呀')
    expect(transcript).toContain(new Date(2000).toLocaleString('zh-CN'))
  })
})
