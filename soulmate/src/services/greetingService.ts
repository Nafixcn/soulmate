import type { GreetingSettings } from '../types'

export interface GreetingContext {
  preferredAddress: string
  interests: string
  lastUserMessage?: string
  hour?: number
}

type GreetingHandler = () => void

export function buildGroundedGreeting(context: GreetingContext): string {
  const address = context.preferredAddress.trim() || '你'
  const hour = context.hour ?? new Date().getHours()
  const lastTopic = context.lastUserMessage?.trim()
  if (lastTopic) {
    const excerpt = lastTopic.length > 28 ? `${lastTopic.slice(0, 28)}…` : lastTopic
    return `${address}，你上次提到“${excerpt}”，后来怎么样了？`
  }

  const firstInterest = context.interests
    .split(/[、，,；;]/)
    .map((item) => item.trim())
    .find(Boolean)
  if (firstInterest) return `${address}，今天想聊聊${firstInterest}吗？`
  if (hour < 12) return `早上好，${address}。今天想从什么开始聊？`
  if (hour < 18) return `${address}，下午过得怎么样？`
  return `晚上好，${address}。今天有什么想和我说的吗？`
}

export function scheduleDailyGreetings(settings: GreetingSettings, onGreeting: GreetingHandler): () => void {
  if (!settings.enabled || settings.dailyCount <= 0) return () => undefined

  const timerIds = new Set<ReturnType<typeof setTimeout>>()
  const hours = pickDistinctAllowedHours(settings.dailyCount, settings.quietStart, settings.quietEnd)
  for (const hour of hours) {
    scheduleNext(hour, Math.floor(Math.random() * 50), onGreeting, timerIds)
  }

  return () => {
    timerIds.forEach(clearTimeout)
    timerIds.clear()
  }
}

export function showGreetingNotification(body: string): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission === 'granted') {
    new Notification('灵伴', { body, silent: false })
    return
  }
  if (Notification.permission !== 'denied') {
    void Notification.requestPermission().then((permission) => {
      if (permission === 'granted') new Notification('灵伴', { body, silent: false })
    })
  }
}

function scheduleNext(
  hour: number,
  minute: number,
  onGreeting: GreetingHandler,
  timerIds: Set<ReturnType<typeof setTimeout>>,
): void {
  const now = new Date()
  const target = new Date(now)
  target.setHours(hour, minute, 0, 0)
  if (target <= now) target.setDate(target.getDate() + 1)

  const timerId = setTimeout(() => {
    timerIds.delete(timerId)
    onGreeting()
    scheduleNext(hour, minute, onGreeting, timerIds)
  }, target.getTime() - now.getTime())
  timerIds.add(timerId)
}

function pickDistinctAllowedHours(count: number, quietStart: number, quietEnd: number): number[] {
  const allowed = Array.from({ length: 24 }, (_, hour) => hour).filter(
    (hour) => !isQuietHour(hour, quietStart, quietEnd),
  )
  const shuffled = allowed.sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, allowed.length)).sort((left, right) => left - right)
}

function isQuietHour(hour: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart === quietEnd) return false
  return quietStart < quietEnd ? hour >= quietStart && hour < quietEnd : hour >= quietStart || hour < quietEnd
}
