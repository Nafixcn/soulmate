import React, { useEffect, useRef } from 'react'
import { getTabDestination } from './dialogFocus'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface DialogProps {
  ariaLabelledBy: string
  children: React.ReactNode
  onClose: () => void
  overlayClassName: string
  panelClassName: string
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hidden && !element.closest('[hidden], [aria-hidden="true"]'),
  )
}

export const Dialog: React.FC<DialogProps> = ({
  ariaLabelledBy,
  children,
  onClose,
  overlayClassName,
  panelClassName,
}) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = getFocusableElements(panel)
    ;(focusable[0] ?? panel).focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const items = getFocusableElements(panel)
      if (items.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const currentIndex = items.indexOf(document.activeElement as HTMLElement)
      const destination = getTabDestination(currentIndex, items.length, event.shiftKey)
      if (destination === null) return

      event.preventDefault()
      items[destination].focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  return (
    <div
      className={overlayClassName}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={panelClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  )
}
