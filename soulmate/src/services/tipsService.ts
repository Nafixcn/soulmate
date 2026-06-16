export interface TipsData {
  message: {
    default?: string[]
    hoverBody?: string[]
    tapBody?: string[]
    [key: string]: string[] | string | undefined
  }
  time: { hour: string; text: string | string[] }[]
  seasons: { date: string; text: string[] }[]
}

let cachedTips: TipsData | null = null

export async function loadTips(): Promise<TipsData> {
  if (cachedTips) return cachedTips
  const resp = await fetch('./waifu-tips.json')
  cachedTips = await resp.json()
  return cachedTips!
}

function pick(arr: string | string[]): string {
  if (typeof arr === 'string') return arr
  if (arr.length === 0) return ''
  return arr[Math.floor(Math.random() * arr.length)]
}

function isDateInRange(dateStr: string): boolean {
  const now = new Date()
  const currentYear = now.getFullYear()
  const parseDate = (mmdd: string): Date => {
    const [m, d] = mmdd.split('/').map(Number)
    return new Date(currentYear, m - 1, d)
  }
  if (/^\d{2}\/\d{2}$/.test(dateStr)) {
    const target = parseDate(dateStr)
    return now.getMonth() === target.getMonth() && now.getDate() === target.getDate()
  }
  const m = dateStr.match(/^(\d{2})\/(\d{2})-(\d{2})\/(\d{2})$/)
  if (m) {
    const start = parseDate(`${m[1]}/${m[2]}`)
    const end = parseDate(`${m[3]}/${m[4]}`)
    const today = new Date(currentYear, now.getMonth(), now.getDate())
    return today >= start && today <= end
  }
  return false
}

function getHourRange(hour: number): string {
  if (hour <= 5) return '0-5'; if (hour <= 7) return '6-7'; if (hour <= 11) return '8-11'
  if (hour <= 13) return '12-13'; if (hour <= 17) return '14-17'; if (hour <= 19) return '18-19'
  if (hour <= 21) return '20-21'; return '22-23'
}

export function getTimeGreeting(tips: TipsData): string | null {
  const range = getHourRange(new Date().getHours())
  const timeTip = tips.time.find(t => t.hour === range)
  if (timeTip) return pick(timeTip.text)
  return null
}

export function getSeasonalTip(tips: TipsData): string | null {
  for (const s of tips.seasons) {
    if (isDateInRange(s.date)) return pick(s.text)
  }
  return null
}

export function getRandomTip(tips: TipsData): string {
  const defaults = tips.message.default || []
  const all = [...defaults, ...(tips.message.hoverBody || []), ...(tips.message.tapBody || [])]
  if (all.length === 0) return '今天想聊点什么呢？'
  return all[Math.floor(Math.random() * all.length)]
}
