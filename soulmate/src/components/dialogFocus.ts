export function getTabDestination(currentIndex: number, itemCount: number, reverse: boolean): number | null {
  if (itemCount <= 0) return null
  if (currentIndex < 0) return reverse ? itemCount - 1 : 0
  if (reverse && currentIndex === 0) return itemCount - 1
  if (!reverse && currentIndex === itemCount - 1) return 0
  return null
}
