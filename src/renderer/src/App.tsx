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
  preferredBackend: 'adb',
  nativeRemotePort: '6466',
  nativePairingPort: '6467',
  nativeCode: '',
  adbEnabled: true,
  adbMode: 'connect',
  connectPort: '5555',
  adbPairPort: '37099',
  adbPairCode: ''
}

const viewTabs: Array<{
  id: TabId
  label: string
  eyebrow: string
  title: string
  description: string
}> = [
  {
    id: 'setup',
    label: 'Setup',
    eyebrow: 'Dashboard',
    title: 'Set up one TV and keep the next step obvious.',
    description: 'Choose a TV, save it, then use the ADB path first. Native remote stays available, but it is clearly optional.'
  },
  {
    id: 'remote',
    label: 'Remote',
    eyebrow: 'Control',
    title: 'Directional controls, media keys, and text entry in one place.',
    description: 'Use the pad for navigation, the buttons for quick actions, and ADB-backed typing when you need to enter text.'
  },
  {
    id: 'apps',
    label: 'Apps',
    eyebrow: 'Launch',
    title: 'Browse installed apps without losing the thread.',
    description: 'Search what is available on the current TV and launch it directly. This view still depends on ADB fallback.'
  }
]

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

export function App() {
  const [tab, setTab] = useState<TabId>('setup')
  const [diagnostics, setDiagnostics] = useState<DiagnosticsStatus | null>(null)
  const [devices, setDevices] = useState<SavedDevice[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>({ status: 'disconnected' })
  const [apps, setApps] = useState<LaunchableApp[]>([])
  const [appsDeviceId, setAppsDeviceId] = useState<string | null>(null)
  const [appsQuery, setAppsQuery] = useState('')
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredNativeDevice[]>([])
  const [form, setForm] = useState<SetupFormState>(initialForm)
  const [textInput, setTextInput] = useState('')
  const [statusMessage, setStatusMessage] = useState('Ready when you are.')
  const [busy, setBusy] = useState<string | null>(null)
  const deferredAppsQuery = useDeferredValue(appsQuery)

  const activeDevice = diagnostics?.activeDevice ?? null
  const activeAppsCache = activeDevice?.cachedApps ?? null
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
  const hasSelectedTv = Boolean(form.host.trim())
  const isConnected = connectionState.status === 'connected'
  const activeMatchesForm = Boolean(activeDevice && form.host.trim() && activeDevice.host === form.host.trim())
  const nativePaired = Boolean(activeMatchesForm && activeDevice?.nativeRemote?.certificate)
  const selectedHostLabel =
    activeDevice?.host ?? (form.host.trim() !== '' ? form.host.trim() : 'Choose a TV in Setup to begin.')
  const savedSelectedDevice = devices.find((device) => device.host === form.host.trim()) ?? null
  const preferredPathLabel =
    form.preferredBackend === 'adb'
      ? 'ADB'
      : form.preferredBackend === 'native'
        ? 'Native Remote'
        : 'Auto'
  const recommendedAdbLabel = form.adbMode === 'pair' ? 'Pair ADB and connect' : 'Connect with ADB'
  const currentView = viewTabs.find((item) => item.id === tab) ?? viewTabs[0]
  const appsAreLoading = busy === 'apps'
  const statusTitle = waitingForNativeCode
    ? 'Finish native pairing or cancel it'
    : isConnected && activeDevice
      ? `Connected to ${activeDevice.name}`
      : connectionState.status === 'connecting'
        ? 'Connecting to your TV'
        : connectionState.status === 'error'
          ? 'Connection needs attention'
          : 'No TV connected yet'
  const statusDetail = waitingForNativeCode
    ? 'If the TV does not show a code within a few seconds, cancel native pairing and use ADB instead.'
    : isConnected && activeDevice
      ? `${backendLabel(activeBackend)} is active${activeBackend === 'native' && capabilities.adbFallback ? ', with ADB fallback ready for typing and apps' : '.'}`
      : 'Use the setup screen below. Start with ADB unless you specifically want to try native remote.'

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

    if (activeAppsCache) {
      return
    }

    if (appsDeviceId === activeDevice?.id && apps.length > 0) {
      return
    }

    void loadApps()
  }, [tab, connectionState.status, capabilities.apps, activeDevice?.id, apps.length, appsDeviceId, activeAppsCache?.updatedAt])

  useEffect(() => {
    if (connectionState.status !== 'connected' || !activeDevice) {
      setApps([])
      setAppsQuery('')
      setAppsDeviceId(null)
      return
    }

    if (activeAppsCache) {
      setApps(activeAppsCache.apps)
    } else {
      setApps([])
    }

    if (appsDeviceId !== activeDevice.id) {
      setAppsQuery('')
    }

    setAppsDeviceId(activeDevice.id)
  }, [connectionState.status, activeDevice?.id, activeAppsCache?.updatedAt, appsDeviceId])

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
          ? `Found ${found.length} TV${found.length === 1 ? '' : 's'} on the network.`
          : 'No TVs discovered right now. You can still type the host manually.'
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
      preferredBackend: current.preferredBackend,
      nativeRemotePort: String(device.remotePort),
      nativePairingPort: String(device.pairingPort)
    }))
    setStatusMessage(`Loaded ${device.name} into the setup form.`)
  }

  function selectSavedDevice(device: SavedDevice): void {
    setForm(applyDeviceToForm(device))
    setStatusMessage(`Loaded ${device.name} into the setup form.`)
    setTab('setup')
  }

  async function saveSetup(preferredBackendOverride?: PreferredConnectionBackend): Promise<void> {
    if (!form.host.trim()) {
      setStatusMessage('Enter or discover a TV host first.')
      return
    }

    const preferredBackend = preferredBackendOverride ?? form.preferredBackend
    setBusy('save')
    try {
      setForm((current) =>
        current.preferredBackend === preferredBackend
          ? current
          : { ...current, preferredBackend }
      )

      const saved = await window.tvRemoteApi.saveDevice({
        name: form.name.trim() || form.host.trim(),
        host: form.host.trim(),
        connectPort: Number(form.connectPort),
        pairPort: form.adbMode === 'pair' ? Number(form.adbPairPort) : undefined,
        mode: form.adbMode,
        adbEnabled: form.adbEnabled,
        preferredBackend,
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

  async function beginNativePairing(preferredBackendOverride: PreferredConnectionBackend = 'native'): Promise<void> {
    if (!form.host.trim()) {
      setStatusMessage('Choose or enter a TV host before starting native pairing.')
      return
    }

    const preferredBackend = preferredBackendOverride
    setBusy('native-pair')
    try {
      setForm((current) =>
        current.preferredBackend === preferredBackend
          ? current
          : { ...current, preferredBackend }
      )

      const state = await window.tvRemoteApi.beginNativePairing({
        name: form.name.trim() || form.host.trim(),
        host: form.host.trim(),
        remotePort: Number(form.nativeRemotePort),
        pairingPort: Number(form.nativePairingPort),
        serviceLabel: form.name.trim() || form.host.trim(),
        preferredBackend,
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

  async function connectUsingSetup(preferredBackendOverride?: PreferredConnectionBackend): Promise<void> {
    if (!form.host.trim()) {
      setStatusMessage('Choose or enter a TV host before connecting.')
      return
    }

    const preferredBackend = preferredBackendOverride ?? form.preferredBackend
    setBusy('connect')
    try {
      setForm((current) =>
        current.preferredBackend === preferredBackend
          ? current
          : { ...current, preferredBackend }
      )

      const state = await window.tvRemoteApi.connectDevice({
        name: form.name.trim() || form.host.trim(),
        host: form.host.trim(),
        connectPort: Number(form.connectPort),
        pairPort: form.adbMode === 'pair' ? Number(form.adbPairPort) : undefined,
        mode: form.adbMode,
        preferredBackend,
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

  async function cancelNativePairing(): Promise<void> {
    setForm((current) => ({ ...current, nativeCode: '' }))
    await disconnect()
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
        preferredBackend: 'adb',
        adbEnabled: true,
        nativeRemote: {
          serviceLabel: form.name.trim() || form.host.trim(),
          remotePort: Number(form.nativeRemotePort),
          pairingPort: Number(form.nativePairingPort)
        },
        mode: 'pair'
      })

      setForm((current) => ({ ...current, adbPairCode: '', preferredBackend: 'adb' }))
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
    setBusy(`connect-${device.id}`)
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

  async function deleteSavedDevice(device: SavedDevice): Promise<void> {
    const confirmed = window.confirm(`Delete ${device.name} from saved TVs?`)

    if (!confirmed) {
      return
    }

    setBusy(`delete-${device.id}`)
    try {
      await window.tvRemoteApi.deleteDevice(device.id)

      if (savedSelectedDevice?.id === device.id) {
        setForm(initialForm)
      }

      if (activeDevice?.id === device.id) {
        setTab('setup')
        setApps([])
      }

      setStatusMessage(`Removed ${device.name} from saved TVs.`)
      await refreshDiagnostics()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not delete this TV.')
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

  async function loadApps(forceRefresh = false): Promise<void> {
    if (!capabilities.apps) {
      setStatusMessage('Installed-app browsing uses ADB fallback. Enable and pair ADB in Setup for this TV first.')
      return
    }

    const currentDeviceId = activeDevice?.id ?? null

    setBusy('apps')
    try {
      const nextApps = await window.tvRemoteApi.listApps(forceRefresh)
      setApps(nextApps)
      setAppsDeviceId(currentDeviceId)
      setStatusMessage(
        forceRefresh
          ? activeBackend === 'native'
            ? `Refreshed ${nextApps.length} apps through ADB fallback.`
            : `Refreshed ${nextApps.length} apps.`
          : activeBackend === 'native'
            ? `Loaded ${nextApps.length} launchable apps through ADB fallback.`
            : `Loaded ${nextApps.length} launchable apps.`
      )
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not load apps.')
    } finally {
      setBusy(null)
    }
  }

  async function launchApp(app: LaunchableApp): Promise<void> {
    setBusy(app.packageName)
    try {
      await window.tvRemoteApi.launchApp(app)
      setStatusMessage(
        activeBackend === 'native'
          ? `Launching ${app.displayName} through ADB fallback.`
          : `Launching ${app.displayName}.`
      )
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Launch failed.')
    } finally {
      setBusy(null)
    }
  }

  function renderNativePairingPanel(className?: string) {
    if (!waitingForNativeCode) {
      return null
    }

    return (
      <section className={`panel pairing-panel ${className ?? ''}`.trim()}>
        <div className="section-header">
          <div>
            <p className="eyebrow">Native Pairing</p>
            <h2>Enter the code without hunting for it</h2>
          </div>
          <span className="section-chip section-chip-muted">Temporary</span>
        </div>
        <p className="muted">
          {pendingNativePairing
            ? `${pendingNativePairing.name} is waiting for a native pairing code. If the TV never shows one, stop here and go back to ADB.`
            : 'If the TV never shows a code, cancel this and use ADB instead.'}
        </p>
        <div className="field-row pairing-fields">
          <label>
            TV pairing code
            <input
              value={form.nativeCode}
              onChange={(event) => setForm((current) => ({ ...current, nativeCode: event.target.value }))}
              placeholder="TV pairing code"
            />
          </label>
        </div>
        <div className="action-row compact">
          <button
            className="primary-button"
            type="button"
            onClick={() => void completeNativePairing()}
            disabled={busy === 'native-confirm' || !form.nativeCode.trim()}
          >
            Confirm code
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => void connectUsingSetup('adb')}
            disabled={!hasSelectedTv || !form.adbEnabled || busy === 'connect'}
          >
            Switch to ADB
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => void cancelNativePairing()}
            disabled={busy === 'disconnect'}
          >
            Cancel
          </button>
        </div>
      </section>
    )
  }

  function getAppBadgeLabel(app: LaunchableApp): string {
    return app.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2)
  }

  function getAppBadgeTone(packageName: string): string {
    let hash = 0

    for (const character of packageName) {
      hash = (hash * 31 + character.charCodeAt(0)) >>> 0
    }

    return `hsl(${hash % 360} 62% 92%)`
  }

  function formatAppsUpdatedAt(timestamp?: string): string {
    if (!timestamp) {
      return 'Never updated'
    }

    return new Date(timestamp).toLocaleString()
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">Android TV Remote</p>
          <h1>Android TV Remote</h1>
          <p className="lede">
            Start with ADB. Keep native remote optional. Make the current TV and next action obvious.
          </p>
        </div>

        <nav className="view-switcher" aria-label="Views">
          {viewTabs.map((item) => (
            <button
              key={item.id}
              className={`view-switch-button ${tab === item.id ? 'active' : ''}`}
              type="button"
              onClick={() => setTab(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.id === 'setup' ? 'Choose a TV and connect it' : item.id === 'remote' ? 'Control the connected TV' : 'Browse and launch installed apps'}</span>
            </button>
          ))}
        </nav>

        <section className="panel sidebar-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Current TV</p>
              <h2>{activeDevice?.name ?? setupTargetName}</h2>
            </div>
            <div className={`status-pill tone-${statusTone(connectionState.status)}`}>
              {connectionState.status}
            </div>
          </div>

          <div className="selected-device-strip sidebar-target">
            <span className="focus-label">Host</span>
            <strong>{selectedHostLabel}</strong>
            <span>{isConnected ? backendLabel(activeBackend) : preferredPathLabel}</span>
          </div>

          <div className="status-facts sidebar-facts">
            <span>
              <strong>Backend:</strong>
              {' '}
              {isConnected ? backendLabel(activeBackend) : preferredPathLabel}
            </span>
            <span>
              <strong>ADB apps:</strong>
              {' '}
              {capabilities.apps ? 'Ready' : 'Needs ADB'}
            </span>
            <span>
              <strong>Typing:</strong>
              {' '}
              {capabilities.typing ? 'Ready' : 'Needs ADB'}
            </span>
          </div>

          <div className="action-row">
            {waitingForNativeCode ? (
              <>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void connectUsingSetup('adb')}
                  disabled={!hasSelectedTv || !form.adbEnabled || busy === 'connect'}
                >
                  Use ADB instead
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void cancelNativePairing()}
                  disabled={busy === 'disconnect'}
                >
                  Cancel pairing
                </button>
              </>
            ) : isConnected ? (
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
                  onClick={() => void connectUsingSetup('adb')}
                  disabled={!hasSelectedTv || !form.adbEnabled || busy === 'connect'}
                >
                  {recommendedAdbLabel}
                </button>
              </>
            )}
          </div>

          <div className="latest-note">
            <span className="focus-label">Latest note</span>
            <strong>{statusMessage}</strong>
          </div>
        </section>

        {renderNativePairingPanel('sidebar-pairing')}
      </aside>

      <main className="app-main">
        <section className="panel status-strip hero-panel">
          <div className="status-strip-copy">
            <p className="eyebrow">{currentView.eyebrow}</p>
            <h2>{currentView.title}</h2>
            <p className="muted">{currentView.description}</p>
          </div>

          <div className="status-strip-side">
            <div className="hero-status">
              <strong>{statusTitle}</strong>
              <span className="muted">{statusDetail}</span>
            </div>
            <div className="status-facts hero-facts">
              <span>
                <strong>TV:</strong>
                {' '}
                {activeDevice?.name ?? setupTargetName}
              </span>
              <span>
                <strong>Host:</strong>
                {' '}
                {selectedHostLabel}
              </span>
              <span>
                <strong>Path:</strong>
                {' '}
                {isConnected ? backendLabel(activeBackend) : preferredPathLabel}
              </span>
            </div>
          </div>
        </section>

        {tab === 'setup' && (
          <section className="content-grid setup-layout">
            <div className="page-stack">
              <section className="panel section-block">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">1. Choose TV</p>
                    <h2>Pick a saved TV, a nearby TV, or type one in</h2>
                  </div>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void scanNativeDevices()}
                    disabled={busy === 'discover'}
                  >
                    Refresh discovery
                  </button>
                </div>

                {devices.length > 0 ? (
                  <div className="list-block">
                    <p className="list-label">Saved TVs</p>
                    <div className="simple-list">
                      {devices.map((device) => (
                        <div
                          key={device.id}
                          className={`list-item ${savedSelectedDevice?.id === device.id ? 'active' : ''}`}
                        >
                          <div className="list-item-copy">
                            <strong>{device.name}</strong>
                            <span>{device.host}</span>
                            <small>
                              {device.lastConnectedAt
                                ? `${device.lastConnectedBackend ?? 'unknown'} · ${new Date(device.lastConnectedAt).toLocaleString()}`
                                : 'Not connected yet'}
                            </small>
                          </div>
                          <div className="list-item-actions">
                            <button className="ghost-button" type="button" onClick={() => selectSavedDevice(device)}>
                              Load
                            </button>
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => void connectSavedDevice(device)}
                              disabled={busy === `connect-${device.id}`}
                            >
                              Connect
                            </button>
                            <button
                              className="ghost-button danger-button"
                              type="button"
                              onClick={() => void deleteSavedDevice(device)}
                              disabled={busy === `delete-${device.id}`}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="list-block">
                  <p className="list-label">Nearby TVs</p>
                  {discoveredDevices.length === 0 ? (
                    <p className="muted">
                      Discovery is optional. If nothing appears here, just type the host or IP below.
                    </p>
                  ) : (
                    <div className="simple-list">
                      {discoveredDevices.map((device) => (
                        <div
                          key={`${device.host}:${device.remotePort}`}
                          className={`list-item ${form.host === device.host ? 'active' : ''}`}
                        >
                          <div className="list-item-copy">
                            <strong>{device.name}</strong>
                            <span>{device.host}</span>
                            <small>Native remote {device.remotePort} · Pair {device.pairingPort}</small>
                          </div>
                          <div className="list-item-actions">
                            <button className="ghost-button" type="button" onClick={() => applyDiscoveredDevice(device)}>
                              Use TV
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="field-row">
                  <label>
                    Friendly name
                    <input
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Bedroom TV"
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

                <div className="selected-device-strip">
                  <span className="focus-label">Current target</span>
                  <strong>{hasSelectedTv ? setupTargetName : 'No TV selected yet'}</strong>
                  <span>{hasSelectedTv ? selectedHostLabel : 'Pick a TV above or type the host manually.'}</span>
                </div>

                <div className="action-row">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void saveSetup()}
                    disabled={busy === 'save' || !hasSelectedTv}
                  >
                    Save TV profile
                  </button>
                </div>
              </section>

              {!diagnostics?.adb.available ? (
                <section className="panel section-block warning-block">
                  <p className="eyebrow">ADB Needed</p>
                  <h2>ADB is not installed or not detected</h2>
                  <p className="warning-copy">{diagnostics?.adb.installHint}</p>
                </section>
              ) : (
                <section className="panel section-block info-block">
                  <p className="eyebrow">ADB</p>
                  <h2>ADB is available</h2>
                  <p className="muted">
                    {diagnostics.adb.version}
                    {' · '}
                    {diagnostics.adb.path}
                  </p>
                </section>
              )}
            </div>

            <div className="page-stack">
              <section className="panel section-block section-primary">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">2. Recommended</p>
                    <h2>Connect with ADB</h2>
                  </div>
                  <span className="section-chip">Most reliable</span>
                </div>
                <p className="muted">
                  Use this first. It is the path this app handles best and it enables typing plus installed apps.
                </p>

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
                  <span>Enable ADB for this TV</span>
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
                  {form.adbMode === 'pair' ? (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void pairAdb()}
                      disabled={!form.adbEnabled || busy === 'adb-pair' || !hasSelectedTv || !form.adbPairCode.trim()}
                    >
                      Pair ADB and connect
                    </button>
                  ) : (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void connectUsingSetup('adb')}
                      disabled={!form.adbEnabled || busy === 'connect' || !hasSelectedTv}
                    >
                      Connect with ADB
                    </button>
                  )}
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, preferredBackend: 'adb' }))}
                  >
                    Make ADB the default
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void saveSetup('adb')}
                    disabled={busy === 'save' || !hasSelectedTv}
                  >
                    Save ADB settings
                  </button>
                </div>

                <p className="muted">
                  If Wireless Debugging is already paired on the TV, use Direct connect. Otherwise use Pair then connect.
                </p>
              </section>

              <section className="panel section-block section-secondary">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">3. Optional</p>
                    <h2>Try native remote</h2>
                  </div>
                  <span className="section-chip section-chip-muted">Less reliable</span>
                </div>
                <p className="muted">
                  This is the Google TV style path. On some TVs it works well, and on others the pairing prompt is inconsistent.
                  If the TV does not show a code, stop and use ADB instead.
                </p>

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
                    className="primary-button"
                    type="button"
                    onClick={() => void beginNativePairing('native')}
                    disabled={busy === 'native-pair' || !hasSelectedTv}
                  >
                    {nativePaired ? 'Pair native again' : 'Start native pairing'}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void connectUsingSetup('native')}
                    disabled={busy === 'connect' || !nativePaired || !hasSelectedTv}
                  >
                    Connect with saved native pairing
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, preferredBackend: 'native' }))}
                  >
                    Make native the default
                  </button>
                </div>

                {waitingForNativeCode ? (
                  <div className="callout">
                    Pairing is active right now. The code entry box stays visible in the left rail, and it is repeated here on smaller screens.
                  </div>
                ) : null}
              </section>

              {renderNativePairingPanel('pairing-panel-inline')}
            </div>
          </section>
        )}

        {tab === 'remote' &&
          (isConnected ? (
            <section className="page-stack">
              <section className="panel section-block compact-header">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Remote</p>
                    <h2>{activeDevice ? activeDevice.name : 'Remote'}</h2>
                  </div>
                  <span className="muted">
                    {activeDevice ? `${backendLabel(activeBackend)} · ${activeDevice.host}` : 'No active TV'}
                  </span>
                </div>
              </section>

              <section className="content-grid remote-layout">
                <div className="panel remote-pad-panel">
                  <div className="panel-heading">
                    <h2>Navigate</h2>
                    <span>Arrow keys and Enter work here too.</span>
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
                </div>

                <div className="panel controls-panel">
                  <div className="panel-heading">
                    <h2>Controls</h2>
                    <span>{activeBackend === 'native' ? 'Using native remote.' : 'Using ADB.'}</span>
                  </div>
                  <div className="button-grid">
                    {remoteButtons.map((button) => (
                      <button
                        key={button.command}
                        type="button"
                        className={`remote-button ${button.accent ? 'accent' : ''}`}
                        onClick={() => void sendRemoteCommand(button.command)}
                        disabled={!isConnected}
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
                          ? 'Text input will use ADB fallback.'
                          : 'ADB is required for text input.'
                        : 'Text input is ready.'}
                    </span>
                  </div>
                  {!capabilities.typing ? (
                    <div className="callout">
                      Text entry needs ADB. Go back to Setup and connect or pair ADB for this TV.
                    </div>
                  ) : null}
                  <textarea
                    value={textInput}
                    onChange={(event) => setTextInput(event.target.value)}
                    placeholder="Type something to send to the TV..."
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
            </section>
          ) : (
            <section className="panel empty-state">
              <p className="eyebrow">Remote</p>
              <h2>No TV is connected yet</h2>
              <p className="muted">Go to Setup and connect with ADB first. That path is the most reliable here.</p>
              <div className="action-row">
                <button className="primary-button" type="button" onClick={() => setTab('setup')}>
                  Open setup
                </button>
              </div>
            </section>
          ))}

        {tab === 'apps' &&
          (isConnected ? (
            <section className="page-stack">
              <section className="panel section-block">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Apps</p>
                    <h2>Launch installed apps</h2>
                  </div>
                  <div className="action-row compact">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => void loadApps(true)}
                      disabled={appsAreLoading}
                    >
                      {activeAppsCache ? 'Update installed apps' : 'Fetch installed apps'}
                    </button>
                  </div>
                </div>

                {!capabilities.apps ? (
                  <div className="callout">
                    Installed-app browsing needs ADB. Go back to Setup and connect ADB for this TV.
                  </div>
                ) : null}

                {capabilities.apps ? (
                  <div className={`apps-status-bar ${appsAreLoading ? 'loading' : ''}`}>
                    <div className="apps-status-copy">
                      <strong>
                        {appsAreLoading
                          ? activeAppsCache
                            ? 'Updating installed apps for this TV'
                            : 'Fetching installed apps for this TV'
                          : activeAppsCache
                            ? 'Showing cached installed apps'
                            : 'No installed-app cache yet'}
                      </strong>
                      <span>
                        {appsAreLoading
                          ? 'This can take a bit when the app is collecting friendly names and icons.'
                          : activeAppsCache
                            ? `Last updated ${formatAppsUpdatedAt(activeAppsCache.updatedAt)}. This list will stay cached until you update it.`
                            : 'The first fetch builds and stores the installed-app list for this saved TV.'}
                      </span>
                    </div>
                    <div className="apps-status-track" aria-hidden="true">
                      <div className="apps-status-fill" />
                    </div>
                  </div>
                ) : null}

                <input
                  value={appsQuery}
                  onChange={(event) => setAppsQuery(event.target.value)}
                  placeholder="Search apps"
                  disabled={!capabilities.apps}
                />

                <div className="app-list">
                  {filteredApps.length === 0 ? (
                    <p className="muted">
                      {capabilities.apps
                        ? activeAppsCache
                          ? 'No cached apps match that search.'
                          : 'No installed apps cached yet. Fetch installed apps to build the list for this TV.'
                        : 'ADB is required for app discovery.'}
                    </p>
                  ) : (
                    filteredApps.map((app) => (
                      <button
                        key={app.packageName}
                        className="app-card"
                        type="button"
                        onClick={() => void launchApp(app)}
                        disabled={busy === app.packageName}
                        title={app.packageName}
                      >
                        <div className="app-card-head">
                          {app.iconDataUrl ? (
                            <img className="app-icon" src={app.iconDataUrl} alt="" aria-hidden="true" />
                          ) : (
                            <div
                              className="app-badge"
                              style={{ backgroundColor: getAppBadgeTone(app.packageName) }}
                              aria-hidden="true"
                            >
                              {getAppBadgeLabel(app)}
                            </div>
                          )}
                          <div className="app-card-copy">
                            <strong>{app.displayName}</strong>
                            <small>{app.category === 'leanback' ? 'TV launcher' : 'Standard launcher'}</small>
                          </div>
                        </div>
                        {deferredAppsQuery.trim() ? (
                          <span className="app-package">{app.packageName}</span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </section>
            </section>
          ) : (
            <section className="panel empty-state">
              <p className="eyebrow">Apps</p>
              <h2>No TV is connected yet</h2>
              <p className="muted">Connect with ADB in Setup before browsing installed apps.</p>
              <div className="action-row">
                <button className="primary-button" type="button" onClick={() => setTab('setup')}>
                  Open setup
                </button>
              </div>
            </section>
          ))}
      </main>
    </div>
  )
}
