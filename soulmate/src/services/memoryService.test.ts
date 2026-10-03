import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AISettings, Memory, Message } from '../types'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))

import { memoryService } from './memoryService'

const settings: AISettings = {
  endpoint: 'https://example.com/v1/chat',
  model: 'test',
  temperature: 0.6,
  maxTokens: 512,
  autoProgress: false,
  evalInterval: 20,
  useWebSearch: false,
}

const disabledMemory: Memory = {
  id: 'disabled',
  personaId: 'persona-1',
  category: 'preference',
  content: '用户喜欢爵士音乐',
  confidence: 0.9,
  pinned: false,
  enabled: false,
  createdAt: 1,
  updatedAt: 1,
}

const userMessage: Message = { id: 'user-1', role: 'user', content: '我喜欢爵士音乐', timestamp: 1 }

describe('memory extraction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not relearn a disabled memory from a similar candidate', async () => {
    mocks.invoke.mockImplementation((command: string) => {
      if (command === 'extract_memories') {
        return Promise.resolve([{ category: 'preference', content: '用户喜欢爵士音乐', confidence: 0.95 }])
      }
      if (command === 'get_memory_snapshot') return Promise.resolve({ memories: [disabledMemory], revision: 1 })
      throw new Error(`unexpected command: ${command}`)
    })

    await expect(memoryService.extract('persona-1', settings, [userMessage])).resolves.toEqual([])
    expect(mocks.invoke).not.toHaveBeenCalledWith('apply_extracted_memories', expect.anything())
  })

  it.each(['disable', 'delete', 'correct'] as const)(
    'preserves a manual %s while the model is still extracting memories',
    async (operation) => {
      let stored: Memory[] = [{ ...disabledMemory, enabled: true }]
      let revision = 1
      let finishExtraction: ((value: unknown) => void) | undefined
      mocks.invoke.mockImplementation((command: string, args: Record<string, unknown>) => {
        if (command === 'get_memory_snapshot') return Promise.resolve({ memories: [...stored], revision })
        if (command === 'list_memories') return Promise.resolve([...stored])
        if (command === 'extract_memories') {
          return new Promise((resolve) => {
            finishExtraction = resolve
          })
        }
        if (command === 'upsert_memory') {
          const memory = args.memory as Memory
          stored = [memory]
          revision++
          return Promise.resolve(memory)
        }
        if (command === 'delete_memory') {
          stored = []
          revision++
          return Promise.resolve()
        }
        if (command === 'apply_extracted_memories') {
          if (args.expectedRevision !== revision) return Promise.resolve([])
          stored = args.memories as Memory[]
          revision++
          return Promise.resolve([...stored])
        }
        throw new Error(`unexpected command: ${command}`)
      })

      const extraction = memoryService.extract('persona-1', settings, [userMessage])
      await vi.waitFor(() => expect(finishExtraction).toBeTypeOf('function'))
      if (operation === 'delete') {
        await memoryService.remove('persona-1', disabledMemory.id)
      } else {
        await memoryService.save({
          ...disabledMemory,
          enabled: operation !== 'disable',
          content: operation === 'correct' ? '用户喜欢古典音乐，不喜欢爵士音乐' : disabledMemory.content,
          updatedAt: 2,
        })
      }
      const manuallyUpdated = structuredClone(stored)
      finishExtraction?.([{ category: 'preference', content: disabledMemory.content, confidence: 0.95 }])

      await expect(extraction).resolves.toEqual([])
      expect(stored).toEqual(manuallyUpdated)
    },
  )

  it('commits a deduplicated batch using the revision captured before extraction', async () => {
    mocks.invoke.mockImplementation((command: string, args: Record<string, unknown>) => {
      if (command === 'get_memory_snapshot') return Promise.resolve({ memories: [], revision: 7 })
      if (command === 'extract_memories') {
        return Promise.resolve([
          { category: 'preference', content: '用户喜欢爵士音乐', confidence: 0.9, sourceMessageId: 'user-1' },
          { category: 'preference', content: '用户喜欢爵士音乐', confidence: 0.95, sourceMessageId: 'invalid' },
        ])
      }
      if (command === 'apply_extracted_memories') return Promise.resolve(args.memories)
      throw new Error(`unexpected command: ${command}`)
    })

    const saved = await memoryService.extract('persona-1', settings, [userMessage])

    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ content: '用户喜欢爵士音乐', confidence: 0.95, sourceMessageId: 'user-1' })
    expect(mocks.invoke).toHaveBeenCalledWith('apply_extracted_memories', {
      personaId: 'persona-1',
      expectedRevision: 7,
      memories: saved,
    })
    expect(mocks.invoke).not.toHaveBeenCalledWith('upsert_memory', expect.anything())
  })

  it('discards extraction when the conversation or memory setting changes before the model returns', async () => {
    let current = true
    let finishExtraction: ((value: unknown) => void) | undefined
    mocks.invoke.mockImplementation((command: string) => {
      if (command === 'get_memory_snapshot') return Promise.resolve({ memories: [], revision: 1 })
      if (command === 'extract_memories') {
        return new Promise((resolve) => {
          finishExtraction = resolve
        })
      }
      throw new Error(`unexpected command: ${command}`)
    })
    const extraction = memoryService.extract('persona-1', settings, [userMessage], () => current)
    await vi.waitFor(() => expect(finishExtraction).toBeTypeOf('function'))
    current = false
    finishExtraction?.([{ category: 'preference', content: '用户喜欢爵士音乐', confidence: 0.9 }])

    await expect(extraction).resolves.toEqual([])
    expect(mocks.invoke).not.toHaveBeenCalledWith('apply_extracted_memories', expect.anything())
  })
})
