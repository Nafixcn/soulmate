import React, { useRef, useEffect, useCallback, useState } from 'react'
import * as PIXI from 'pixi.js'
import { Expression, Persona } from '../types'

(window as any).PIXI = PIXI

const LIVE2D_SDK_URL = './live2d.min.js'
const MODEL_URL = './models/shizuku/shizuku.model.json'

const EXPRESSION_MAP: Record<string, string> = {
  happy: 'f01',
  shy: 'f02',
  loving: 'f03',
  surprised: 'f04',
  thinking: 'f01',
}

const MOUTH_PARAM = 'PARAM_MOUTH_OPEN_Y'

interface Props {
  expression: Expression
  persona: Persona
  isSpeaking: boolean
  isTyping: boolean
}

let sdkLoaded = false
let sdkLoading: Promise<void> | null = null

function loadSdk(): Promise<void> {
  if (sdkLoaded) return Promise.resolve()
  if (sdkLoading) return sdkLoading

  if ((window as any).Live2D) {
    sdkLoaded = true
    return Promise.resolve()
  }

  sdkLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = LIVE2D_SDK_URL
    script.onload = () => {
      sdkLoaded = true
      resolve()
    }
    script.onerror = () => {
      sdkLoading = null
      reject(new Error('Live2D SDK load failed'))
    }
    document.head.appendChild(script)
  })

  return sdkLoading
}

export const Live2DCharacter: React.FC<Props> = ({ expression, persona, isSpeaking, isTyping }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const modelRef = useRef<any>(null)
  const mountRef = useRef(true)
  const speakingRef = useRef(false)
  const initRef = useRef(false)
  const [fallback, setFallback] = useState(false)

  const applyExpression = useCallback((model: any, expr: string) => {
    if (!model) return
    if (expr === 'neutral') {
      try { model.expression(undefined as any) } catch { return }
      return
    }
    const expName = EXPRESSION_MAP[expr]
    if (expName) {
      try { model.expression(expName) } catch {}
    }
  }, [])

  useEffect(() => {
    if (modelRef.current) {
      applyExpression(modelRef.current, expression)
    }
  }, [expression, applyExpression])

  useEffect(() => {
    speakingRef.current = isSpeaking
  }, [isSpeaking])

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    mountRef.current = true

    const canvas = canvasRef.current
    if (!canvas) return

    const app = new PIXI.Application({
      view: canvas,
      width: 260,
      height: 320,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })
    appRef.current = app

    loadSdk()
      .then(() => import('pixi-live2d-display/cubism2'))
      .then(({ Live2DModel }) => Live2DModel.from(MODEL_URL) as Promise<any>)
      .then((model) => {
        if (!mountRef.current) {
          model.destroy()
          return
        }
        modelRef.current = model

        model.anchor.set(0.5, 0)
        model.x = app.screen.width / 2
        model.y = -10
        model.scale.set(0.16, 0.16)

        app.stage.addChild(model)
        applyExpression(model, expression)
      })
      .catch((err) => {
        console.warn('Live2D load failed, using fallback:', err.message)
        setFallback(true)
      })

    let mouthTime = 0
    app.ticker.add(() => {
      if (!modelRef.current || !mountRef.current) return
      const val = speakingRef.current
        ? 0.3 + 0.4 * Math.abs(Math.sin(mouthTime * 8))
        : 0
      mouthTime += app.ticker.deltaMS / 1000
      try {
        modelRef.current.internalModel.coreModel.setParamFloat(MOUTH_PARAM, val)
      } catch {}
    })

    return () => {
      mountRef.current = false
      if (modelRef.current) {
        modelRef.current.destroy()
        modelRef.current = null
      }
      app.destroy(true)
      appRef.current = null
    }
  }, [])

  if (fallback) {
    return <CharacterAvatarFallback expression={expression} persona={persona} isSpeaking={isSpeaking} isTyping={isTyping} />
  }

  return (
    <div className="live2d-container">
      <canvas ref={canvasRef} className="live2d-canvas" />
      {!modelRef.current && (
        <div className="live2d-loading">
          <span>加载中...</span>
        </div>
      )}
    </div>
  )
}

const FALLBACK_EXPRESSIONS: Record<string, string> = {
  neutral: '😊',
  happy: '😄',
  shy: '😳',
  loving: '🥰',
  surprised: '😮',
  thinking: '🤔',
}

const CharacterAvatarFallback: React.FC<Props> = ({ expression }) => {
  return (
    <div className="live2d-container">
      <div className="live2d-fallback">
        <span style={{ fontSize: 80 }}>
          {FALLBACK_EXPRESSIONS[expression] || '😊'}
        </span>
      </div>
    </div>
  )
}
