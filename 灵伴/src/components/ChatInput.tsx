import React, { useState, useRef } from 'react'
import { Mic, MicOff, Send } from 'lucide-react'

interface Props {
  onSend: (text: string) => void
  onVoiceInput: (text: string) => void
  disabled: boolean
}

export const ChatInput: React.FC<Props> = ({ onSend, onVoiceInput, disabled }) => {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const handleSend = () => {
    const trimmed = text.trim()
    if (trimmed && !disabled) { onSend(trimmed); setText('') }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.lang = 'zh-CN'; recognition.continuous = false; recognition.interimResults = false
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript
      if (transcript.trim()) onVoiceInput(transcript.trim())
      setRecording(false)
    }
    recognition.onerror = () => { console.warn('Speech error'); setRecording(false) }
    recognition.onend = () => setRecording(false)
    recognitionRef.current = recognition
    recognition.start(); setRecording(true)
  }

  const stopVoice = () => { recognitionRef.current?.stop(); setRecording(false) }

  return (
    <div className="chat-input-area">
      <button className={`voice-btn ${recording ? 'recording' : ''}`} onClick={recording ? stopVoice : startVoice} disabled={disabled && !recording} title="语音">
        {recording ? <MicOff size={16} /> : <Mic size={16} />}
      </button>
      <input className="chat-input" value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown}
        placeholder={recording ? '聆听中...' : '输入消息...'} disabled={disabled || recording} />
      <button className="send-btn" onClick={handleSend} disabled={disabled || recording || !text.trim()}>
        <Send size={16} />
      </button>
    </div>
  )
}
