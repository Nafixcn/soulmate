export interface TipsData {
  message: {
    default?: string[]
    hoverBody?: string[]
    tapBody?: string[]
    welcome?: string
    console?: string
    copy?: string
    photo?: string
    goodbye?: string
    visibilitychange?: string
    [key: string]: any
  }
  time: { hour: string; text: string | string[] }[]
  seasons: { date: string; text: string[] }[]
  models: { name: string; message: string[] }[]
}

let cachedTips: TipsData | null = null

export async function loadTips(): Promise<TipsData> {
  if (cachedTips) return cachedTips
  const resp = await fetch('/waifu-tips.json')
  cachedTips = await resp.json()
  return cachedTips!
}

function pick(arr: string | string[]): string {
  if (typeof arr === 'string') return arr
  return arr[Math.floor(Math.random() * arr.length)]
}

function isDateInRange(dateStr: string): boolean {
  const now = new Date()
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`
  // 单日: "01/01"
  if (/^\d{2}\/\d{2}$/.test(dateStr)) {
    return dateStr === mmdd
  }
  // 范围: "11/05-11/12"
  const m = dateStr.match(/^(\d{2})\/(\d{2})-(\d{2})\/(\d{2})$/)
  if (m) {
    const start = `${m[1]}/${m[2]}`
    const end = `${m[3]}/${m[4]}`
    return mmdd >= start && mmdd <= end
  }
  return false
}

function getHourRange(hour: number): string {
  if (hour >= 0 && hour <= 5) return '0-5'
  if (hour >= 6 && hour <= 7) return '6-7'
  if (hour >= 8 && hour <= 11) return '8-11'
  if (hour >= 12 && hour <= 13) return '12-13'
  if (hour >= 14 && hour <= 17) return '14-17'
  if (hour >= 18 && hour <= 19) return '18-19'
  if (hour >= 20 && hour <= 21) return '20-21'
  return '22-23'
}

export function getTimeGreeting(tips: TipsData): string | null {
  const hour = new Date().getHours()
  const range = getHourRange(hour)
  const timeTip = tips.time.find(t => t.hour === range)
  if (timeTip) return pick(timeTip.text)
  return null
}

export function getSeasonalTip(tips: TipsData): string | null {
  for (const s of tips.seasons) {
    if (isDateInRange(s.date)) {
      return pick(s.text)
    }
  }
  return null
}

export function getRandomTip(tips: TipsData): string {
  const defaults = tips.message.default || []
  const hoverBody = tips.message.hoverBody || []
  const tapBody = tips.message.tapBody || []
  const all = [...defaults, ...hoverBody, ...tapBody]
  if (all.length === 0) return '今天想聊点什么呢？'
  return all[Math.floor(Math.random() * all.length)]
}
