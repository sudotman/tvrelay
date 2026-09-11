import { useState } from 'react'
import { useRelay } from '../relayContext'
import { Icon } from '../components/Icon'
import {
  backendLabel,
  formatTimestamp,
  getBackendHealthLabel,
  getRecommendedActionMeta
} from '../viewModel'

function DeviceRoster() {
  const relay = useRelay()

  return (
    <section className="card">
      <header className="card-head">
        <h3>
          <Icon name="radar" size={17} />
          Choose a TV
        </h3>
        <button
          className="button ghost"
          type="button"
          onClick={() => void relay.scanNativeDevices()}
          disabled={relay.busy === 'discover'}
        >
          <Icon name="refresh" size={15} />
          {relay.busy === 'discover' ? 'Scanning…' : 'Scan network'}
        </button>
      </header>

      <div className="field-grid">
        <label className="field">
          <span>Friendly name</span>
          <input
            value={relay.form.name}
            onChange={(event) => relay.setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Bedroom TV"
          />
        </label>
        <label className="field">
          <span>Host or IP</span>
          <input
            value={relay.form.host}
            onChange={(event) => relay.setForm((current) => ({ ...current, host: event.target.value }))}
            placeholder="192.168.1.35"
          />
        </label>
      </div>

      <div className="target-line">
        <div>
          <span className="label">Current target</span>
          <strong>
            {relay.currentTargetDevice?.name ??
              (relay.hasSelectedTv ? relay.setupTargetName : 'No TV selected yet')}
          </strong>
          <small>
            {relay.currentTargetDevice
              ? `${relay.currentTargetDevice.host}${
                  relay.isConnected && relay.activeDevice?.id === relay.currentTargetDevice.id
                    ? ' · connected'
                    : ''
                }`
              : relay.hasSelectedTv
                ? relay.form.host.trim()
                : 'Pick one below, or type a host manually.'}
          </small>
        </div>
        <button
          className="button ghost"
          type="button"
          onClick={() => void relay.saveSetup()}
          disabled={relay.busy === 'save' || !relay.hasCurrentTarget}
        >
          Save TV profile
        </button>
      </div>

      {relay.devices.length > 0 ? (
        <div className="roster-block">
          <span className="label">Saved · {relay.devices.length}</span>
          <div className="roster-list">
            {relay.devices.map((device) => (
              <div
                key={device.id}
                className={`roster-row${relay.savedSelectedDevice?.id === device.id ? ' is-active' : ''}`}
              >
                <div className="roster-copy">
                  <strong>{device.name}</strong>
                  <small>
                    {device.host} ·{' '}
                    {device.lastConnectedAt
                      ? `${backendLabel(device.lastConnectedBackend)} · ${formatTimestamp(device.lastConnectedAt)}`
                      : 'never connected'}
                  </small>
                </div>
                <div className="roster-actions">
                  <button className="button ghost" type="button" onClick={() => relay.selectSavedDevice(device)}>
                    Load
                  </button>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => void relay.connectSavedDevice(device)}
                    disabled={relay.busy === `connect-${device.id}`}
                  >
                    Connect
                  </button>
                  <button
                    className="icon-chip danger"
                    type="button"
                    onClick={() => void relay.deleteSavedDevice(device)}
                    disabled={relay.busy === `delete-${device.id}`}
                    aria-label={`Delete ${device.name}`}
                    title={`Delete ${device.name}`}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="roster-block">
        <span className="label">Nearby · {relay.discoveredDevices.length}</span>
        {relay.discoveredDevices.length === 0 ? (
          <p className="muted">
            Discovery is optional. If nothing shows up, type the TV host or IP above.
          </p>
        ) : (
          <div className="roster-list">
            {relay.discoveredDevices.map((device) => (
              <div
                key={`${device.host}:${device.remotePort}`}
                className={`roster-row${relay.form.host === device.host ? ' is-active' : ''}`}
              >
                <div className="roster-copy">
                  <strong>{device.name}</strong>
                  <small>
                    {device.host} · native {device.remotePort} · pair {device.pairingPort}
                  </small>
                </div>
                <div className="roster-actions">
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => relay.applyDiscoveredDevice(device)}
                  >
                    Use this TV
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function AdbCard() {
  const relay = useRelay()
  const { form } = relay

  return (
    <section className="card accent-card">
      <header className="card-head">
        <h3>
          <Icon name="plug" size={17} />
          Connect with ADB
        </h3>
        <span className="pill tone-positive">Recommended</span>
      </header>
      <p className="muted">
        The reliable path, and the only one that fully powers typing, installed apps, sideloading, and
        mirroring.
      </p>

      <label className="toggle">
        <input
          type="checkbox"
          checked={form.adbEnabled}
          onChange={(event) =>
            relay.setForm((current) => ({ ...current, adbEnabled: event.target.checked }))
          }
        />
        <span>Enable ADB for this TV</span>
      </label>

      <div className="field-grid">
        <label className="field">
          <span>Mode</span>
          <select
            value={form.adbMode}
            onChange={(event) =>
              relay.setForm((current) => ({
                ...current,
                adbMode: event.target.value as 'pair' | 'connect'
              }))
            }
            disabled={!form.adbEnabled}
          >
            <option value="pair">Pair, then connect</option>
            <option value="connect">Direct connect</option>
          </select>
        </label>
        <label className="field">
          <span>Connect port</span>
          <input
            value={form.connectPort}
            onChange={(event) =>
              relay.setForm((current) => ({ ...current, connectPort: event.target.value }))
            }
            placeholder="5555"
            disabled={!form.adbEnabled}
          />
        </label>
        {form.adbMode === 'pair' ? (
          <>
            <label className="field">
              <span>Pair port</span>
              <input
                value={form.adbPairPort}
                onChange={(event) =>
                  relay.setForm((current) => ({ ...current, adbPairPort: event.target.value }))
                }
                placeholder="37099"
                disabled={!form.adbEnabled}
              />
            </label>
            <label className="field">
              <span>Pair code</span>
              <input
                value={form.adbPairCode}
                onChange={(event) =>
                  relay.setForm((current) => ({ ...current, adbPairCode: event.target.value }))
                }
                placeholder="654321"
                disabled={!form.adbEnabled}
              />
            </label>
          </>
        ) : null}
      </div>

      <div className="notice detect-notice">
        <div>
          <strong>
            {relay.resolvedAdbEndpoints
              ? 'Live ADB ports detected'
              : relay.hasSelectedTv
                ? 'No live ADB ports detected yet'
                : 'Choose a TV to detect ADB ports'}
          </strong>
          <span>
            {relay.resolvedAdbEndpoints
              ? `${
                  relay.resolvedAdbEndpoints.pairPort
                    ? `Pair ${relay.resolvedAdbEndpoints.pairPort}`
                    : 'Pair port not visible'
                } · ${
                  relay.resolvedAdbEndpoints.connectPort
                    ? `Connect ${relay.resolvedAdbEndpoints.connectPort}`
                    : 'Connect port not visible'
                }. These come from ADB mDNS on this network.`
              : 'Ports only appear while the TV advertises them. Open Wireless Debugging for the connect port, or "Pair device with pairing code" for the pairing port.'}
          </span>
        </div>
        <button
          className="button ghost"
          type="button"
          onClick={() => void relay.detectAdbEndpoints()}
          disabled={!relay.hasSelectedTv || !form.adbEnabled || relay.adbDiscoveryBusy}
        >
          {relay.adbDiscoveryBusy ? 'Detecting…' : 'Detect ports'}
        </button>
      </div>

      <div className="button-row">
        {form.adbMode === 'pair' ? (
          <button
            className="button primary"
            type="button"
            onClick={() => void relay.pairAdb()}
            disabled={
              !form.adbEnabled ||
              relay.busy === 'adb-pair' ||
              !relay.hasSelectedTv ||
              !form.adbPairCode.trim()
            }
          >
            Pair ADB and connect
          </button>
        ) : (
          <button
            className="button primary"
            type="button"
            onClick={() => void relay.connectUsingSetup('adb')}
            disabled={!form.adbEnabled || relay.busy === 'connect' || !relay.hasSelectedTv}
          >
            Connect with ADB
          </button>
        )}
        <button
          className="button ghost"
          type="button"
          onClick={() => void relay.saveSetup('adb')}
          disabled={relay.busy === 'save' || !relay.hasSelectedTv}
        >
          Save ADB settings
        </button>
      </div>

      <p className="muted fine-print">
        Use “Pair, then connect” for normal Android TV Wireless Debugging. Use “Direct connect” only when
        the TV is already listening on the saved port — 5555 is usually not the right one.
      </p>
    </section>
  )
}

function DiagnosticsCard() {
  const relay = useRelay()
  const { diagnostics, health } = relay

  return (
    <section className="card">
      <header className="card-head">
        <h3>
          <Icon name="alert" size={17} />
          Diagnostics
        </h3>
        <button
          className="button ghost"
          type="button"
          onClick={() => void relay.runAdbTroubleshooter()}
          disabled={relay.busy === 'troubleshoot' || !relay.hasSelectedTv}
        >
          Run checks
        </button>
      </header>

      {!diagnostics?.adb.available ? (
        <p className="notice tone-danger">
          <strong>ADB is not available.</strong>{' '}
          {diagnostics?.adb.installHint ?? 'Install ADB before you continue.'}
        </p>
      ) : (
        <p className="muted fine-print">
          {diagnostics.adb.version} · {diagnostics.adb.path}
        </p>
      )}

      {health ? (
        <>
          <div className="health-grid">
            <div className={`health-cell tone-${health.adb.ready ? 'positive' : 'neutral'}`}>
              <span className="label">ADB</span>
              <strong>{getBackendHealthLabel(health.adb, 'Unavailable')}</strong>
              <small>
                {health.adb.lastError ?? `Last success ${formatTimestamp(health.adb.lastConnectedAt)}`}
              </small>
            </div>
            <div className={`health-cell tone-${health.native.ready ? 'positive' : 'neutral'}`}>
              <span className="label">Native</span>
              <strong>{getBackendHealthLabel(health.native, 'Not configured')}</strong>
              <small>
                {health.native.lastError ??
                  `Last success ${formatTimestamp(health.native.lastConnectedAt)}`}
              </small>
            </div>
          </div>

          {health.issues.length > 0 ? (
            <ul className="issue-list">
              {health.issues.map((issue) => (
                <li key={issue.code} className={`issue tone-${issue.severity}`}>
                  <strong>{issue.summary}</strong>
                  <span>{issue.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {relay.recommendedActions.length > 0 ? (
            <div className="chip-row">
              {relay.recommendedActions.map((action) => {
                const meta = getRecommendedActionMeta(action)
                return (
                  <button
                    key={action}
                    className="chip"
                    type="button"
                    onClick={() => void relay.runRecommendedAction(action)}
                    title={meta.detail}
                  >
                    {meta.label}
                  </button>
                )
              })}
            </div>
          ) : null}
        </>
      ) : (
        <p className="muted">Choose a TV to see health and troubleshooting details.</p>
      )}
    </section>
  )
}

function NativeCard() {
  const relay = useRelay()
  const [open, setOpen] = useState(relay.waitingForNativeCode || relay.nativePaired)
  const { form, nativeSetupState } = relay

  return (
    <section className={`card collapsible${open ? ' is-open' : ''}`}>
      <button className="card-head as-button" type="button" onClick={() => setOpen((value) => !value)}>
        <h3>
          <Icon name="link" size={17} />
          Native remote
          <span className={`pill tone-${nativeSetupState.tone}`}>{nativeSetupState.badge}</span>
        </h3>
        <Icon name="chevron" size={16} className="icon chevron" />
      </button>

      {open ? (
        <>
          <p className="muted">
            Optional and less reliable than ADB. Typing, installed apps, sideloading, and mirroring keep
            using ADB even while native is connected.
          </p>

          <div className={`status-strip tone-${nativeSetupState.tone}`}>
            <strong>{nativeSetupState.title}</strong>
            <small>{nativeSetupState.detail}</small>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Remote port</span>
              <input
                value={form.nativeRemotePort}
                onChange={(event) =>
                  relay.setForm((current) => ({ ...current, nativeRemotePort: event.target.value }))
                }
                placeholder="6466"
              />
            </label>
            <label className="field">
              <span>Pairing port</span>
              <input
                value={form.nativePairingPort}
                onChange={(event) =>
                  relay.setForm((current) => ({ ...current, nativePairingPort: event.target.value }))
                }
                placeholder="6467"
              />
            </label>
          </div>

          {relay.waitingForNativeCode ? (
            <div className="notice tone-warning">
              <div>
                <strong>
                  {relay.pendingNativePairing
                    ? `Enter the code shown on ${relay.pendingNativePairing.name}`
                    : 'Enter the code shown on the TV'}
                </strong>
                <span>If the TV never shows a code, cancel this and go back to ADB.</span>
              </div>
              <div className="pairing-inline">
                <input
                  value={form.nativeCode}
                  onChange={(event) =>
                    relay.setForm((current) => ({ ...current, nativeCode: event.target.value }))
                  }
                  placeholder="TV pairing code"
                />
                <button
                  className="button primary"
                  type="button"
                  onClick={() => void relay.completeNativePairing()}
                  disabled={relay.busy === 'native-confirm' || !form.nativeCode.trim()}
                >
                  Confirm
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => void relay.connectUsingSetup('adb')}
                  disabled={!relay.hasSelectedTv || !form.adbEnabled || relay.busy === 'connect'}
                >
                  Use ADB instead
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => void relay.cancelNativePairing()}
                  disabled={relay.busy === 'disconnect'}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="button-row">
            <button
              className="button ghost"
              type="button"
              onClick={() => void relay.beginNativePairing()}
              disabled={relay.busy === 'native-pair' || !relay.hasSelectedTv || relay.waitingForNativeCode}
            >
              {relay.nativePaired ? 'Pair native again' : 'Start native pairing'}
            </button>
            <button
              className="button ghost"
              type="button"
              onClick={() => void relay.connectUsingSetup('native')}
              disabled={relay.busy === 'connect' || !relay.nativePaired || !relay.hasSelectedTv}
            >
              Connect with saved pairing
            </button>
          </div>
        </>
      ) : null}
    </section>
  )
}

export function SetupView() {
  return (
    <div className="setup-layout">
      <div className="setup-column">
        <DeviceRoster />
      </div>
      <div className="setup-column">
        <AdbCard />
        <DiagnosticsCard />
        <NativeCard />
      </div>
    </div>
  )
}
