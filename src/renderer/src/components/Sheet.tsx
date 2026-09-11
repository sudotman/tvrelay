import { useEffect, type ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * The one place Ambient hides things. It is always one click from the remote
 * stage, and it never holds connection state — that stays on the device chip.
 */
export function Sheet({
  label,
  head,
  onClose,
  children
}: {
  label: string
  head?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="sheet-scrim" role="presentation" onMouseDown={onClose}>
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          {head}
          <button className="sheet-close" type="button" onClick={onClose} aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  )
}
