import React, { useState, useRef, useEffect } from 'react'
import { Message } from '../types'
import { X, Search } from 'lucide-react'

interface Props {
  messages: Message[]
  onClose: () => void
  onScrollTo: (timestamp: number) => void
}

export const SearchPanel: React.FC<Props> = ({ messages, onClose, onScrollTo }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Message[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const q = query.toLowerCase()
    const filtered = messages.filter(m => m.content.toLowerCase().includes(q)).slice(0, 50)
    setResults(filtered)
  }, [query, messages])

  return (
    <div className="search-panel">
      <div className="search-input-wrapper">
        <Search size={14} className="search-icon" />
        <input
          ref={inputRef}
          className="search-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索消息..."
        />
        <button className="search-close" onClick={onClose}><X size={14} /></button>
      </div>
      {results.length > 0 && (
        <div className="search-results">
          {results.map(msg => (
            <div key={msg.id} className="search-result-item" onClick={() => { onScrollTo(msg.timestamp); onClose() }}>
              <span className={`search-result-role ${msg.role}`}>{msg.role === 'user' ? '我' : 'TA'}</span>
              <span className="search-result-content">{highlightMatch(msg.content, query)}</span>
              <span className="search-result-time">{formatTime(msg.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
      {query && results.length === 0 && (
        <div className="search-empty">没有找到匹配的消息</div>
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
