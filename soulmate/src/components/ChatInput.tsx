import React, { useState, useRef } from 'react'
import { Mic, MicOff, Send } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'

interface Props {
  onSend: (text: string) => void
  disabled: boolean
}

export const ChatInput: React.FC<Props> = ({ onSend, disabled }) => {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const handleSend = () => {
    const trimmed = text.trim()
    if (trimmed && !disabled) { onSend(trimmed); setText('') }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const startVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm'
      const mr = new MediaRecorder(stream, { mimeType })
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
    } catch {
      // microphone not available
    }
  }

  const stopVoice = async () => {
    const mr = mediaRecorderRef.current
    if (!mr) return
    setRecording(false)
    setTranscribing(true)

    mr.onstop = async () => {
      mr.stream.getTracks().forEach(t => t.stop())
      mediaRecorderRef.current = null

      const blob = new Blob(chunksRef.current, { type: mr.mimeType })
      chunksRef.current = []
      const buf = await blob.arrayBuffer()
      const arr = Array.from(new Uint8Array(buf))

      try {
        const result = await invoke<string>('speech_to_text', { audio: arr })
        if (result.trim()) onSend(result.trim())
      } catch {
        // silent fail
      } finally {
        setTranscribing(false)
      }
    }

    mr.stop()
  }

  const handleVoiceClick = () => {
    if (recording) stopVoice()
    else if (!transcribing) startVoice()
  }

  return (
    <div className="chat-input-area">
      <button
        className={`voice-btn ${recording ? 'recording' : ''}`}
        onClick={handleVoiceClick}
        disabled={transcribing || (disabled && !recording)}
        title={recording ? '停止录音' : transcribing ? '识别中...' : '语音输入'}
      >
        {recording ? <MicOff size={16} /> : <Mic size={16} />}
      </button>
      <input
        className="chat-input"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={recording ? '录音中...' : transcribing ? '识别中...' : '输入消息...'}
        disabled={disabled || recording || transcribing}
      />
      <button
        className="send-btn"
        onClick={handleSend}
        disabled={disabled || recording || transcribing || !text.trim()}
      >
        <Send size={16} />
      </button>
    </div>
  )
}
