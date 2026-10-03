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

export function scheduleDailyGreetings(
  settings: GreetingSettings,
  onGreeting: GreetingHandler,
  scheduleKey = 'default',
): () => void {
  if (!settings.enabled || settings.dailyCount <= 0) return () => undefined

  const hours = pickSpreadAllowedHours(settings.dailyCount, settings.quietStart, settings.quietEnd)
  const markerKey = `soulmate_greeting_slot_${scheduleKey}`
  const checkSchedule = () => {
    const now = new Date()
    if (isQuietHour(now.getHours(), settings.quietStart, settings.quietEnd)) return
    const dueSlot = hours
      .map((hour, index) => ({ hour, minute: 8 + ((index * 17) % 44) }))
      .filter(({ hour, minute }) => hour < now.getHours() || (hour === now.getHours() && minute <= now.getMinutes()))
      .pop()
    if (!dueSlot) return
    const marker = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}:${dueSlot.hour}`
    if (localStorage.getItem(markerKey) === marker) return
    localStorage.setItem(markerKey, marker)
    onGreeting()
  }

  checkSchedule()
  const intervalId = window.setInterval(checkSchedule, 30_000)
  const onVisible = () => {
    if (!document.hidden) checkSchedule()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', checkSchedule)

  return () => {
    window.clearInterval(intervalId)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', checkSchedule)
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

function pickSpreadAllowedHours(count: number, quietStart: number, quietEnd: number): number[] {
  const allowed = Array.from({ length: 24 }, (_, hour) => hour).filter(
    (hour) => !isQuietHour(hour, quietStart, quietEnd),
  )
  const targetCount = Math.min(count, allowed.length)
  if (targetCount === 0) return []
  return Array.from({ length: targetCount }, (_, index) => {
    const allowedIndex = Math.floor(((index + 0.5) * allowed.length) / targetCount)
    return allowed[Math.min(allowedIndex, allowed.length - 1)]
  })
}

function isQuietHour(hour: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart === quietEnd) return false
  return quietStart < quietEnd ? hour >= quietStart && hour < quietEnd : hour >= quietStart || hour < quietEnd
}
