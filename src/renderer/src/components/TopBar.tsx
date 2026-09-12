import { useEffect, useRef, useState } from 'react'
import { useRelay } from '../relayContext'
import { backendLabel, formatConnectionStatus, statusTone, viewTabs } from '../viewModel'
import { Icon } from './Icon'

/** The four views. The top bar's grid keeps them window-centred while there is room. */
function ViewNav() {
  const relay = useRelay()
  // One thumb slides between four equal segments, so the active view reads as
  // a place the app moved to rather than a button that lit up.
  const activeIndex = Math.max(
    0,
    viewTabs.findIndex((item) => item.id === relay.tab)
  )

  return (
    <nav
      className="viewnav"
      aria-label="Views"
      style={{ '--nav-index': activeIndex } as React.CSSProperties}
    >
      <span className="viewnav-thumb" aria-hidden="true" />
      {viewTabs.map((item) => {
        const locked = (item.id === 'remote' || item.id === 'apps') && !relay.isConnected

        return (
          <button
            key={item.id}
            className={`viewnav-item${relay.tab === item.id ? ' is-active' : ''}${locked ? ' is-locked' : ''}`}
            type="button"
            onClick={() => relay.setTab(item.id)}
            title={locked ? `${item.label} unlocks once a TV is connected.` : item.detail}
            aria-current={relay.tab === item.id ? 'page' : undefined}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

/**
 * The chip answers "which TV, which backend, connected or not" on its face, and
 * the popover carries everything else that used to sit in the top bar.
 */
function DevicePicker() {
  const relay = useRelay()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const tone = statusTone(relay.connectionState.status)
  const label = relay.isConnected
    ? relay.activeDevice?.name ?? relay.setupTargetName
    : formatConnectionStatus(relay.connectionState.status)
  const detail = relay.isConnected
    ? `${relay.activeDevice?.host ?? ''} · ${backendLabel(relay.activeBackend)}`
    : relay.hasSelectedTv
      ? relay.setupTargetName
      : 'Choose a TV to begin'

  return (
    <div className="device-picker" ref={ref}>
      <button
        className="device-chip"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className={`status-dot tone-${tone}`} aria-hidden="true" />
        <span className="device-chip-copy">
          <strong>{label}</strong>
          <small>{detail}</small>
        </span>
        <Icon name="down" size={14} />
      </button>

      {open ? (
        <div className="popover" role="menu">
          <p className="popover-label">Saved TVs</p>
          {relay.devices.length === 0 ? (
            <p className="popover-empty">Nothing saved yet. Add a TV in Setup.</p>
          ) : (
            relay.devices.map((device) => (
              <button
                key={device.id}
                className={`popover-item${relay.activeDevice?.id === device.id ? ' is-active' : ''}`}
                type="button"
                onClick={() => {
                  setOpen(false)
                  void relay.connectSavedDevice(device)
                }}
                disabled={relay.busy === `connect-${device.id}`}
              >
                <span>
                  <strong>{device.name}</strong>
                  <small>{device.host}</small>
                </span>
                {relay.activeDevice?.id === device.id ? <Icon name="check" size={15} /> : null}
              </button>
            ))
          )}

          {relay.isConnected ? (
            <>
              <div className="popover-divider" />
              <button
                className="popover-item"
                type="button"
                onClick={() => {
                  setOpen(false)
                  void relay.wakeAndReconnect()
                }}
                disabled={relay.busy === 'wake' || !relay.capabilities.typing}
              >
                <span>
                  <strong>Wake and reconnect</strong>
                  <small>Sends an ADB wake, then reconnects</small>
                </span>
                <Icon name="wake" size={15} />
              </button>
              <button
                className="popover-item danger"
                type="button"
                onClick={() => {
                  setOpen(false)
                  void relay.disconnect()
                }}
                disabled={relay.busy === 'disconnect'}
              >
                <span>
                  <strong>Disconnect</strong>
                  <small>Drop the session with {relay.activeDevice?.name ?? 'this TV'}</small>
                </span>
                <Icon name="plug" size={15} />
              </button>
            </>
          ) : null}

          <div className="popover-divider" />
          <button
            className="popover-item"
            type="button"
            onClick={() => {
              setOpen(false)
              relay.setTab('setup')
            }}
          >
            <span>
              <strong>Add or edit a TV</strong>
              <small>Pairing, ports, and diagnostics</small>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function TopBar() {
  const relay = useRelay()

  return (
    <header className="topbar">
      <ViewNav />

      <div className="topbar-tail">
        {relay.isConnected ? null : (
          <button
            className="button primary"
            type="button"
            onClick={() => void relay.connectUsingSetup('adb')}
            disabled={!relay.hasSelectedTv || !relay.form.adbEnabled || relay.busy === 'connect'}
          >
            <Icon name="plug" size={16} />
            {relay.busy === 'connect' ? 'Connecting…' : 'Connect with ADB'}
          </button>
        )}

        <DevicePicker />

        <button
          className="button ghost palette-trigger"
          type="button"
          onClick={() => relay.setPaletteOpen(true)}
          title="Open the command palette"
          aria-label="Open the command palette"
        >
          <Icon name="search" size={16} />
          <kbd>⌘K</kbd>
        </button>
      </div>
    </header>
  )
}
