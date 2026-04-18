import { useDeferredValue, useEffect, useState } from 'react'
import type {
  ConnectionBackend,
  ConnectionState,
  DiagnosticsStatus,
  DiscoveredNativeDevice,
  LaunchableApp,
  PreferredConnectionBackend,
  RemoteCommand,
  SavedDevice
} from '@shared/types'

type TabId = 'setup' | 'remote' | 'apps'

type SetupFormState = {
  name: string
  host: string
  preferredBackend: PreferredConnectionBackend
  nativeRemotePort: string
  nativePairingPort: string
  nativeCode: string
  adbEnabled: boolean
  adbMode: 'pair' | 'connect'
  connectPort: string
  adbPairPort: string
  adbPairCode: string
}

type SetupStep = {
  number: string
  title: string
  detail: string
  done: boolean
  current?: boolean
  optional?: boolean
}

const remoteButtons: Array<{ label: string; command: RemoteCommand; accent?: boolean }> = [
  { label: 'Home', command: 'home' },
  { label: 'Back', command: 'back' },
  { label: 'Menu', command: 'menu' },
  { label: 'Recent Apps', command: 'appSwitch' },
  { label: 'Power', command: 'power', accent: true },
  { label: 'Mute', command: 'mute' },
  { label: 'Vol +', command: 'volumeUp' },
  { label: 'Vol -', command: 'volumeDown' },
  { label: 'Play/Pause', command: 'playPause' },
  { label: 'Rewind', command: 'rewind' },
  { label: 'Fast Forward', command: 'fastForward' },
  { label: 'Next', command: 'next' },
  { label: 'Previous', command: 'previous' },
  { label: 'Sleep', command: 'sleep' }
]

const keyBindings: Partial<Record<string, RemoteCommand>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'select',
  Backspace: 'back',
  MediaPlayPause: 'playPause',
  ' ': 'playPause'
}

const initialForm: SetupFormState = {
  name: '',
  host: '',
  preferredBackend: 'auto',
  nativeRemotePort: '6466',
  nativePairingPort: '6467',
  nativeCode: '',
  adbEnabled: true,
  adbMode: 'connect',
  connectPort: '5555',
  adbPairPort: '37099',
  adbPairCode: ''
}

function statusTone(state: ConnectionState['status']): 'neutral' | 'positive' | 'danger' | 'warning' {
  switch (state) {
    case 'connected':
      return 'positive'
    case 'unauthorized':
      return 'warning'
    case 'error':
      return 'danger'
    default:
      return 'neutral'
  }
}

function backendLabel(backend: ConnectionBackend | null | undefined): string {
  if (backend === 'native') {
    return 'Native Remote'
  }

  if (backend === 'adb') {
    return 'ADB'
  }

  return 'Not connected'
}

function applyDeviceToForm(device: SavedDevice): SetupFormState {
  return {
    name: device.name,
    host: device.host,
    preferredBackend: device.preferredBackend ?? (device.nativeRemote ? 'auto' : 'adb'),
    nativeRemotePort: String(device.nativeRemote?.remotePort ?? 6466),
    nativePairingPort: String(device.nativeRemote?.pairingPort ?? 6467),
    nativeCode: '',
    adbEnabled: device.adbEnabled !== false,
    adbMode: device.mode,
    connectPort: String(device.connectPort ?? 5555),
    adbPairPort: String(device.pairPort ?? 37099),
    adbPairCode: ''
  }
}

function stepStateLabel(step: SetupStep): string {
  if (step.done) {
    return 'Done'
  }

  if (step.current) {
    return 'Next'
  }

  if (step.optional) {
    return 'Optional'
  }

  return 'Waiting'
}

function stepStateClass(step: SetupStep): string {
  if (step.done) {
    return 'done'
  }

  if (step.current) {
    return 'current'
  }

  if (step.optional) {
    return 'optional'
  }

  return 'waiting'
}

export function App() {
  const [tab, setTab] = useState<TabId>('setup')
  const [diagnostics, setDiagnostics] = useState<DiagnosticsStatus | null>(null)
  const [devices, setDevices] = useState<SavedDevice[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>({ status: 'disconnected' })
  const [apps, setApps] = useState<LaunchableApp[]>([])
  const [appsQuery, setAppsQuery] = useState('')
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredNativeDevice[]>([])
  const [form, setForm] = useState<SetupFormState>(initialForm)
  const [textInput, setTextInput] = useState('')
  const [statusMessage, setStatusMessage] = useState('Ready when you are.')
  const [busy, setBusy] = useState<string | null>(null)
  const deferredAppsQuery = useDeferredValue(appsQuery)

  const activeDevice = diagnostics?.activeDevice ?? null
  const activeBackend = diagnostics?.activeBackend ?? null
  const pendingNativePairing = diagnostics?.pendingNativePairing ?? null
  const waitingForNativeCode = Boolean(
    pendingNativePairing ||
      (connectionState.status === 'pairing' && connectionState.backend === 'native')
  )
  const capabilities = diagnostics?.capabilities ?? {
    nativeRemote: false,
    adbFallback: false,
    typing: false,
    apps: false
  }
  const setupTargetName = form.name.trim() || form.host.trim() || 'your TV'
  const activeMatchesForm = Boolean(activeDevice && form.host.trim() && activeDevice.host === form.host.trim())
  const nativePaired = Boolean(activeMatchesForm && activeDevice?.nativeRemote?.certificate)
  const adbReady = Boolean(activeMatchesForm && activeDevice?.adbEnabled !== false && capabilities.adbFallback)
  const hasSelectedTv = Boolean(form.host.trim())
  const nativeRequired = form.preferredBackend !== 'adb'
  const nativeReady = Boolean(
    nativePaired ||
      (activeMatchesForm &&
        connectionState.status === 'connected' &&
        (activeBackend === 'native' || (activeBackend === 'adb' && form.preferredBackend === 'auto')))
  )
  const connectionHeadline = waitingForNativeCode
    ? 'Finish pairing on the code prompt'
    : activeDevice && connectionState.status === 'connected'
      ? `${activeDevice.name} is ready`
      : 'Build a connection path'
  const connectionSubcopy = waitingForNativeCode
    ? 'Your TV is asking for a native remote pairing code. Enter it here before doing anything else.'
    : activeDevice && connectionState.status === 'connected'
      ? `${backendLabel(activeBackend)} is active${capabilities.adbFallback && activeBackend === 'native' ? ', with ADB fallback available' : ''}.`
      : 'Start in Setup: choose a TV, choose a path, then pair the pieces you want.'
  const nextActionLabel = waitingForNativeCode
    ? 'Enter the TV code now'
    : !hasSelectedTv
      ? 'Choose a TV first'
      : !nativePaired && form.preferredBackend !== 'adb'
        ? 'Start native pairing'
        : form.adbEnabled && !adbReady
          ? 'Add ADB fallback if you want typing and installed apps'
          : 'Connect using your chosen path'
  const selectedHostLabel =
    activeDevice?.host ?? (form.host.trim() !== '' ? form.host.trim() : 'Choose a TV in Setup to begin.')
  const setupSteps: SetupStep[] = [
    {
      number: '1',
      title: 'Choose a TV',
      detail: hasSelectedTv
        ? `${setupTargetName} is loaded into Setup.`
        : 'Discover a TV on the network or enter its host manually.',
      done: hasSelectedTv,
      current: !hasSelectedTv
    },
    {
      number: '2',
      title: 'Pick the control path',
      detail:
        form.preferredBackend === 'auto'
          ? 'Auto will try native remote first and keep ADB as fallback.'
          : form.preferredBackend === 'native'
            ? 'Native remote is the primary control path.'
            : 'ADB-only mode is selected.',
      done: true
    },
    {
      number: '3',
      title: 'Pair native remote',
      detail: waitingForNativeCode
        ? 'The TV is already showing a code. Confirm it now.'
        : nativeRequired
          ? nativeReady
            ? 'Native remote is paired for this TV.'
            : 'Start native pairing so everyday controls work without ADB.'
          : 'Skipped because you selected ADB-only mode.',
      done: !nativeRequired || nativeReady,
      current: nativeRequired && !nativeReady,
      optional: !nativeRequired
    },
    {
      number: '4',
      title: 'Add ADB fallback',
      detail: form.adbEnabled
        ? adbReady
          ? 'ADB fallback is ready for typing and installed apps.'
          : 'Optional, but recommended if you want typing and app launching.'
        : 'You can turn ADB off, but you lose typing and installed apps.',
      done: !form.adbEnabled || adbReady,
      current: form.adbEnabled && !adbReady && (!nativeRequired || nativeReady),
      optional: true
    }
  ]

  async function refreshDiagnostics(): Promise<void> {
    const next = await window.tvRemoteApi.getDiagnostics()
    setDiagnostics(next)
    setDevices(next.savedDevices)
    setConnectionState(next.connectionState)
  }

  useEffect(() => {
    void refreshDiagnostics()
    void scanNativeDevices()

    const unsubscribeState = window.tvRemoteApi.onConnectionStateChanged((state) => {
      setConnectionState(state)
      setStatusMessage(state.message ?? `Status: ${state.status}`)
      void refreshDiagnostics()
    })

    const unsubscribeDevices = window.tvRemoteApi.onDevicesChanged((nextDevices) => {
      setDevices(nextDevices)
      void refreshDiagnostics()
    })

    return () => {
      unsubscribeState()
      unsubscribeDevices()
    }
  }, [])

  useEffect(() => {
    if (tab !== 'apps' || connectionState.status !== 'connected' || !capabilities.apps) {
      return
    }

    void loadApps()
  }, [tab, connectionState.status, capabilities.apps])

  useEffect(() => {
    if (tab !== 'remote') {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement) {
        const tagName = event.target.tagName.toLowerCase()
        if (tagName === 'input' || tagName === 'textarea') {
          return
        }
      }

      const command = keyBindings[event.key]
      if (!command || connectionState.status !== 'connected') {
        return
      }

      event.preventDefault()
      void sendRemoteCommand(command)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tab, connectionState.status])

  const filteredApps = (() => {
    const query = deferredAppsQuery.trim().toLowerCase()

    if (!query) {
      return apps
    }

    return apps.filter((app) => {
      return (
        app.displayName.toLowerCase().includes(query) ||
        app.packageName.toLowerCase().includes(query)
      )
    })
  })()

  async function scanNativeDevices(): Promise<void> {
    setBusy('discover')
    try {
      const found = await window.tvRemoteApi.discoverNativeDevices()
      setDiscoveredDevices(found)
      setStatusMessage(
        found.length > 0
          ? `Found ${found.length} TV${found.length === 1 ? '' : 's'} advertising native remote service.`
          : 'No native remote service TVs discovered yet. You can still enter the host manually.'
      )
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Discovery failed.')
    } finally {
      setBusy(null)
    }
  }

  function applyDiscoveredDevice(device: DiscoveredNativeDevice): void {
    setForm((current) => ({
      ...current,
      name: current.name || device.name,
      host: device.host,
      preferredBackend: current.preferredBackend === 'adb' ? 'auto' : current.preferredBackend,
      nativeRemotePort: String(device.remotePort),
      nativePairingPort: String(device.pairingPort)
    }))
    setStatusMessage(`Loaded ${device.name} into the setup form.`)
  }

  async function saveSetup(): Promise<void> {
    if (!form.host.trim()) {
      setStatusMessage('Enter or discover a TV host first.')
      return
    }

    setBusy('save')
    try {
      const saved = await window.tvRemoteApi.saveDevice({
        name: form.name.trim() || form.host.trim(),
        host: form.host.trim(),
        connectPort: Number(form.connectPort),
        pairPort: form.adbMode === 'pair' ? Number(form.adbPairPort) : undefined,
        mode: form.adbMode,
        adbEnabled: form.adbEnabled,
        preferredBackend: form.preferredBackend,
        nativeRemote: {
          serviceLabel: form.name.trim() || form.host.trim(),
          remotePort: Number(form.nativeRemotePort),
          pairingPort: Number(form.nativePairingPort)
        }
      })

      setStatusMessage(`Saved ${saved.name}.`)
      await refreshDiagnostics()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not save this TV.')
    } finally {
      setBusy(null)
    }
  }

  async function beginNativePairing(): Promise<void> {
    if (!form.host.trim()) {
      setStatusMessage('Choose or enter a TV host before starting native pairing.')
      return
    }

    setBusy('native-pair')
    try {
      const state = await window.tvRemoteApi.beginNativePairing({
        name: form.name.trim() || form.host.trim(),
        host: form.host.trim(),
        remotePort: Number(form.nativeRemotePort),
        pairingPort: Number(form.nativePairingPort),
        serviceLabel: form.name.trim() || form.host.trim(),
        preferredBackend: form.preferredBackend,
        adbEnabled: form.adbEnabled,
        connectPort: Number(form.connectPort),
        pairPort: form.adbMode === 'pair' ? Number(form.adbPairPort) : undefined,
        mode: form.adbMode
      })

      setStatusMessage(state.message ?? 'Native pairing started.')
      await refreshDiagnostics()
      if (state.status === 'pairing') {
        setTab('setup')
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not start native pairing.')
    } finally {
      setBusy(null)
    }
  }

  async function completeNativePairing(): Promise<void> {
    setBusy('native-confirm')
    try {
      const state = await window.tvRemoteApi.completeNativePairing({
        code: form.nativeCode
      })

      setForm((current) => ({ ...current, nativeCode: '' }))
      setStatusMessage(state.message ?? 'Native remote paired.')
      await refreshDiagnostics()
      if (state.status === 'connected') {
        setTab('remote')
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Native pairing confirmation failed.')
    } finally {
      setBusy(null)
    }
  }

  async function connectUsingSetup(): Promise<void> {
    if (!form.host.trim()) {
      setStatusMessage('Choose or enter a TV host before connecting.')
      return
    }

    setBusy('connect')
    try {
      const state = await window.tvRemoteApi.connectDevice({
        name: form.name.trim() || form.host.trim(),
        host: form.host.trim(),
        connectPort: Number(form.connectPort),
        pairPort: form.adbMode === 'pair' ? Number(form.adbPairPort) : undefined,
        mode: form.adbMode,
        preferredBackend: form.preferredBackend,
        adbEnabled: form.adbEnabled,
        nativeRemote: {
          serviceLabel: form.name.trim() || form.host.trim(),
          remotePort: Number(form.nativeRemotePort),
          pairingPort: Number(form.nativePairingPort)
        }
      })

      setStatusMessage(state.message ?? 'Connected.')
      await refreshDiagnostics()

      if (state.status === 'connected') {
        setTab('remote')
      } else if (state.status === 'pairing') {
        setTab('setup')
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Connection failed.')
    } finally {
      setBusy(null)
    }
  }

  async function pairAdb(): Promise<void> {
    if (!form.host.trim()) {
      setStatusMessage('Choose or enter a TV host before pairing ADB.')
      return
    }

    setBusy('adb-pair')
    try {
      const state = await window.tvRemoteApi.pairDevice({
        name: form.name.trim() || form.host.trim(),
        host: form.host.trim(),
        connectPort: Number(form.connectPort),
        pairPort: Number(form.adbPairPort),
        code: form.adbPairCode,
        preferredBackend: form.preferredBackend,
        adbEnabled: true,
        nativeRemote: {
          serviceLabel: form.name.trim() || form.host.trim(),
          remotePort: Number(form.nativeRemotePort),
          pairingPort: Number(form.nativePairingPort)
        },
        mode: 'pair'
      })

      setForm((current) => ({ ...current, adbPairCode: '' }))
      setStatusMessage(state.message ?? 'ADB paired and connected.')
      await refreshDiagnostics()
      if (state.status === 'connected') {
        setTab('remote')
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'ADB pairing failed.')
    } finally {
      setBusy(null)
    }
  }

  async function connectSavedDevice(device: SavedDevice): Promise<void> {
    setBusy(device.id)
    try {
      const state = await window.tvRemoteApi.connectDevice({ id: device.id })
      setStatusMessage(state.message ?? `Connected to ${device.name}.`)
      setForm(applyDeviceToForm(device))
      await refreshDiagnostics()
      if (state.status === 'connected') {
        setTab('remote')
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not connect to saved TV.')
    } finally {
      setBusy(null)
    }
  }

  async function disconnect(): Promise<void> {
    setBusy('disconnect')
    try {
      const state = await window.tvRemoteApi.disconnectDevice()
      setStatusMessage(state.message ?? 'Disconnected.')
      await refreshDiagnostics()
    } finally {
      setBusy(null)
    }
  }

  async function sendRemoteCommand(command: RemoteCommand): Promise<void> {
    try {
      await window.tvRemoteApi.sendRemoteCommand(command)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Remote command failed.')
    }
  }

  async function sendText(): Promise<void> {
    setBusy('text')
    try {
      await window.tvRemoteApi.sendText({ text: textInput })
      setStatusMessage(
        activeBackend === 'native'
          ? 'Sent text through ADB fallback.'
          : 'Sent text to TV.'
      )
      setTextInput('')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Typing failed.')
    } finally {
      setBusy(null)
    }
  }

  async function pasteFromClipboard(): Promise<void> {
    try {
      const clipboardText = await navigator.clipboard.readText()
      setTextInput((current) => `${current}${clipboardText}`)
    } catch {
      setStatusMessage('Clipboard access is not available here. You can still paste manually.')
    }
  }

  async function loadApps(): Promise<void> {
    if (!capabilities.apps) {
      setStatusMessage('Installed-app browsing uses ADB fallback. Enable and pair ADB in Setup for this TV first.')
      return
    }

    setBusy('apps')
    try {
      const nextApps = await window.tvRemoteApi.listApps()
      setApps(nextApps)
      setStatusMessage(
        activeBackend === 'native'
          ? `Loaded ${nextApps.length} launchable apps through ADB fallback.`
          : `Loaded ${nextApps.length} launchable apps.`
      )
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not load apps.')
    } finally {
      setBusy(null)
    }
  }

  async function launchApp(packageName: string): Promise<void> {
    setBusy(packageName)
    try {
      await window.tvRemoteApi.launchApp(packageName)
      setStatusMessage(
        activeBackend === 'native'
          ? `Launching ${packageName} through ADB fallback.`
          : `Launching ${packageName}.`
      )
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Launch failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="shell">
      <div className="background-orb background-orb-left" />
      <div className="background-orb background-orb-right" />
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Android TV Remote</p>
          <h1>Native remote first. ADB when you need the extra reach.</h1>
          <p className="lede">
            Pair like the Google TV app over the local network, then keep ADB around as a
            fallback for typing, installed-app launch, and trickier TVs.
          </p>
        </div>

        <div className="panel status-panel">
          <p className="eyebrow">Connection Desk</p>
          <h2>{activeDevice && connectionState.status === 'connected' ? activeDevice.name : setupTargetName}</h2>
          <div className={`status-pill tone-${statusTone(connectionState.status)}`}>
            {connectionState.status}
          </div>
          <p>{connectionSubcopy}</p>
          <div className="meta-stack">
            <span>{selectedHostLabel}</span>
            <span>Active path: {backendLabel(activeBackend)}</span>
            <span>Next step: {nextActionLabel}</span>
            <span>
              Capabilities:
              {' '}
              {capabilities.typing ? 'Typing' : 'No typing'}
              {' · '}
              {capabilities.apps ? 'Installed apps' : 'No app list'}
            </span>
          </div>
          <div className="callout status-callout">
            <strong>Latest note</strong>
            <span>{statusMessage}</span>
          </div>
          {diagnostics?.adb.available ? (
            <div className="meta-stack">
              <span>{diagnostics.adb.version}</span>
              <span>{diagnostics.adb.path}</span>
            </div>
          ) : (
            <p className="warning-copy">{diagnostics?.adb.installHint}</p>
          )}
        </div>

        {waitingForNativeCode ? (
          <div className="panel pairing-panel">
            <p className="eyebrow">Pairing Needed</p>
            <h2>Enter the code from your TV</h2>
            <p className="muted">
              {pendingNativePairing
                ? `Native remote pairing is waiting for ${pendingNativePairing.name}.`
                : 'Native remote pairing is waiting for the code shown on your TV.'}
            </p>
            <input
              value={form.nativeCode}
              onChange={(event) => setForm((current) => ({ ...current, nativeCode: event.target.value }))}
              placeholder="TV pairing code"
            />
            <div className="action-row compact">
              <button
                className="primary-button"
                type="button"
                onClick={() => void completeNativePairing()}
                disabled={busy === 'native-confirm' || !form.nativeCode.trim()}
              >
                Confirm code
              </button>
              <button className="ghost-button" type="button" onClick={() => setTab('setup')}>
                Open setup
              </button>
            </div>
          </div>
        ) : null}

        <nav className="tab-list">
          {(['setup', 'remote', 'apps'] as TabId[]).map((item) => (
            <button
              key={item}
              className={`tab-button ${tab === item ? 'active' : ''}`}
              type="button"
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="panel">
          <div className="panel-heading">
            <h2>Saved TVs</h2>
            <span>{devices.length}</span>
          </div>
          <div className="device-list">
            {devices.length === 0 ? (
              <p className="muted">Your paired TVs will show up here once you save them.</p>
            ) : (
              devices.map((device) => (
                <button
                  key={device.id}
                  className={`device-card ${activeDevice?.id === device.id ? 'active' : ''}`}
                  type="button"
                  onClick={() => void connectSavedDevice(device)}
                  disabled={busy === device.id}
                >
                  <strong>{device.name}</strong>
                  <span>{device.host}</span>
                  <div className="badge-row">
                    {device.nativeRemote ? <small className="badge">Native</small> : null}
                    {device.adbEnabled !== false ? <small className="badge">ADB</small> : null}
                    <small className="badge subtle">{device.preferredBackend ?? 'adb'}</small>
                  </div>
                  <small>
                    {device.lastConnectedAt
                      ? `${device.lastConnectedBackend ?? 'unknown'} · ${new Date(device.lastConnectedAt).toLocaleString()}`
                      : 'Never connected'}
                  </small>
                </button>
              ))
            )}
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={() => void disconnect()}
            disabled={busy === 'disconnect' || connectionState.status !== 'connected'}
          >
            Disconnect active TV
          </button>
        </div>
      </aside>

      <main className="main">
        <section className="panel focus-banner">
          <div className="focus-banner-main">
            <p className="eyebrow">
              {activeDevice && connectionState.status === 'connected' ? 'Now Controlling' : 'Next Move'}
            </p>
            <h2>{connectionHeadline}</h2>
            <p>{connectionSubcopy}</p>
            <div className="badge-row">
              <span className="badge">{activeDevice?.name ?? setupTargetName}</span>
              {activeDevice?.host ?? form.host.trim() ? (
                <span className="badge subtle">{activeDevice?.host ?? form.host.trim()}</span>
              ) : null}
              <span className="badge subtle">{backendLabel(activeBackend)}</span>
              {capabilities.adbFallback && activeBackend === 'native' ? (
                <span className="badge">ADB fallback ready</span>
              ) : null}
            </div>
          </div>
          <div className="focus-banner-side">
            <div className="focus-stat">
              <span className="focus-label">What to do now</span>
              <strong>{nextActionLabel}</strong>
            </div>
            <div className="action-row compact">
              {connectionState.status === 'connected' ? (
                <>
                  <button className="primary-button" type="button" onClick={() => setTab('remote')}>
                    Open remote
                  </button>
                  <button className="ghost-button" type="button" onClick={() => setTab('apps')}>
                    Open apps
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void disconnect()}
                    disabled={busy === 'disconnect'}
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <>
                  <button className="primary-button" type="button" onClick={() => setTab('setup')}>
                    Open setup
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void connectUsingSetup()}
                    disabled={busy === 'connect' || !hasSelectedTv}
                  >
                    Connect now
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {tab === 'setup' && (
          <section className="content-grid setup-grid">
            <div className="panel hero-card setup-overview">
              <p className="eyebrow">Setup Flow</p>
              <h2>Start at the first unfinished step and keep moving downward.</h2>
              <p>
                Native remote gives you the smooth “phone remote” path without developer options.
                ADB remains optional but recommended for direct typing and installed-app launching.
              </p>
              <div className="step-overview-grid">
                {setupSteps.map((step) => (
                  <div key={step.number} className={`step-chip ${stepStateClass(step)}`}>
                    <div className="step-chip-top">
                      <span className="step-number">{step.number}</span>
                      <span className={`step-state ${stepStateClass(step)}`}>{stepStateLabel(step)}</span>
                    </div>
                    <strong>{step.title}</strong>
                    <span>{step.detail}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel form-panel step-panel">
              <div className="step-heading">
                <div>
                  <p className="eyebrow">Step 1</p>
                  <h2>Choose the TV you want to control</h2>
                </div>
                <span className={`step-state ${stepStateClass(setupSteps[0])}`}>{stepStateLabel(setupSteps[0])}</span>
              </div>
              <p className="muted">
                Pick a discovered TV first. If discovery misses it, enter the host manually and keep going.
              </p>
              <div className="panel-heading step-panel-heading">
                <strong>Nearby TVs</strong>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void scanNativeDevices()}
                  disabled={busy === 'discover'}
                >
                  Refresh
                </button>
              </div>
              <div className="service-grid">
                {discoveredDevices.length === 0 ? (
                  <p className="muted">
                    Nothing discovered yet. Make sure the TV is on the same network, or enter the
                    host manually below.
                  </p>
                ) : (
                  discoveredDevices.map((device) => (
                    <button
                      key={`${device.host}:${device.remotePort}`}
                      className={`selection-card ${form.host === device.host ? 'selected' : ''}`}
                      type="button"
                      onClick={() => applyDiscoveredDevice(device)}
                    >
                      <strong>{device.name}</strong>
                      <span>{device.host}</span>
                      <small>Native remote {device.remotePort} · Pair {device.pairingPort}</small>
                    </button>
                  ))
                )}
              </div>
              <div className="selected-device-strip">
                <span className="focus-label">Selected TV</span>
                <strong>{hasSelectedTv ? setupTargetName : 'Nothing selected yet'}</strong>
                <span>{form.host.trim() || 'Choose a discovered TV or enter an IP below.'}</span>
              </div>
              <div className="field-row">
                <label>
                  Friendly name
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Living Room TV"
                  />
                </label>
                <label>
                  Host / IP
                  <input
                    value={form.host}
                    onChange={(event) => setForm((current) => ({ ...current, host: event.target.value }))}
                    placeholder="192.168.1.35"
                  />
                </label>
              </div>
              <div className="field-row">
                <label>
                  Native remote port
                  <input
                    value={form.nativeRemotePort}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, nativeRemotePort: event.target.value }))
                    }
                    placeholder="6466"
                  />
                </label>
                <label>
                  Native pairing port
                  <input
                    value={form.nativePairingPort}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, nativePairingPort: event.target.value }))
                    }
                    placeholder="6467"
                  />
                </label>
              </div>
              <div className="action-row">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void saveSetup()}
                  disabled={busy === 'save'}
                >
                  Save TV profile
                </button>
              </div>
            </div>

            <div className="panel step-panel">
              <div className="step-heading">
                <div>
                  <p className="eyebrow">Step 2</p>
                  <h2>Choose how this TV should connect</h2>
                </div>
                <span className={`step-state ${stepStateClass(setupSteps[1])}`}>{stepStateLabel(setupSteps[1])}</span>
              </div>
              <p className="muted">Auto is the recommended balance for most TVs.</p>
              <div className="connection-path-grid">
                {([
                  {
                    value: 'auto',
                    title: 'Auto',
                    copy: 'Try native remote first, then fall back to ADB if native is unavailable.'
                  },
                  {
                    value: 'native',
                    title: 'Native Remote',
                    copy: 'Use Android TV Remote Service only. Best for simple control without dev settings.'
                  },
                  {
                    value: 'adb',
                    title: 'ADB',
                    copy: 'Go straight to wireless ADB for full control and installed-app browsing.'
                  }
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`selection-card ${form.preferredBackend === option.value ? 'selected' : ''}`}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        preferredBackend: option.value
                      }))
                    }
                  >
                    <strong>{option.title}</strong>
                    <span>{option.copy}</span>
                  </button>
                ))}
              </div>
              <div className="action-row">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void connectUsingSetup()}
                  disabled={busy === 'connect'}
                >
                  Connect with chosen path
                </button>
              </div>
            </div>

            <div className="panel step-panel">
              <div className="step-heading">
                <div>
                  <p className="eyebrow">Step 3</p>
                  <h2>Pair native remote</h2>
                </div>
                <span className={`step-state ${stepStateClass(setupSteps[2])}`}>{stepStateLabel(setupSteps[2])}</span>
              </div>
              <p className="muted">
                This is the same underlying remote service used by Google TV-style software
                remotes. Start pairing, then enter the code shown on the TV.
              </p>
              <div className="action-row">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void beginNativePairing()}
                  disabled={busy === 'native-pair' || form.preferredBackend === 'adb'}
                >
                  Start native pairing
                </button>
              </div>
              {pendingNativePairing ? (
                <>
                  <div className="callout">
                    Waiting for a code from
                    {' '}
                    <strong>{pendingNativePairing.name}</strong>
                    {' '}
                    at
                    {' '}
                    {pendingNativePairing.host}
                    .
                  </div>
                  <div className="field-row">
                    <label>
                      Pairing code
                      <input
                        value={form.nativeCode}
                        onChange={(event) => setForm((current) => ({ ...current, nativeCode: event.target.value }))}
                        placeholder="Enter the TV code"
                      />
                    </label>
                  </div>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void completeNativePairing()}
                    disabled={busy === 'native-confirm' || !form.nativeCode.trim()}
                  >
                    Confirm native pairing
                  </button>
                </>
              ) : (
                <div className="callout subdued">
                  {form.preferredBackend === 'adb'
                    ? 'Native pairing is skipped in ADB-only mode.'
                    : 'If the TV shows a pairing code, come back here or use the code panel in the sidebar.'}
                </div>
              )}
            </div>

            <div className="panel step-panel">
              <div className="step-heading">
                <div>
                  <p className="eyebrow">Step 4</p>
                  <h2>Add ADB fallback</h2>
                </div>
                <span className={`step-state ${stepStateClass(setupSteps[3])}`}>{stepStateLabel(setupSteps[3])}</span>
              </div>
              <p className="muted">Recommended for typing and installed apps.</p>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={form.adbEnabled}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      adbEnabled: event.target.checked
                    }))
                  }
                />
                <span>Enable ADB fallback for this TV</span>
              </label>
              <div className="field-row">
                <label>
                  ADB mode
                  <select
                    value={form.adbMode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        adbMode: event.target.value as 'pair' | 'connect'
                      }))
                    }
                    disabled={!form.adbEnabled}
                  >
                    <option value="connect">Direct connect</option>
                    <option value="pair">Pair then connect</option>
                  </select>
                </label>
                <label>
                  ADB connect port
                  <input
                    value={form.connectPort}
                    onChange={(event) => setForm((current) => ({ ...current, connectPort: event.target.value }))}
                    placeholder="5555"
                    disabled={!form.adbEnabled}
                  />
                </label>
              </div>
              {form.adbMode === 'pair' ? (
                <div className="field-row">
                  <label>
                    ADB pair port
                    <input
                      value={form.adbPairPort}
                      onChange={(event) => setForm((current) => ({ ...current, adbPairPort: event.target.value }))}
                      placeholder="37099"
                      disabled={!form.adbEnabled}
                    />
                  </label>
                  <label>
                    ADB pair code
                    <input
                      value={form.adbPairCode}
                      onChange={(event) => setForm((current) => ({ ...current, adbPairCode: event.target.value }))}
                      placeholder="654321"
                      disabled={!form.adbEnabled}
                    />
                  </label>
                </div>
              ) : null}
              <div className="action-row">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void pairAdb()}
                  disabled={!form.adbEnabled || form.adbMode !== 'pair' || busy === 'adb-pair'}
                >
                  Pair ADB fallback
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void saveSetup()}
                  disabled={busy === 'save'}
                >
                  Save fallback settings
                </button>
              </div>
              <p className="muted">
                When the active path is native remote, typing and installed-app launch will still
                hop over to ADB fallback when it is available.
              </p>
            </div>
          </section>
        )}

        {tab === 'remote' && (
          <section className="content-grid remote-layout">
            <div className="panel remote-pad-panel">
              <div className="panel-heading">
                <h2>{activeDevice ? activeDevice.name : 'Remote pad'}</h2>
                <span>{activeDevice ? `${backendLabel(activeBackend)} · ${activeDevice.host}` : 'No active TV'}</span>
              </div>
              <div className="dpad">
                <button type="button" className="dpad-btn up" onClick={() => void sendRemoteCommand('up')}>
                  Up
                </button>
                <button type="button" className="dpad-btn left" onClick={() => void sendRemoteCommand('left')}>
                  Left
                </button>
                <button type="button" className="dpad-btn select" onClick={() => void sendRemoteCommand('select')}>
                  OK
                </button>
                <button type="button" className="dpad-btn right" onClick={() => void sendRemoteCommand('right')}>
                  Right
                </button>
                <button type="button" className="dpad-btn down" onClick={() => void sendRemoteCommand('down')}>
                  Down
                </button>
              </div>
              <p className="muted">
                Desktop shortcuts still work here: arrow keys navigate, Enter selects, Backspace
                goes back, and Space toggles play/pause.
              </p>
            </div>

            <div className="panel controls-panel">
              <div className="panel-heading">
                <h2>Controls</h2>
                <span>{activeBackend === 'native' ? 'Driving the native remote service.' : 'Driving ADB key events.'}</span>
              </div>
              <div className="button-grid">
                {remoteButtons.map((button) => (
                  <button
                    key={button.command}
                    type="button"
                    className={`remote-button ${button.accent ? 'accent' : ''}`}
                    onClick={() => void sendRemoteCommand(button.command)}
                    disabled={connectionState.status !== 'connected'}
                  >
                    {button.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel text-panel">
              <div className="panel-heading">
                <h2>Type remotely</h2>
                <span>
                  {activeBackend === 'native'
                    ? capabilities.typing
                      ? 'This panel will use ADB fallback for direct text.'
                      : 'Enable ADB fallback in Setup to unlock direct typing.'
                    : 'Direct ADB text entry is ready.'}
                </span>
              </div>
              {!capabilities.typing ? (
                <div className="callout">
                  Native remote is connected, but direct text entry still needs ADB fallback for
                  this TV. Pair or enable ADB fallback in Setup.
                </div>
              ) : null}
              <textarea
                value={textInput}
                onChange={(event) => setTextInput(event.target.value)}
                placeholder="Type a search query, password fragment, or channel name..."
              />
              <div className="action-row">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void sendText()}
                  disabled={busy === 'text' || !textInput || !capabilities.typing}
                >
                  Send text
                </button>
                <button className="ghost-button" type="button" onClick={() => setTextInput('')}>
                  Clear
                </button>
                <button className="ghost-button" type="button" onClick={() => void pasteFromClipboard()}>
                  Paste clipboard
                </button>
                <button className="ghost-button" type="button" onClick={() => void sendRemoteCommand('enter')}>
                  Enter
                </button>
                <button className="ghost-button" type="button" onClick={() => void sendRemoteCommand('delete')}>
                  Delete
                </button>
              </div>
            </div>
          </section>
        )}

        {tab === 'apps' && (
          <section className="content-grid">
            <div className="panel hero-card">
              <p className="eyebrow">Apps</p>
              <h2>Installed-app launch with graceful fallback</h2>
              <p>
                Installed-app discovery and one-click launch are still ADB-backed. If the active
                connection is native remote, this screen will automatically use the stored ADB
                fallback when available.
              </p>
            </div>

            <div className="panel apps-panel">
              <div className="panel-heading">
                <h2>Launchable apps</h2>
                <button className="ghost-button" type="button" onClick={() => void loadApps()} disabled={busy === 'apps'}>
                  Refresh
                </button>
              </div>

              {!capabilities.apps ? (
                <div className="callout">
                  Installed-app browsing needs ADB fallback for this TV. Enable it in Setup, then
                  return here to browse and launch installed apps.
                </div>
              ) : null}

              <input
                value={appsQuery}
                onChange={(event) => setAppsQuery(event.target.value)}
                placeholder="Search apps or package names"
                disabled={!capabilities.apps}
              />

              <div className="app-list">
                {filteredApps.length === 0 ? (
                  <p className="muted">
                    {capabilities.apps
                      ? 'No launchable apps loaded yet. Hit refresh.'
                      : 'Enable ADB fallback to unlock this list.'}
                  </p>
                ) : (
                  filteredApps.map((app) => (
                    <button
                      key={app.packageName}
                      className="app-card"
                      type="button"
                      onClick={() => void launchApp(app.packageName)}
                      disabled={busy === app.packageName}
                    >
                      <strong>{app.displayName}</strong>
                      <span>{app.packageName}</span>
                      <small>{app.category === 'leanback' ? 'TV launcher' : 'Standard launcher'}</small>
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
