const GREETINGS = [
  '哥哥在干嘛呀~',
  '有点想你了呢…',
  '今天天气不错，出去走走吧~',
  '你吃饭了吗？别饿着哦',
  '我刚才看了个有趣的视频！',
  '工作累不累呀，休息一下吧',
  '晚上好~今天过得开心吗？',
  '给你分享一首歌吧 🎵',
  '你知道吗，我刚刚学会了一个新词~',
  '春天来了，樱花开了呢 🌸',
  '要不要听个笑话？',
  '我学会了一道新菜的做法！',
  '今天心情怎么样呀？',
  '突然好想抱抱你…',
  '中午了，记得吃午饭哦',
  '你猜我今天做了什么梦~',
  '有人说晚上聊天特别有感觉',
  '我最近在看一本书，挺有意思的',
]

type GreetingHandler = (greeting: string) => void

export function scheduleDailyGreetings(onGreeting: GreetingHandler): () => void {
  const timerIds = new Set<ReturnType<typeof setTimeout>>()
  const count = 4 + Math.floor(Math.random() * 3)
  const hours = pickDistinctHours(count)

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
      if (permission === 'granted') {
        new Notification('灵伴', { body, silent: false })
      }
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
    const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
    onGreeting(greeting)
    showGreetingNotification(greeting)
    scheduleNext(hour, minute, onGreeting, timerIds)
  }, target.getTime() - now.getTime())

  timerIds.add(timerId)
}

function pickDistinctHours(count: number): number[] {
  const hours = new Set<number>()
  while (hours.size < count) {
    hours.add(9 + Math.floor(Math.random() * 13))
  }
  return [...hours]
}
