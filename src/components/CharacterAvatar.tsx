import React from 'react'
import { Expression, Persona } from '../types'

interface Props {
  expression: Expression
  persona: Persona
  isSpeaking: boolean
  isTyping: boolean
}

export const CharacterAvatar: React.FC<Props> = ({ expression, persona, isSpeaking, isTyping }) => {
  const hairMain = persona.hairColor || '#ff9fbf'
  const hairDark = adjustColor(hairMain, -20)
  const eyeColor = persona.eyeColor || '#ff6b9d'

  return (
    <div className="character-container">
      <div className={`character-wrapper expression-${expression} ${isSpeaking ? 'speaking' : ''} ${isTyping ? 'typing' : ''}`}>

        {/* Sparkles */}
        {expression === 'loving' && (
          <>
            <div className="sparkle s1">💕</div>
            <div className="sparkle s2">💗</div>
            <div className="sparkle s3">✨</div>
          </>
        )}
        {expression === 'happy' && (
          <>
            <div className="sparkle s1">✨</div>
            <div className="sparkle s3">🌟</div>
          </>
        )}

        {/* Back hair */}
        <div className="hair-back" style={{ background: hairDark }} />

        {/* Side hair */}
        <div className="hair-side hair-side-left" style={{ background: hairMain }} />
        <div className="hair-side hair-side-right" style={{ background: hairMain }} />

        {/* Face */}
        <div className="face">
          {/* Blush */}
          <div className="blush blush-left" />
          <div className="blush blush-right" />

          {/* Eyebrows */}
          <div className="eyebrow eyebrow-left" />
          <div className="eyebrow eyebrow-right" />

          {/* Eyes */}
          <div className="eye eye-left">
            <div className="eye-iris" style={{ background: `radial-gradient(circle, ${lighten(eyeColor, 30)}, ${eyeColor})` }}>
              <div className="eye-pupil" />
              <div className="eye-highlight hl1" />
              <div className="eye-highlight hl2" />
              <div className="eye-heart">♥</div>
            </div>
          </div>
          <div className="eye eye-right">
            <div className="eye-iris" style={{ background: `radial-gradient(circle, ${lighten(eyeColor, 30)}, ${eyeColor})` }}>
              <div className="eye-pupil" />
              <div className="eye-highlight hl1" />
              <div className="eye-highlight hl2" />
              <div className="eye-heart">♥</div>
            </div>
          </div>

          {/* Mouth */}
          <div className="mouth">
            <div className="mouth-default" />
            <div className="mouth-happy" />
            <div className="mouth-surprised" />
            <div className="mouth-shy" />
            <div className="mouth-loving" />
          </div>

          {/* Nose */}
          <div className="nose" />
        </div>

        {/* Front hair / Bangs */}
        <div className="hair-bangs" style={{ background: hairMain }}>
          <div className="hair-strand h1" style={{ background: hairMain }} />
          <div className="hair-strand h2" style={{ background: hairDark }} />
          <div className="hair-strand h3" style={{ background: hairMain }} />
        </div>

        {/* Ahoge / cowlick */}
        <div className="ahoge" style={{ borderBottomColor: hairMain }} />
      </div>
    </div>
  )
}

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xFF) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount))
  const b = Math.min(255, Math.max(0, (num & 0xFF) + amount))
  return `rgb(${r},${g},${b})`
}

function lighten(hex: string, amount: number): string {
  return adjustColor(hex, amount)
}
