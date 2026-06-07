import React, { useState } from 'react'

interface Props {
  onSend: (text: string) => void
  onVoiceInput: (text: string) => void
  disabled: boolean
}

export const ChatInput: React.FC<Props> = ({ onSend, onVoiceInput, disabled }) => {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const recognitionRef = React.useRef<any>(null)

  const handleSend = () => {
    const trimmed = text.trim()
    if (trimmed && !disabled) {
      onSend(trimmed)
      setText('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const startVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      if (transcript.trim()) {
        onVoiceInput(transcript.trim())
      }
      setRecording(false)
    }

    recognition.onerror = () => setRecording(false)
    recognition.onend = () => setRecording(false)

    recognitionRef.current = recognition
    recognition.start()
    setRecording(true)
  }

  const stopVoice = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setRecording(false)
  }

  return (
    <div className="chat-input-area">
      <button
        className={`voice-btn ${recording ? 'recording' : ''}`}
        onClick={recording ? stopVoice : startVoice}
        disabled={disabled && !recording}
        title="语音输入"
      >
        {recording ? '⏹️' : '🎤'}
      </button>
      <input
        className="chat-input"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={recording ? '正在聆听...' : '输入你想说的话...'}
        disabled={disabled || recording}
      />
      <button
        className="send-btn"
        onClick={handleSend}
        disabled={disabled || recording || !text.trim()}
      >
        发送
      </button>
    </div>
  )
}
