import { useState } from 'react'
import { useRelay } from '../relayContext'
import { Icon } from '../components/Icon'

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      className="button ghost"
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
          },
          () => setCopied(false)
        )
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={15} />
      {copied ? 'Copied' : label}
    </button>
  )
}

export function PhoneView() {
  const relay = useRelay()
  const status = relay.webRemote
  const [portDraft, setPortDraft] = useState<string | null>(null)

  if (!status) {
    return <div className="phone-layout" />
  }

  const portValue = portDraft ?? String(status.port)

  return (
    <div className="phone-layout">
      <section className="card phone-hero">
        <header className="card-head">
          <h3>
            <Icon name="phone" size={17} />
            Phone remote
          </h3>
          <label className="switch">
            <input
              type="checkbox"
              checked={status.enabled}
              onChange={(event) => void relay.updateWebRemote({ enabled: event.target.checked })}
              disabled={relay.busy === 'web-remote'}
            />
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            <span className="switch-label">{status.enabled ? 'On' : 'Off'}</span>
          </label>
        </header>

        <p className="muted">
          Serves a touch remote from this machine so any phone on the same network can control the TV.
          Everything still goes through this app — the phone never talks to the TV directly.
        </p>

        {status.running && status.primaryUrl ? (
          <div className="pair-panel">
            <div
              className="qr"
              // The QR is generated locally and contains only the LAN URL plus the access code.
              dangerouslySetInnerHTML={{ __html: status.qrSvg ?? '' }}
              aria-label="QR code for the phone remote URL"
              role="img"
            />
            <div className="pair-copy">
              <span className="label">Scan this, or open</span>
              <code className="pair-url">{status.addresses[0]?.url}</code>
              <span className="label">Access code</span>
              <strong className="pair-code">{status.token}</strong>
              <div className="button-row">
                <CopyButton value={status.primaryUrl} label="Copy link" />
                <CopyButton value={status.token} label="Copy code" />
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => void relay.updateWebRemote({ rotateToken: true })}
                  disabled={relay.busy === 'web-remote'}
                  title="Generate a new code and sign out every phone"
                >
                  <Icon name="refresh" size={15} />
                  New code
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="pair-panel is-idle">
            <div className="qr-placeholder" aria-hidden="true">
              <Icon name="phone" size={30} />
            </div>
            <div className="pair-copy">
              <strong>{status.lastError ? 'The server could not start' : 'The phone remote is off'}</strong>
              <small>
                {status.lastError ??
                  'Turn it on to get a scannable link and an access code for this machine.'}
              </small>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <header className="card-head">
          <h3>
            <Icon name="link" size={17} />
            Network
          </h3>
          <span className={`pill tone-${status.running ? 'positive' : 'neutral'}`}>
            {status.running ? `${status.connectedClients} connected` : 'Not listening'}
          </span>
        </header>

        <div className="field-grid">
          <label className="field">
            <span>Port</span>
            <input
              value={portValue}
              onChange={(event) => setPortDraft(event.target.value)}
              onBlur={() => {
                const parsed = Number(portValue)
                setPortDraft(null)

                if (parsed !== status.port) {
                  void relay.updateWebRemote({ port: parsed })
                }
              }}
              inputMode="numeric"
              placeholder="8479"
            />
          </label>
        </div>

        {status.addresses.length > 0 ? (
          <div className="roster-block">
            <span className="label">Reachable at</span>
            <div className="roster-list">
              {status.addresses.map((address) => (
                <div key={address.host} className="roster-row">
                  <div className="roster-copy">
                    <strong>{address.url}</strong>
                    <small>interface {address.label}</small>
                  </div>
                  <div className="roster-actions">
                    <CopyButton value={`${address.url}?t=${status.token}`} label="Copy" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="muted fine-print">
          Anyone on this network who has the access code can drive the TV. Keep it off on networks you do
          not trust, and generate a new code to sign every phone out.
        </p>
      </section>
    </div>
  )
}
