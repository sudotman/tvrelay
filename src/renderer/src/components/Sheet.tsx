import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDismiss } from '../useDismiss'
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
  const { closing, dismiss } = useDismiss(true, onClose)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        dismiss()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dismiss])

  // Portalled to the body: the workspace is its own stacking context, so a
  // sheet rendered inside it would sit under the status line.
  return createPortal(
    <div
      className={`sheet-scrim${closing ? ' is-closing' : ''}`}
      role="presentation"
      onMouseDown={dismiss}
    >
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
          <button className="sheet-close" type="button" onClick={dismiss} aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>,
    document.body
  )
}
