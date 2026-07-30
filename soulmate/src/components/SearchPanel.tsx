import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Message } from '../types'
import { conversationGateway } from '../services/conversationGateway'
import { X, Search } from 'lucide-react'

interface Props {
  personaId: string
  onClose: () => void
  onScrollTo: (messageId: string) => Promise<boolean>
}

export const SearchPanel: React.FC<Props> = ({ personaId, onClose, onScrollTo }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Message[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const requestSequenceRef = useRef(0)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(
    async (q: string) => {
      const requestSequence = ++requestSequenceRef.current
      if (!q.trim()) {
        setResults([])
        return
      }
      setSearching(true)
      try {
        const msgs = await conversationGateway.searchMessages(personaId, q)
        if (requestSequence === requestSequenceRef.current) setResults(msgs)
      } catch (e) {
        console.error('Search failed:', e)
      } finally {
        if (requestSequence === requestSequenceRef.current) setSearching(false)
      }
    },
    [personaId],
  )

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(query), 250)
    return () => clearTimeout(timerRef.current)
  }, [query, doSearch])

  return (
    <div className="search-panel">
      <div className="search-input-wrapper">
        <Search size={14} className="search-icon" />
        <input
          ref={inputRef}
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索消息..."
          aria-label="搜索聊天消息"
        />
        <button type="button" className="search-close" onClick={onClose} aria-label="关闭消息搜索">
          <X size={14} />
        </button>
      </div>
      {searching && results.length === 0 && (
        <div className="search-empty" role="status" aria-live="polite">
          搜索中...
        </div>
      )}
      {results.length > 0 && (
        <div className="search-results" aria-label="搜索结果">
          {results.map((msg) => (
            <button
              type="button"
              key={msg.id}
              className="search-result-item"
              onClick={() => {
                void onScrollTo(msg.id).then((revealed) => {
                  if (revealed) onClose()
                })
              }}
            >
              <span className={`search-result-role ${msg.role}`}>{msg.role === 'user' ? '我' : 'TA'}</span>
              <span className="search-result-content">{highlightMatch(msg.content, query)}</span>
              <span className="search-result-time">{formatTime(msg.timestamp)}</span>
            </button>
          ))}
        </div>
      )}
      {!searching && query && results.length === 0 && (
        <div className="search-empty" role="status" aria-live="polite">
          没有找到匹配的消息
        </div>
      )}
    </div>
  )
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <span className="search-highlight">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
