import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Send } from 'lucide-react'

interface Props {
  onSend: (text: string) => Promise<boolean>
  disabled: boolean
}

export const ChatInput: React.FC<Props> = ({ onSend, disabled }) => {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)
  const compositionFrameRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (compositionFrameRef.current !== null) cancelAnimationFrame(compositionFrameRef.current)
    },
    [],
  )

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`
  }, [text])

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (trimmed && !disabled) {
      void onSend(trimmed).then((saved) => {
        if (!saved) setText((current) => current || trimmed)
      })
      setText('')
    }
  }, [text, disabled, onSend])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // WebKit may report isComposing=false for the Enter that confirms a candidate.
    if (composingRef.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-input-area">
      <textarea
        ref={textareaRef}
        className="chat-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          if (compositionFrameRef.current !== null) cancelAnimationFrame(compositionFrameRef.current)
          composingRef.current = true
        }}
        onCompositionEnd={() => {
          compositionFrameRef.current = requestAnimationFrame(() => {
            composingRef.current = false
            compositionFrameRef.current = null
          })
        }}
        placeholder="输入消息..."
        aria-label="消息内容"
        disabled={disabled}
        rows={1}
      />
      <button
        type="button"
        className="send-btn"
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        aria-label="发送消息"
      >
        <Send size={16} />
      </button>
    </div>
  )
}
