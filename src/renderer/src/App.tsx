import { useDeferredValue, useEffect, useRef, useState } from 'react'
import type {
  ActionFeedback,
  ConnectionBackend,
  ConnectionState,
  DiagnosticsStatus,
  DiscoveredNativeDevice,
  LaunchableApp,
  PreferredConnectionBackend,
  RecommendedAction,
  RemoteCommand,
  SavedDevice
} from '@shared/types'
import {
  getQuickActionLabel,
  getRecommendedActionMeta,
  groupApps,
  keyBindings,
  shortcutLegend,
  shouldHandleRemoteKey
} from './viewModel'

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
    description: 'Choose a TV, use ADB first, and let the health panel tell you what is blocked versus ready.'
  },
  {
    id: 'remote',
    label: 'Remote',
    eyebrow: 'Control',
    title: 'Remote control with a visible keyboard mode.',
    description: 'Use the pad, the quick actions, or your keyboard without guessing what shortcuts are active.'
  },
  {
    id: 'apps',
    label: 'Apps',
    eyebrow: 'Launch',
    title: 'Pinned apps, recent launches, and the full installed list.',
    description: 'Keep daily-use apps close while still browsing everything discovered over ADB.'
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
    preferredBackend: device.preferredBackend ?? 'adb',
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

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return 'Never'
  }

  return new Date(timestamp).toLocaleString()
}

function feedbackTone(status: ActionFeedback['status']): 'neutral' | 'positive' | 'danger' | 'warning' {
  switch (status) {
    case 'success':
    case 'sent':
      return 'positive'
    case 'blocked':
      return 'warning'
    case 'error':
      return 'danger'
  }
}

function getNativeSetupState(input: {
  hasSelectedTv: boolean
  waitingForNativeCode: boolean
  pendingNativePairing: DiagnosticsStatus['pendingNativePairing']
  isConnected: boolean
  activeBackend: ConnectionBackend | null
  nativePaired: boolean
  nativeLastError?: string
  nativeLastConnectedAt?: string
}): {
  badge: string
  title: string
  detail: string
  tone: 'neutral' | 'positive' | 'warning' | 'danger'
} {
  if (!input.hasSelectedTv) {
    return {
      badge: 'Idle',
      title: 'Choose a TV first',
      detail: 'Native pairing stays off until you explicitly start it for a selected TV.',
      tone: 'neutral'
    }
  }

  if (input.waitingForNativeCode) {
    return {
      badge: 'Pairing',
      title: 'Waiting for the TV code',
      detail: input.pendingNativePairing
        ? `${input.pendingNativePairing.name} is waiting for a native pairing code.`
        : 'The TV should show a native pairing code before you confirm it here.',
      tone: 'warning'
    }
  }

  if (input.isConnected && input.activeBackend === 'native') {
    return {
      badge: 'Connected',
      title: 'Native remote is connected',
      detail: 'This TV is currently using the saved native pairing.',
      tone: 'positive'
    }
  }

  if (input.nativePaired) {
    return {
      badge: 'Saved',
      title: 'Native pairing is saved',
      detail: 'Nothing will start automatically. Use the saved native pairing only when you want to test or use it.',
      tone: 'positive'
    }
  }

  if (input.nativeLastError) {
    return {
      badge: 'Failed',
      title: 'Native pairing needs attention',
      detail: input.nativeLastError,
      tone: 'danger'
    }
  }

  return {
    badge: 'Not paired',
    title: 'Native pairing is not saved yet',
    detail:
      input.nativeLastConnectedAt
        ? `Last successful native session was ${formatTimestamp(input.nativeLastConnectedAt)}. Pair again only if you want to reuse it.`
        : 'Nothing will start automatically. Start native pairing only if you want to try this optional path.',
    tone: 'neutral'
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
  const [actionFeed, setActionFeed] = useState<ActionFeedback[]>([])
  const [actionToasts, setActionToasts] = useState<ActionFeedback[]>([])
  const [commandCooldowns, setCommandCooldowns] = useState<Partial<Record<RemoteCommand, number>>>({})
  const [pendingRemoteCommand, setPendingRemoteCommand] = useState<RemoteCommand | null>(null)
  const [pendingAppPackage, setPendingAppPackage] = useState<string | null>(null)
  const [pendingQuickActionId, setPendingQuickActionId] = useState<string | null>(null)
  const [cooldownTick, setCooldownTick] = useState(Date.now())
  const [foregroundAppState, setForegroundAppState] = useState(diagnostics?.foregroundApp ?? null)
  const deferredAppsQuery = useDeferredValue(appsQuery)
  const diagnosticsRequestRef = useRef(0)
  const diagnosticsInFlightRef = useRef<Promise<void> | null>(null)
  const diagnosticsQueuedRef = useRef(false)
  const foregroundRequestRef = useRef(0)

  const activeDevice = diagnostics?.activeDevice ?? null
  const activeAppsCache = activeDevice?.cachedApps ?? null
  const activeBackend = diagnostics?.activeBackend ?? null
  const pendingNativePairing = diagnostics?.pendingNativePairing ?? null
  const health = diagnostics?.health ?? null
  const recommendedActions = diagnostics?.recommendedActions ?? []
  const quickActions = diagnostics?.quickActions ?? []
  const foregroundApp = foregroundAppState ?? diagnostics?.foregroundApp ?? null
  const capabilities = diagnostics?.capabilities ?? {
    nativeRemote: false,
    adbFallback: false,
    typing: false,
    apps: false
  }
  const waitingForNativeCode = Boolean(
    pendingNativePairing || (connectionState.status === 'pairing' && connectionState.backend === 'native')
  )
  const currentView = viewTabs.find((item) => item.id === tab) ?? viewTabs[0]
  const setupTargetName = form.name.trim() || form.host.trim() || 'your TV'
  const hasSelectedTv = Boolean(form.host.trim())
  const isConnected = connectionState.status === 'connected'
  const activeMatchesForm = Boolean(activeDevice && form.host.trim() && activeDevice.host === form.host.trim())
  const savedSelectedDevice = devices.find((device) => device.host === form.host.trim()) ?? null
  const setupDevice = savedSelectedDevice ?? (activeMatchesForm ? activeDevice : null)
  const nativePaired = Boolean(setupDevice?.nativeRemote?.certificate)
  const nativeSetupState = getNativeSetupState({
    hasSelectedTv,
    waitingForNativeCode,
    pendingNativePairing,
    isConnected,
    activeBackend,
    nativePaired,
    nativeLastError: setupDevice?.backendHealth?.native.lastError,
    nativeLastConnectedAt: setupDevice?.backendHealth?.native.lastConnectedAt
  })
  const selectedHostLabel =
    activeDevice?.host ?? (form.host.trim() !== '' ? form.host.trim() : 'Choose a TV in Setup to begin.')
  const preferredPathLabel =
    form.preferredBackend === 'adb' ? 'ADB' : form.preferredBackend === 'native' ? 'Native Remote' : 'Auto'
  const recommendedAdbLabel = form.adbMode === 'pair' ? 'Pair ADB and connect' : 'Connect with ADB'
  const appsAreLoading = busy === 'apps'
  const appSections = groupApps(apps, activeDevice, deferredAppsQuery)
  const visibleAppCount =
    appSections.favorites.length + appSections.recents.length + appSections.others.length
  const latestAction = actionFeed[0] ?? null
  const heroTitle = waitingForNativeCode
    ? 'Finish native pairing or switch back to ADB'
    : health?.summary ??
      (isConnected && activeDevice ? `Connected to ${activeDevice.name}` : 'No TV connected yet')
  const heroDetail = waitingForNativeCode
    ? 'If the TV never shows a pairing code, stop here and use ADB instead.'
    : health?.detail ?? 'Start with ADB unless you specifically want to try native remote.'

  async function refreshDiagnostics(): Promise<void> {
    if (diagnosticsInFlightRef.current) {
      diagnosticsQueuedRef.current = true
      return diagnosticsInFlightRef.current
    }

    const run = async () => {
      do {
        diagnosticsQueuedRef.current = false
        const requestId = ++diagnosticsRequestRef.current
        const next = await window.tvRemoteApi.getDiagnostics()

        if (requestId !== diagnosticsRequestRef.current) {
          continue
        }

        setDiagnostics(next)
        setDevices(next.savedDevices)
        setConnectionState(next.connectionState)
      } while (diagnosticsQueuedRef.current)
    }

    const promise = run().finally(() => {
      diagnosticsInFlightRef.current = null
    })

    diagnosticsInFlightRef.current = promise
    return promise
  }

  async function refreshForegroundApp(): Promise<void> {
    if (connectionState.status !== 'connected' || !activeDevice || !capabilities.apps) {
      setForegroundAppState(null)
      return
    }

    const requestId = ++foregroundRequestRef.current

    try {
      const next = await window.tvRemoteApi.getForegroundApp()
      if (requestId !== foregroundRequestRef.current) {
        return
      }
      setForegroundAppState(next)
    } catch {
      if (requestId !== foregroundRequestRef.current) {
        return
      }
      setForegroundAppState(null)
    }
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

    if (activeAppsCache || (appsDeviceId === activeDevice?.id && apps.length > 0)) {
      return
    }

    void loadApps()
  }, [
    activeAppsCache,
    activeDevice?.id,
    apps.length,
    appsDeviceId,
    capabilities.apps,
    connectionState.status,
    tab
  ])

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
  }, [activeAppsCache, activeDevice, appsDeviceId, connectionState.status])

  useEffect(() => {
    if (tab !== 'remote') {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!shouldHandleRemoteKey(event.target)) {
        return
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
  }, [connectionState.status, tab])

  useEffect(() => {
    const hasActiveCooldown = Object.values(commandCooldowns).some((value) => (value ?? 0) > Date.now())

    if (!hasActiveCooldown) {
      return
    }

    const timer = window.setInterval(() => {
      setCooldownTick(Date.now())
    }, 500)

    return () => window.clearInterval(timer)
  }, [commandCooldowns])

  useEffect(() => {
    if (
      connectionState.status !== 'connected' ||
      !activeDevice ||
      !capabilities.apps ||
      (tab !== 'remote' && tab !== 'apps')
    ) {
      setForegroundAppState(null)
      return
    }

    setForegroundAppState(null)
    void refreshForegroundApp()
    const timer = window.setInterval(() => {
      void refreshForegroundApp()
    }, 6000)

    return () => window.clearInterval(timer)
  }, [activeDevice?.id, capabilities.apps, connectionState.status, tab])

  function createLocalFeedback(input: Omit<ActionFeedback, 'id' | 'createdAt'>): ActionFeedback {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      ...input
    }
  }

  function publishFeedback(feedback: ActionFeedback): void {
    setActionFeed((current) => [feedback, ...current].slice(0, 8))
    setActionToasts((current) => [feedback, ...current].slice(0, 3))
    setStatusMessage(feedback.detail)

    if (feedback.command && feedback.cooldownMs) {
      setCommandCooldowns((current) => ({
        ...current,
        [feedback.command!]: Date.now() + feedback.cooldownMs!
      }))
    }

    window.setTimeout(() => {
      setActionToasts((current) => current.filter((item) => item.id !== feedback.id))
    }, feedback.status === 'blocked' ? 3600 : 3000)
  }

  function publishErrorFeedback(
    title: string,
    error: unknown,
    kind: ActionFeedback['kind'],
    extras?: Partial<ActionFeedback>
  ): void {
    const detail = error instanceof Error ? error.message : title
    publishFeedback(
      createLocalFeedback({
        status: 'error',
        kind,
        title,
        detail,
        ...extras
      })
    )
  }

  function commandCooldownRemaining(command: RemoteCommand): number {
    return Math.max(0, (commandCooldowns[command] ?? 0) - cooldownTick)
  }

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
        current.preferredBackend === preferredBackend ? current : { ...current, preferredBackend }
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
      setTab(state.status === 'connected' ? 'remote' : 'setup')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not start native pairing.')
    } finally {
      setBusy(null)
    }
  }

  async function completeNativePairing(): Promise<void> {
    setBusy('native-confirm')
    try {
      const state = await window.tvRemoteApi.completeNativePairing({ code: form.nativeCode })
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

      setForm((current) => ({ ...current, preferredBackend }))
      setStatusMessage(state.message ?? 'Connected.')
      await refreshDiagnostics()

      if (state.status === 'connected') {
        setTab('remote')
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
    setPendingRemoteCommand(command)
    try {
      const feedback = await window.tvRemoteApi.sendRemoteCommand(command)
      publishFeedback(feedback)
    } catch (error) {
      publishErrorFeedback('Remote command failed.', error, 'remote', { command })
    } finally {
      setPendingRemoteCommand((current) => (current === command ? null : current))
    }
  }

  async function sendText(): Promise<void> {
    setBusy('text')
    try {
      const feedback = await window.tvRemoteApi.sendText({ text: textInput })
      publishFeedback({
        ...feedback,
        detail:
          activeBackend === 'native'
            ? 'Text was sent through ADB fallback because native remote does not handle typing.'
            : feedback.detail
      })
      setTextInput('')
      await refreshDiagnostics()
    } catch (error) {
      publishErrorFeedback('Typing failed.', error, 'text')
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

    setBusy('apps')
    try {
      const nextApps = await window.tvRemoteApi.listApps(forceRefresh)
      setApps(nextApps)
      setAppsDeviceId(activeDevice?.id ?? null)
      setStatusMessage(
        forceRefresh
          ? `Refreshed ${nextApps.length} apps${activeBackend === 'native' ? ' through ADB fallback' : ''}.`
          : `Loaded ${nextApps.length} launchable apps${activeBackend === 'native' ? ' through ADB fallback' : ''}.`
      )
      await refreshDiagnostics()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not load apps.')
    } finally {
      setBusy(null)
    }
  }

  async function launchApp(app: LaunchableApp): Promise<void> {
    setPendingAppPackage(app.packageName)
    try {
      const feedback = await window.tvRemoteApi.launchApp(app)
      publishFeedback({
        ...feedback,
        detail:
          activeBackend === 'native'
            ? `${app.displayName} was requested through ADB fallback because native remote cannot launch apps reliably.`
            : feedback.detail
      })
      await refreshDiagnostics()
    } catch (error) {
      publishErrorFeedback(`Launch failed for ${app.displayName}.`, error, 'app', {
        appPackage: app.packageName
      })
    } finally {
      setPendingAppPackage((current) => (current === app.packageName ? null : current))
    }
  }

  async function toggleFavorite(packageName: string): Promise<void> {
    setBusy(`favorite-${packageName}`)
    try {
      const updated = await window.tvRemoteApi.toggleFavoriteApp(packageName)
      publishFeedback(
        createLocalFeedback({
          status: 'success',
          kind: 'favorite',
          title: updated.favorites?.includes(packageName) ? 'Pinned app' : 'Removed app pin',
          detail: updated.favorites?.includes(packageName)
            ? 'This app is now pinned near the top for this TV.'
            : 'This app was removed from the pinned section for this TV.',
          appPackage: packageName
        })
      )
      await refreshDiagnostics()
    } catch (error) {
      publishErrorFeedback('Could not update app pin.', error, 'favorite', { appPackage: packageName })
    } finally {
      setBusy(null)
    }
  }

  async function runAdbTroubleshooter(): Promise<void> {
    setBusy('troubleshoot')
    try {
      const result = await window.tvRemoteApi.runAdbTroubleshooting()
      setStatusMessage(result?.summary ?? 'Troubleshooter finished.')
      await refreshDiagnostics()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Troubleshooter failed.')
    } finally {
      setBusy(null)
    }
  }

  async function runRecommendedAction(action: RecommendedAction): Promise<void> {
    switch (action) {
      case 'pair_adb':
        setTab('setup')
        setForm((current) => ({ ...current, adbMode: 'pair', preferredBackend: 'adb' }))
        setStatusMessage('Enter the TV pairing code in Setup, then pair ADB.')
        break
      case 'connect_adb':
        setTab('setup')
        await connectUsingSetup('adb')
        break
      case 'switch_to_adb':
        setTab('setup')
        await connectUsingSetup('adb')
        break
      case 'retry_native':
        setTab('setup')
        await beginNativePairing()
        break
      case 'open_remote':
        setTab('remote')
        break
      case 'open_apps':
        setTab('apps')
        if (!activeAppsCache) {
          await loadApps()
        }
        break
    }
  }

  async function runQuickAction(id: string): Promise<void> {
    setPendingQuickActionId(id)
    try {
      const feedback = await window.tvRemoteApi.runQuickAction(id)
      publishFeedback({
        ...feedback,
        kind: 'quick_action',
        actionId: id
      })
      await refreshDiagnostics()
    } catch (error) {
      publishErrorFeedback('Quick action failed.', error, 'quick_action', { actionId: id })
    } finally {
      setPendingQuickActionId((current) => (current === id ? null : current))
    }
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

  function renderRemoteButtonCopy(button: { label: string; command: RemoteCommand; accent?: boolean }) {
    const remainingMs = commandCooldownRemaining(button.command)

    if (remainingMs <= 0) {
      return <span>{button.label}</span>
    }

    return (
      <>
        <span>{button.label}</span>
        <small>{Math.ceil(remainingMs / 1000)}s</small>
      </>
    )
  }

  function renderNativePairingPanel() {
    if (!waitingForNativeCode) {
      return null
    }

    return (
      <section className="activity-panel pairing-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Native Pairing</p>
            <h2>Enter the TV code or switch back to ADB</h2>
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

  function renderRecommendedButtons() {
    if (recommendedActions.length === 0) {
      return null
    }

    return (
      <div className="action-strip">
        {recommendedActions.map((action) => {
          const meta = getRecommendedActionMeta(action)

          return (
            <button
              key={action}
              className="primary-button"
              type="button"
              onClick={() => void runRecommendedAction(action)}
              disabled={busy !== null}
              title={meta.detail}
            >
              {meta.label}
            </button>
          )
        })}
      </div>
    )
  }

  function renderAppSection(title: string, sectionApps: LaunchableApp[]) {
    if (sectionApps.length === 0) {
      return null
    }

    return (
      <section className="app-section-block">
        <div className="section-header compact-header">
          <h3>{title}</h3>
          <span>{sectionApps.length}</span>
        </div>
        <div className="app-list">
          {sectionApps.map((app) => {
            const isFavorite = activeDevice?.favorites?.includes(app.packageName) ?? false
            const isLaunching = pendingAppPackage === app.packageName

            return (
              <article
                key={app.packageName}
                className={`app-card ${isLaunching ? 'app-card-busy' : ''}`}
                title={app.packageName}
              >
                <div className="app-card-top">
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
                  <button
                    className={`ghost-button app-pin-button ${isFavorite ? 'active' : ''}`}
                    type="button"
                    onClick={() => void toggleFavorite(app.packageName)}
                    disabled={busy === `favorite-${app.packageName}`}
                  >
                    {isFavorite ? 'Pinned' : 'Pin'}
                  </button>
                </div>
                {deferredAppsQuery.trim() ? <span className="app-package">{app.packageName}</span> : null}
                <div className="app-card-footer">
                  <button
                    className="primary-button app-launch-button"
                    type="button"
                    onClick={() => void launchApp(app)}
                    disabled={isLaunching}
                  >
                    {isLaunching ? 'Launching…' : 'Launch'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <div className="app-shell">
      <div className="toast-stack" aria-live="polite">
        {actionToasts.map((toast) => (
          <div key={toast.id} className={`toast-card tone-${feedbackTone(toast.status)}`}>
            <strong>{toast.title}</strong>
            <span>{toast.detail}</span>
          </div>
        ))}
      </div>

      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">Android TV Remote</p>
          <h1>Android TV Remote</h1>
          <p className="lede">Start with ADB. Keep native optional. Make the current TV and next step obvious.</p>
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
              <span>
                {item.id === 'setup'
                  ? 'Choose a TV and resolve what is blocking it'
                  : item.id === 'remote'
                    ? 'Control the connected TV and use keyboard mode'
                    : 'Browse favorites, recents, and installed apps'}
              </span>
            </button>
          ))}
        </nav>

        <section className="panel sidebar-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Current TV</p>
              <h2>{activeDevice?.name ?? setupTargetName}</h2>
            </div>
            <div className={`status-pill tone-${statusTone(connectionState.status)}`}>{connectionState.status}</div>
          </div>

          <div className="selected-device-strip sidebar-target">
            <span className="focus-label">Host</span>
            <strong>{selectedHostLabel}</strong>
            <span>{isConnected ? backendLabel(activeBackend) : preferredPathLabel}</span>
          </div>

          <div className="status-facts sidebar-facts">
            <span>
              <strong>Backend:</strong> {isConnected ? backendLabel(activeBackend) : preferredPathLabel}
            </span>
            <span>
              <strong>ADB:</strong> {health?.adb.ready ? 'Ready' : capabilities.adbFallback ? 'Enabled' : 'Needs Setup'}
            </span>
            <span>
              <strong>Current app:</strong> {foregroundApp?.displayName ?? 'Unknown'}
            </span>
          </div>

          <div className="action-row">
            {isConnected ? (
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

          <div className="activity-panel">
            <div className="section-header compact-header">
              <div>
                <span className="focus-label">Action Center</span>
                <h3>{latestAction?.title ?? 'No recent actions yet'}</h3>
              </div>
              {latestAction ? (
                <div className={`status-pill tone-${feedbackTone(latestAction.status)}`}>{latestAction.status}</div>
              ) : null}
            </div>
            <p className="muted">{latestAction?.detail ?? statusMessage}</p>
            {actionFeed.length > 0 ? (
              <div className="activity-list">
                {actionFeed.slice(0, 5).map((action) => (
                  <div key={action.id} className={`activity-item tone-${feedbackTone(action.status)}`}>
                    <strong>{action.title}</strong>
                    <span>{action.detail}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

      </aside>

      <main className="app-main">
        <section className="panel status-strip hero-panel">
          <div className="status-strip-copy">
            <p className="eyebrow">{currentView.eyebrow}</p>
            <h2>{currentView.title}</h2>
            <p className="muted">{currentView.description}</p>
            <div className="hero-status">
              <strong>{heroTitle}</strong>
              <span className="muted">{heroDetail}</span>
            </div>
            {renderRecommendedButtons()}
          </div>

          <div className="status-strip-side">
            <div className="status-facts hero-facts hero-health-grid">
              <span>
                <strong>TV:</strong> {activeDevice?.name ?? setupTargetName}
              </span>
              <span>
                <strong>Host:</strong> {selectedHostLabel}
              </span>
              <span>
                <strong>Path:</strong> {isConnected ? backendLabel(activeBackend) : preferredPathLabel}
              </span>
              <span>
                <strong>ADB last success:</strong> {formatTimestamp(activeDevice?.backendHealth?.adb.lastConnectedAt)}
              </span>
              <span>
                <strong>Native last success:</strong> {formatTimestamp(activeDevice?.backendHealth?.native.lastConnectedAt)}
              </span>
              <span>
                <strong>Foreground app:</strong> {foregroundApp?.displayName ?? 'Unavailable'}
              </span>
            </div>

            {quickActions.length > 0 ? (
              <div className="quick-action-panel">
                <div className="section-header compact-header">
                  <h3>Quick Actions</h3>
                  <span>Reliable shortcuts</span>
                </div>
                <div className="quick-action-grid">
                  {quickActions.map((action) => (
                    <button
                      key={action.id}
                      className="ghost-button quick-action-button"
                      type="button"
                      onClick={() => void runQuickAction(action.id)}
                      disabled={action.disabled || pendingQuickActionId === action.id}
                      title={action.detail}
                    >
                      <strong>{getQuickActionLabel(action)}</strong>
                      <span>{action.detail}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
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
                                ? `${device.lastConnectedBackend ?? 'unknown'} · ${formatTimestamp(device.lastConnectedAt)}`
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
                    <p className="muted">Discovery is optional. If nothing appears here, just type the host or IP below.</p>
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

              <section className="panel section-block info-block">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">ADB Troubleshooter</p>
                    <h2>Make failure states concrete</h2>
                  </div>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void runAdbTroubleshooter()}
                    disabled={busy === 'troubleshoot' || !hasSelectedTv}
                  >
                    Run checks
                  </button>
                </div>
                {!diagnostics?.adb.available ? (
                  <p className="warning-copy">{diagnostics?.adb.installHint}</p>
                ) : (
                  <p className="muted">
                    {diagnostics.adb.version} · {diagnostics.adb.path}
                  </p>
                )}
                {health ? (
                  <div className="health-panel">
                    <div className="health-summary">
                      <strong>{health.summary}</strong>
                      <span>{health.detail}</span>
                    </div>
                    <div className="health-grid">
                      <div className="health-card">
                        <span className="focus-label">ADB</span>
                        <strong>{health.adb.ready ? 'Ready' : health.adb.available ? 'Needs attention' : 'Unavailable'}</strong>
                        <span>{health.adb.lastError ?? `Last success ${formatTimestamp(health.adb.lastConnectedAt)}`}</span>
                      </div>
                      <div className="health-card">
                        <span className="focus-label">Native</span>
                        <strong>{health.native.ready ? 'Ready' : health.native.available ? 'Optional' : 'Not configured'}</strong>
                        <span>{health.native.lastError ?? `Last success ${formatTimestamp(health.native.lastConnectedAt)}`}</span>
                      </div>
                    </div>
                    <div className="issue-list">
                      {health.issues.map((issue) => (
                        <div key={issue.code} className={`issue-row issue-${issue.severity}`}>
                          <strong>{issue.summary}</strong>
                          <span>{issue.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="muted">Choose a TV first to see per-device health and troubleshooting steps.</p>
                )}
              </section>
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
                    onChange={(event) => setForm((current) => ({ ...current, adbEnabled: event.target.checked }))}
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
                  This path is fully manual now. It does not start during a normal connect, and it should stay secondary to ADB.
                </p>

                <div className="activity-panel native-setup-panel">
                  <div className="section-header compact-header">
                    <div>
                      <span className="focus-label">Native status</span>
                      <h3>{nativeSetupState.title}</h3>
                    </div>
                    <div className={`status-pill tone-${nativeSetupState.tone}`}>{nativeSetupState.badge}</div>
                  </div>
                  <p className="muted">{nativeSetupState.detail}</p>
                  {setupDevice?.backendHealth?.native.lastConnectedAt ? (
                    <span className="muted">
                      Last successful native session: {formatTimestamp(setupDevice.backendHealth.native.lastConnectedAt)}
                    </span>
                  ) : null}
                </div>

                <div className="field-row">
                  <label>
                    Native remote port
                    <input
                      value={form.nativeRemotePort}
                      onChange={(event) => setForm((current) => ({ ...current, nativeRemotePort: event.target.value }))}
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

                {renderNativePairingPanel()}

                <div className="action-row">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void beginNativePairing()}
                    disabled={busy === 'native-pair' || !hasSelectedTv || waitingForNativeCode}
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

                <p className="muted">
                  Start pairing only when you want to try native. If the TV does not show a code or never accepts it, cancel
                  and go back to ADB.
                </p>
              </section>
            </div>
          </section>
        )}

        {tab === 'remote' &&
          (isConnected ? (
            <section className="content-grid remote-layout">
              <div className="page-stack">
                <section className="panel controls-panel">
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
                    <button
                      type="button"
                      className="dpad-btn select"
                      onClick={() => void sendRemoteCommand('select')}
                    >
                      OK
                    </button>
                    <button type="button" className="dpad-btn right" onClick={() => void sendRemoteCommand('right')}>
                      Right
                    </button>
                    <button type="button" className="dpad-btn down" onClick={() => void sendRemoteCommand('down')}>
                      Down
                    </button>
                  </div>
                </section>

                <section className="panel controls-panel">
                  <div className="panel-heading">
                    <h2>Controls</h2>
                    <span>{activeBackend === 'native' ? 'Using native remote.' : 'Using ADB.'}</span>
                  </div>
                  <div className="button-grid">
                    {remoteButtons.map((button) => (
                      <button
                        key={button.command}
                        type="button"
                        className={`remote-button ${button.accent ? 'accent' : ''} ${pendingRemoteCommand === button.command ? 'is-pending' : ''} ${commandCooldownRemaining(button.command) > 0 ? 'is-cooling-down' : ''}`}
                        onClick={() => void sendRemoteCommand(button.command)}
                        disabled={
                          !isConnected ||
                          pendingRemoteCommand === button.command ||
                          commandCooldownRemaining(button.command) > 0
                        }
                      >
                        {renderRemoteButtonCopy(button)}
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <div className="page-stack">
                <section className="panel shortcut-panel">
                  <div className="panel-heading">
                    <h2>Keyboard Mode</h2>
                    <span>Only active on the Remote tab, and never while typing into an input.</span>
                  </div>
                  <div className="shortcut-grid">
                    {shortcutLegend.map((shortcut) => (
                      <div key={shortcut.keys} className="shortcut-card">
                        <strong>{shortcut.keys}</strong>
                        <span>{shortcut.action}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="panel text-panel">
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
                    <div className="callout">Text entry needs ADB. Go back to Setup and connect or pair ADB for this TV.</div>
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
                </section>
              </div>
            </section>
          ) : (
            <section className="panel empty-state">
              <p className="eyebrow">Remote</p>
              <h2>No TV is connected yet</h2>
              <p className="muted">Go to Setup and connect with ADB first. That path is still the most reliable here.</p>
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
                  <div className="callout">Installed-app browsing needs ADB. Go back to Setup and connect ADB for this TV.</div>
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
                            ? 'Showing saved app groups for this TV'
                            : 'No installed-app cache yet'}
                      </strong>
                      <span>
                        {appsAreLoading
                          ? 'This can take a bit when the app is collecting friendly names and icons.'
                          : activeAppsCache
                            ? `Last updated ${formatTimestamp(activeAppsCache.updatedAt)}. Favorites and recents are stored per TV.`
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

                {visibleAppCount === 0 ? (
                  <p className="muted">
                    {capabilities.apps
                      ? activeAppsCache
                        ? 'No pinned, recent, or cached apps match that search.'
                        : 'No installed apps cached yet. Fetch installed apps to build the list for this TV.'
                      : 'ADB is required for app discovery.'}
                  </p>
                ) : (
                  <>
                    {renderAppSection('Favorites', appSections.favorites)}
                    {renderAppSection('Recent', appSections.recents)}
                    {renderAppSection('All Apps', appSections.others)}
                  </>
                )}
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
