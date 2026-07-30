import { useEffect } from 'react'

interface ChatShortcutOptions {
  closeOverlays: () => void
  toggleSearch: () => void
  exportChat: () => void
}

export function useChatShortcuts({ closeOverlays, toggleSearch, exportChat }: ChatShortcutOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        closeOverlays()
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault()
        toggleSearch()
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
        event.preventDefault()
        exportChat()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeOverlays, exportChat, toggleSearch])
}
