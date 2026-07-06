import { TTSSettings } from '../types'

let cachedVoices: SpeechSynthesisVoice[] = []

if (typeof window !== 'undefined') {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    cachedVoices = []
  })
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (cachedVoices.length > 0) return cachedVoices
  cachedVoices = window.speechSynthesis.getVoices()
  return cachedVoices
}

function findBestVoice(settings: TTSSettings): SpeechSynthesisVoice | null {
  const voices = getVoices()
  if (settings.voiceURI) {
    const exact = voices.find((v) => v.voiceURI === settings.voiceURI)
    if (exact) return exact
  }
  const zhVoices = voices.filter((v) => v.lang.startsWith('zh'))
  if (zhVoices.length > 0) return zhVoices[0]
  return voices[0] || null
}

export function speak(text: string, settings: TTSSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!settings.enabled || !text.trim()) {
      resolve()
      return
    }
    window.speechSynthesis.cancel()
    const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{2000}-\u{200F}]/gu, '')
    const utterance = new SpeechSynthesisUtterance(clean)
    const voice = findBestVoice(settings)
    if (voice) utterance.voice = voice
    utterance.rate = settings.rate
    utterance.pitch = settings.pitch
    utterance.volume = 1
    utterance.onend = () => resolve()
    utterance.onerror = (e) => {
      console.warn('TTS error:', e)
      reject(e)
    }
    window.speechSynthesis.speak(utterance)
  })
}

export function stopSpeaking() {
  window.speechSynthesis.cancel()
}
