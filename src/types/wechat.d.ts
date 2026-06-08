interface WeChatAuthAPI {
  getPort: () => Promise<number>
  onLoginSuccess: (callback: (user: { openid: string; nickname: string; avatar: string }) => void) => void
}

declare global {
  interface Window {
    wechatAuth: WeChatAuthAPI
  }
}

export {}
