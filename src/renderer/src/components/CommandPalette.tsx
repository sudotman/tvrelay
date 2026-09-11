import { useEffect, useState } from 'react'
import { useRelay } from '../relayContext'
import { Icon } from './Icon'

export function CommandPalette() {
  const relay = useRelay()
  const [highlight, setHighlight] = useState(0)
  const items = relay.visiblePaletteItems

  useEffect(() => {
    setHighlight(0)
  }, [relay.paletteQuery, relay.paletteOpen])

  if (!relay.paletteOpen) {
    return null
  }

  const move = (delta: number) => {
    setHighlight((current) => {
      if (items.length === 0) {
        return 0
      }

      return (current + delta + items.length) % items.length
    })
  }

  return (
    <div className="palette-scrim" role="presentation" onMouseDown={() => relay.setPaletteOpen(false)}>
      <section
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="palette-input">
          <Icon name="search" size={17} />
          <input
            autoFocus
            value={relay.paletteQuery}
            onChange={(event) => relay.setPaletteQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                relay.setPaletteOpen(false)
                return
              }

              if (event.key === 'ArrowDown') {
                event.preventDefault()
                move(1)
                return
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault()
                move(-1)
                return
              }

              if (event.key === 'Enter' && items[highlight]) {
                event.preventDefault()
                void relay.runPaletteItem(items[highlight])
              }
            }}
            placeholder="Search commands, apps, TVs, and power tools…"
          />
          <kbd>Esc</kbd>
        </div>

        <div className="palette-list">
          {items.length === 0 ? (
            <div className="palette-empty">
              <strong>No commands match that search.</strong>
              <span>Try “apps”, “wake”, “scrcpy”, or a saved TV name.</span>
            </div>
          ) : (
            items.map((item, index) => (
              <button
                key={item.id}
                className={`palette-item${index === highlight ? ' is-highlighted' : ''}${item.disabled ? ' is-disabled' : ''}`}
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={() => void relay.runPaletteItem(item)}
              >
                <span className="palette-item-copy">
                  <strong>{item.label}</strong>
                  <small>{item.disabled ? item.disabledReason ?? item.detail : item.detail}</small>
                </span>
                <span className="palette-section">{item.section}</span>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
