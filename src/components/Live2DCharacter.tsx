import React, { useRef, useEffect, useCallback, useState } from 'react'
import * as PIXI from 'pixi.js'
import { Expression, Persona, LIVE2D_MODELS } from '../types'
import { useSettingsStore } from '../store/settingsStore'

(window as any).PIXI = PIXI

const LIVE2D_SDK_C2 = './live2d.min.js'
const LIVE2D_SDK_C4 = './live2dcubismcore.min.js'

const EXPRESSION_MAP: Record<string, string> = {
  happy: 'f01',
  shy: 'f02',
  loving: 'f03',
  surprised: 'f04',
  thinking: 'f01',
}

const MOUTH_PARAM = 'ParamMouthOpenY'

interface Props {
  expression: Expression
  persona: Persona
  isSpeaking: boolean
  isTyping: boolean
}

let sdkCache: Record<string, true> = {}
let sdkLoading: Record<string, Promise<void> | undefined> = {}

function loadSdk(url: string, globalKey: string): Promise<void> {
  if (sdkCache[url]) return Promise.resolve()
  if (sdkLoading[url]) return sdkLoading[url]!

  if ((window as any)[globalKey]) {
    sdkCache[url] = true
    return Promise.resolve()
  }

  sdkLoading[url] = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.onload = () => {
      sdkCache[url] = true
      resolve()
    }
    script.onerror = () => {
      delete sdkLoading[url]
      reject(new Error(`SDK load failed: ${url}`))
    }
    document.head.appendChild(script)
  })

  return sdkLoading[url]
}

export const Live2DCharacter: React.FC<Props> = ({ expression, persona, isSpeaking, isTyping }) => {
  const modelIndex = useSettingsStore(s => s.live2dModelIndex)
  const modelConfig = LIVE2D_MODELS[modelIndex] || LIVE2D_MODELS[0]
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

  // 切换模型时重新加载
  useEffect(() => {
    initRef.current = false
    mountRef.current = false
    if (modelRef.current) {
      modelRef.current.destroy()
      modelRef.current = null
    }
    if (appRef.current) {
      appRef.current.destroy(true)
      appRef.current = null
    }
    setFallback(false)
  }, [modelIndex])

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

    const sdkUrl = modelConfig.sdk === 'cubism4' ? LIVE2D_SDK_C4 : LIVE2D_SDK_C2
    const sdkKey = modelConfig.sdk === 'cubism4' ? 'Live2DCubismCore' : 'Live2D'

    loadSdk(sdkUrl, sdkKey)
      .then(() => import(`pixi-live2d-display/${modelConfig.sdk === 'cubism4' ? 'cubism4' : 'cubism2'}`))
      .then(({ Live2DModel }) => (Live2DModel as any).from(modelConfig.path) as Promise<any>)
      .then((model: any) => {
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
      .catch((err: Error) => {
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
    }
  }, [modelIndex])

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
