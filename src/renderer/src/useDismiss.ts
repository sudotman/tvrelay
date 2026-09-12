import { useCallback, useEffect, useRef, useState } from 'react'

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * Keeps an overlay mounted for the length of its exit animation.
 *
 * Without this a sheet or palette disappears on the frame it is dismissed,
 * which reads as a glitch next to how carefully it arrived. `open` is the flag
 * that currently keeps the overlay rendered; `onClose` is only called once the
 * exit has played.
 */
export function useDismiss(open: boolean, onClose: () => void, durationMs = 200) {
  const [closing, setClosing] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      setClosing(false)
    }
  }, [open])

  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
      }
    },
    []
  )

  const dismiss = useCallback(() => {
    if (timer.current !== null) {
      return
    }

    setClosing(true)
    timer.current = window.setTimeout(() => {
      timer.current = null
      onClose()
    }, prefersReducedMotion() ? 0 : durationMs)
  }, [durationMs, onClose])

  return { closing, dismiss }
}
