import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Message } from '../types'
import { invoke } from '@tauri-apps/api/core'
import { X, Search } from 'lucide-react'

interface Props {
  personaId: string
  onClose: () => void
  onScrollTo: (messageId: string) => void
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
        const msgs = await invoke<Message[]>('search_messages', { personaId, query: q })
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
        />
        <button className="search-close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      {searching && results.length === 0 && <div className="search-empty">搜索中...</div>}
      {results.length > 0 && (
        <div className="search-results">
          {results.map((msg) => (
            <div
              key={msg.id}
              className="search-result-item"
              onClick={() => {
                onScrollTo(msg.id)
                onClose()
              }}
            >
              <span className={`search-result-role ${msg.role}`}>{msg.role === 'user' ? '我' : 'TA'}</span>
              <span className="search-result-content">{highlightMatch(msg.content, query)}</span>
              <span className="search-result-time">{formatTime(msg.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
      {!searching && query && results.length === 0 && <div className="search-empty">没有找到匹配的消息</div>}
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
