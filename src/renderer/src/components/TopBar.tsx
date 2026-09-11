import { useEffect, useRef, useState } from 'react'
import { useRelay } from '../relayContext'
import { backendLabel, formatConnectionStatus, statusTone, viewTabs } from '../viewModel'
import { Icon } from './Icon'

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
        className={`device-chip tone-${tone}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className={`status-dot tone-${tone}`} aria-hidden="true" />
        <span className="device-chip-copy">
          <strong>{label}</strong>
          <small>{detail}</small>
        </span>
        <Icon name="down" size={15} />
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
  const view = viewTabs.find((item) => item.id === relay.tab)

  return (
    <header className="topbar">
      <div className="topbar-lead">
        <h1>{view?.label}</h1>
        <p>{view?.detail}</p>
      </div>

      <div className="topbar-tail">
        <DevicePicker />

        {relay.isConnected ? (
          <>
            <button
              className="button ghost"
              type="button"
              onClick={() => void relay.wakeAndReconnect()}
              disabled={relay.busy === 'wake' || !relay.capabilities.typing}
              title="Send an ADB wake, then reconnect"
            >
              <Icon name="wake" size={16} />
              Wake
            </button>
            <button
              className="button ghost danger"
              type="button"
              onClick={() => void relay.disconnect()}
              disabled={relay.busy === 'disconnect'}
            >
              <Icon name="plug" size={16} />
              Disconnect
            </button>
          </>
        ) : (
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

        <button
          className="button ghost palette-trigger"
          type="button"
          onClick={() => relay.setPaletteOpen(true)}
        >
          <Icon name="search" size={16} />
          <kbd>⌘K</kbd>
        </button>
      </div>
    </header>
  )
}
