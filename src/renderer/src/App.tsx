import { useDeferredValue, useEffect, useRef, useState } from 'react'
import type {
  ActionFeedback,
  BackendHealthSnapshot,
  ConnectionBackend,
  ConnectionState,
  DiagnosticsStatus,
  DiscoveredNativeDevice,
  FavoriteAppHotkey,
  LaunchableApp,
  PreferredConnectionBackend,
  RecommendedAction,
  ResolvedAdbEndpoints,
  RemoteCommand,
  SavedDevice,
  ScrcpyPreset,
  SelectedApkFile
} from '@shared/types'
import {
  buildCommandPaletteItems,
  canAssignFavoriteHotkey,
  CommandPaletteItem,
  getRecommendedActionMeta,
  getPinnedRemoteCommands,
  getVisibleRemoteButtons,
  groupApps,
  keyBindings,
  shortcutLegend,
  shouldHandleRemoteKey
} from './viewModel'

type TabId = 'setup' | 'remote' | 'apps'
type ThemeMode = 'light' | 'dark'

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

type RemoteButton = {
  label: string
  command: RemoteCommand
  accent?: boolean
}

const viewTabs: Array<{ id: TabId; label: string; detail: string }> = [
  { id: 'setup', label: 'Setup', detail: 'TVs, pairing, and connection.' },
  { id: 'remote', label: 'Remote', detail: 'Playback, typing, and transport.' },
  { id: 'apps', label: 'Apps', detail: 'Launch what is installed.' }
]

const coreRemoteButtons: RemoteButton[] = [
  { label: 'Home', command: 'home' },
  { label: 'Back', command: 'back' },
  { label: 'Menu', command: 'menu' },
  { label: 'Apps', command: 'appSwitch' },
  { label: 'Power', command: 'power', accent: true },
  { label: 'Sleep', command: 'sleep' }
]

const mediaRemoteButtons: RemoteButton[] = [
  { label: 'Play/Pause', command: 'playPause' },
  { label: 'Rewind', command: 'rewind' },
  { label: 'Fast Forward', command: 'fastForward' },
  { label: 'Previous', command: 'previous' },
  { label: 'Next', command: 'next' }
]

const soundRemoteButtons: RemoteButton[] = [
  { label: 'Mute', command: 'mute' },
  { label: 'Vol +', command: 'volumeUp' },
  { label: 'Vol -', command: 'volumeDown' }
]

const favoriteHotkeys: FavoriteAppHotkey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
const scrcpyPresetLabels: Record<ScrcpyPreset, string> = {
  fast: 'Fast',
  high_quality: 'High Quality',
  no_audio: 'No Audio',
  record: 'Record'
}

const initialForm: SetupFormState = {
  name: '',
  host: '',
  preferredBackend: 'adb',
  nativeRemotePort: '6466',
  nativePairingPort: '6467',
  nativeCode: '',
  adbEnabled: true,
  adbMode: 'pair',
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

function formatConnectionStatus(status: ConnectionState['status']): string {
  switch (status) {
    case 'disconnected':
      return 'Not connected'
    case 'pairing':
      return 'Pairing'
    case 'connecting':
      return 'Connecting'
    case 'connected':
      return 'Connected'
    case 'unauthorized':
      return 'Unauthorized'
    case 'error':
      return 'Connection error'
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

function shouldShowToast(feedback: ActionFeedback): boolean {
  return feedback.kind !== 'remote' || feedback.status === 'blocked' || feedback.status === 'error'
}

function getBackendHealthLabel(
  snapshot: BackendHealthSnapshot | undefined,
  unavailableLabel: string
): string {
  if (!snapshot) {
    return unavailableLabel
  }

  if (!snapshot.available) {
    return unavailableLabel
  }

  if (snapshot.ready) {
    return 'Ready'
  }

  if (snapshot.lastError) {
    return 'Needs attention'
  }

  return 'Available'
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
      detail: 'Use it only when you intentionally want to try the native path.',
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
    badge: 'Optional',
    title: 'Native pairing is not saved yet',
    detail: input.nativeLastConnectedAt
      ? `Last successful native session was ${formatTimestamp(input.nativeLastConnectedAt)}. Pair again only if you want to reuse it.`
      : 'Nothing will start automatically. Start native pairing only if you want to try this optional path.',
    tone: 'neutral'
  }
}

function filterPaletteItems(items: CommandPaletteItem[], query: string): CommandPaletteItem[] {
  const normalized = query.trim().toLowerCase()

  if (!normalized) {
    return items.slice(0, 18)
  }

  return items
    .filter((item) =>
      [item.label, item.detail, item.section]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    )
    .slice(0, 24)
}

function EmptyWorkspace(props: {
  eyebrow: string
  title: string
  detail: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <section className="empty-workspace">
      <p className="eyebrow">{props.eyebrow}</p>
      <h3>{props.title}</h3>
      <p className="muted">{props.detail}</p>
      <button className="primary-button" type="button" onClick={props.onAction}>
        {props.actionLabel}
      </button>
    </section>
  )
}

export function App() {
  const [tab, setTab] = useState<TabId>('setup')
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const savedTheme = window.localStorage.getItem('relay-theme')
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [diagnostics, setDiagnostics] = useState<DiagnosticsStatus | null>(null)
  const [devices, setDevices] = useState<SavedDevice[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>({ status: 'disconnected' })
  const [apps, setApps] = useState<LaunchableApp[]>([])
  const [appsDeviceId, setAppsDeviceId] = useState<string | null>(null)
  const [appsQuery, setAppsQuery] = useState('')
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredNativeDevice[]>([])
  const [resolvedAdbEndpoints, setResolvedAdbEndpoints] = useState<ResolvedAdbEndpoints | null>(null)
  const [adbDiscoveryBusy, setAdbDiscoveryBusy] = useState(false)
  const [form, setForm] = useState<SetupFormState>(initialForm)
  const [textInput, setTextInput] = useState('')
  const [statusMessage, setStatusMessage] = useState('Ready when you are.')
  const [busy, setBusy] = useState<string | null>(null)
  const [actionFeed, setActionFeed] = useState<ActionFeedback[]>([])
  const [actionToasts, setActionToasts] = useState<ActionFeedback[]>([])
  const [commandCooldowns, setCommandCooldowns] = useState<Partial<Record<RemoteCommand, number>>>({})
  const [pendingRemoteCommand, setPendingRemoteCommand] = useState<RemoteCommand | null>(null)
  const [pendingAppPackage, setPendingAppPackage] = useState<string | null>(null)
  const [cooldownTick, setCooldownTick] = useState(Date.now())
  const [foregroundAppState, setForegroundAppState] = useState(diagnostics?.foregroundApp ?? null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [selectedApk, setSelectedApk] = useState<SelectedApkFile | null>(null)
  const deferredAppsQuery = useDeferredValue(appsQuery)
  const deferredPaletteQuery = useDeferredValue(paletteQuery)
  const diagnosticsRequestRef = useRef(0)
  const diagnosticsInFlightRef = useRef<Promise<void> | null>(null)
  const diagnosticsQueuedRef = useRef(false)
  const foregroundRequestRef = useRef(0)

  const fallbackActiveDevice =
    connectionState.deviceId
      ? devices.find((device) => device.id === connectionState.deviceId) ?? null
      : null
  const activeDevice = diagnostics?.activeDevice ?? fallbackActiveDevice
  const activeAppsCache = activeDevice?.cachedApps ?? null
  const activeBackend = diagnostics?.activeBackend ?? connectionState.backend ?? null
  const activePreferences = activeDevice?.preferences
  const pendingNativePairing = diagnostics?.pendingNativePairing ?? null
  const health = diagnostics?.health ?? null
  const recommendedActions = diagnostics?.recommendedActions ?? []
  const foregroundApp = foregroundAppState ?? diagnostics?.foregroundApp ?? null
  const scrcpyStatus = diagnostics?.scrcpy ?? {
    available: false,
    installHint: 'Install scrcpy and make sure it is on PATH.'
  }
  const rawCapabilities = diagnostics?.capabilities ?? {
    nativeRemote: false,
    adbFallback: false,
    typing: false,
    apps: false
  }
  const adbReadyFromConnectedSession = connectionState.status === 'connected' && activeBackend === 'adb'
  const adbReadyFromHealth = Boolean(activeDevice?.backendHealth?.adb.ready)
  const adbFallbackReady = rawCapabilities.adbFallback || adbReadyFromConnectedSession || adbReadyFromHealth
  const capabilities = {
    nativeRemote: rawCapabilities.nativeRemote || Boolean(activeDevice?.nativeRemote?.certificate),
    adbFallback: adbFallbackReady,
    typing: rawCapabilities.typing || adbFallbackReady,
    apps: rawCapabilities.apps || adbFallbackReady
  }
  const waitingForNativeCode = Boolean(
    pendingNativePairing || (connectionState.status === 'pairing' && connectionState.backend === 'native')
  )
  const setupTargetName = form.name.trim() || form.host.trim() || 'your TV'
  const hasSelectedTv = Boolean(form.host.trim())
  const isConnected = connectionState.status === 'connected'
  const activeMatchesForm = Boolean(activeDevice && form.host.trim() && activeDevice.host === form.host.trim())
  const savedSelectedDevice = devices.find((device) => device.host === form.host.trim()) ?? null
  const setupDevice = savedSelectedDevice ?? (activeMatchesForm ? activeDevice : null)
  const currentTargetDevice = setupDevice ?? (!hasSelectedTv ? activeDevice : null)
  const hasCurrentTarget = Boolean(hasSelectedTv || currentTargetDevice)
  const setupDeviceId = setupDevice?.id
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
  const compactAdbLabel = form.adbMode === 'pair' ? 'Pair ADB' : 'Connect ADB'
  const appsAreLoading = busy === 'apps'
  const appSections = groupApps(apps, activeDevice, deferredAppsQuery)
  const allRemoteButtons = [...coreRemoteButtons, ...mediaRemoteButtons, ...soundRemoteButtons]
  const pinnedRemoteButtons = getPinnedRemoteCommands(activePreferences)
    .map((command) => allRemoteButtons.find((button) => button.command === command))
    .filter((button): button is RemoteButton => Boolean(button))
  const visibleCoreRemoteButtons = getVisibleRemoteButtons(coreRemoteButtons, activePreferences)
  const visibleMediaRemoteButtons = getVisibleRemoteButtons(mediaRemoteButtons, activePreferences)
  const visibleSoundRemoteButtons = getVisibleRemoteButtons(soundRemoteButtons, activePreferences)
  const visibleAppCount =
    appSections.favorites.length + appSections.recents.length + appSections.others.length
  const paletteItems = buildCommandPaletteItems({
    isConnected,
    appsReady: capabilities.apps,
    typingReady: capabilities.typing,
    scrcpyAvailable: scrcpyStatus.available,
    hasAppCache: Boolean(activeAppsCache),
    apps,
    devices,
    quickActions: diagnostics?.quickActions ?? [],
    recommendedActions
  })
  const visiblePaletteItems = filterPaletteItems(paletteItems, deferredPaletteQuery)
  const latestAction = actionFeed[0] ?? null
  const latestRemoteAction = actionFeed.find((item) => item.kind === 'remote') ?? null
  const activeView = viewTabs.find((item) => item.id === tab) ?? viewTabs[0]
  const viewStatus = (() => {
    if (tab === 'setup') {
      if (waitingForNativeCode) {
        return {
          eyebrow: 'Setup in focus',
          title: 'Finish the pairing step or move back to ADB',
          detail: 'Confirm the TV code or cancel and continue with ADB.'
        }
      }

      if (hasSelectedTv) {
        return {
          eyebrow: 'Setup in focus',
          title: `Configure ${setupTargetName}`,
          detail: 'Ports, pairing, and backend preference live here.'
        }
      }

      if (activeDevice) {
        return {
          eyebrow: 'Setup in focus',
          title: `Connected to ${activeDevice.name}`,
          detail: 'Review the active TV, adjust setup, or switch targets below.'
        }
      }

      return {
        eyebrow: 'Setup in focus',
        title: 'Start with one TV',
        detail: 'Pick a TV or enter an IP, then connect with ADB.'
      }
    }

    if (tab === 'remote') {
      return isConnected
        ? {
            eyebrow: 'Remote in focus',
            title: `${activeDevice?.name ?? setupTargetName} is live`,
            detail: 'Core transport is ready. Typing still uses ADB when needed.'
          }
        : {
            eyebrow: 'Remote in focus',
            title: 'Remote is waiting for a connection',
            detail: 'Connect a TV in Setup first.'
          }
    }

    return capabilities.apps
      ? {
          eyebrow: 'Apps in focus',
          title: 'Installed apps are ready',
          detail: 'Pinned, recent, and full app browsing live here.'
        }
      : {
          eyebrow: 'Apps in focus',
          title: 'Apps need ADB access',
          detail: 'Connect with ADB in Setup first.'
        }
  })()
  const supportStatus = (() => {
    if (tab === 'setup') {
      return {
        label: 'Native',
        title: nativeSetupState.badge,
        detail: nativeSetupState.title
      }
    }

    if (tab === 'remote') {
      return {
        label: 'Foreground app',
        title: foregroundApp?.displayName ?? 'Unavailable',
        detail: capabilities.apps ? 'Live while connected' : 'Needs ADB app access'
      }
    }

    const totalApps = activeAppsCache?.apps.length ?? apps.length
    return {
      label: 'Library',
      title: capabilities.apps ? `${totalApps} ready` : 'ADB required',
      detail: capabilities.apps
        ? totalApps > 0
          ? 'Refresh anytime to rebuild the list.'
          : 'Load apps once to build the list.'
        : 'Installed-app browsing unlocks after ADB connects.'
    }
  })()
  const liveStatusTitle = latestAction?.title ?? (isConnected ? 'Session stable' : 'Waiting for connection')
  const liveStatusDetail =
    latestAction?.detail ??
    (isConnected
      ? `${activeDevice?.name ?? 'This TV'} is connected over ${backendLabel(activeBackend)}.`
      : health?.detail ?? statusMessage)
  const connectionTone = statusTone(connectionState.status)
  const adbTone: 'neutral' | 'positive' | 'danger' | 'warning' =
    !diagnostics?.adb.available
      ? 'danger'
      : health?.adb?.ready
        ? 'positive'
        : health?.adb?.lastError
          ? 'danger'
          : canUseAdbCard()
            ? 'warning'
            : 'neutral'
  const supportTone: 'neutral' | 'positive' | 'danger' | 'warning' =
    tab === 'setup'
      ? nativeSetupState.tone
      : tab === 'remote'
        ? foregroundApp?.displayName
          ? 'positive'
          : capabilities.apps
            ? 'warning'
            : 'neutral'
        : capabilities.apps
          ? 'positive'
          : 'warning'
  const liveTone: 'neutral' | 'positive' | 'danger' | 'warning' = latestAction
    ? feedbackTone(latestAction.status)
    : connectionTone

  function canUseAdbCard(): boolean {
    return Boolean(diagnostics?.adb.available && activeDevice && !health?.adb?.ready)
  }

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
    document.documentElement.dataset.theme = themeMode
    window.localStorage.setItem('relay-theme', themeMode)
  }, [themeMode])

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
    if (tab !== 'setup') {
      return
    }

    if (!form.host.trim() || !form.adbEnabled) {
      setResolvedAdbEndpoints(null)
      return
    }

    const timer = window.setTimeout(() => {
      void detectAdbEndpoints({ silent: true })
    }, 450)

    return () => window.clearTimeout(timer)
  }, [form.adbEnabled, form.host, tab])

  useEffect(() => {
    if (connectionState.status !== 'connected' || !activeDevice) {
      return
    }

    setForm((current) => {
      if (current.host.trim() === activeDevice.host) {
        return current
      }

      return applyDeviceToForm(activeDevice)
    })
  }, [activeDevice?.id, connectionState.status])

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
    const onKeyDown = (event: KeyboardEvent) => {
      const isPaletteShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'

      if (isPaletteShortcut) {
        event.preventDefault()
        setPaletteOpen(true)
        setPaletteQuery('')
        return
      }

      if (paletteOpen || !shouldHandleRemoteKey(event.target) || connectionState.status !== 'connected') {
        return
      }

      if (!favoriteHotkeys.includes(event.key as FavoriteAppHotkey)) {
        return
      }

      const packageName = activePreferences?.appHotkeys?.[event.key as FavoriteAppHotkey]
      if (!packageName) {
        return
      }

      event.preventDefault()
      void launchPackageShortcut(packageName)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activePreferences, connectionState.status, paletteOpen])

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
    const showToast = shouldShowToast(feedback)

    setActionFeed((current) => [feedback, ...current].slice(0, 8))
    if (showToast) {
      setActionToasts((current) => [feedback, ...current].slice(0, 3))
    }
    setStatusMessage(feedback.detail)

    if (feedback.command && feedback.cooldownMs) {
      setCommandCooldowns((current) => ({
        ...current,
        [feedback.command!]: Date.now() + feedback.cooldownMs!
      }))
    }

    if (showToast) {
      window.setTimeout(() => {
        setActionToasts((current) => current.filter((item) => item.id !== feedback.id))
      }, feedback.status === 'blocked' ? 3600 : 3000)
    }
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

  async function detectAdbEndpoints(options?: { silent?: boolean }): Promise<ResolvedAdbEndpoints | null> {
    const host = form.host.trim()

    if (!host || !form.adbEnabled) {
      setResolvedAdbEndpoints(null)
      return null
    }

    setAdbDiscoveryBusy(true)
    try {
      const [match] = await window.tvRemoteApi.discoverAdbEndpoints(host)
      setResolvedAdbEndpoints(match ?? null)

      if (!match) {
        if (!options?.silent) {
          setStatusMessage(
            `No live ADB wireless-debugging ports were detected for ${host}. Open Wireless Debugging on the TV to detect the connect port, or open Pair device with pairing code to detect the pairing port.`
          )
        }
        return null
      }

      setForm((current) => ({
        ...current,
        connectPort: match.connectPort ? String(match.connectPort) : current.connectPort,
        adbPairPort: match.pairPort ? String(match.pairPort) : current.adbPairPort,
        adbMode: match.pairPort ? 'pair' : current.adbMode
      }))

      if (!options?.silent) {
        setStatusMessage(
          `Detected ADB ports for ${host}${match.pairPort ? `: pair ${match.pairPort}` : ''}${match.connectPort ? `${match.pairPort ? ' ·' : ':'} connect ${match.connectPort}` : ''}.`
        )
      }

      return match
    } catch (error) {
      setResolvedAdbEndpoints(null)
      if (!options?.silent) {
        setStatusMessage(error instanceof Error ? error.message : 'Could not detect ADB ports.')
      }
      return null
    } finally {
      setAdbDiscoveryBusy(false)
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
        id: setupDeviceId,
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
        id: setupDeviceId,
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
        id: setupDeviceId,
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

  async function updatePreferences(input: Parameters<typeof window.tvRemoteApi.updateDevicePreferences>[0]): Promise<void> {
    try {
      await window.tvRemoteApi.updateDevicePreferences(input)
      await refreshDiagnostics()
    } catch (error) {
      publishErrorFeedback('Could not update TV preferences.', error, 'system')
    }
  }

  async function assignFavoriteHotkey(packageName: string, hotkey: FavoriteAppHotkey | ''): Promise<void> {
    if (!hotkey) {
      const currentHotkey = favoriteHotkeys.find((key) => activePreferences?.appHotkeys?.[key] === packageName)
      if (currentHotkey) {
        await updatePreferences({ appHotkeys: { [currentHotkey]: null } })
      }
      return
    }

    await updatePreferences({ appHotkeys: { [hotkey]: packageName } })
  }

  async function launchPackageShortcut(packageName: string): Promise<void> {
    setPendingAppPackage(packageName)
    try {
      const feedback = await window.tvRemoteApi.runQuickAction(`launch:${packageName}`)
      publishFeedback({
        ...feedback,
        detail:
          activeBackend === 'native'
            ? 'Favorite hotkey launched this app through ADB fallback.'
            : 'Favorite hotkey launched this app through ADB.'
      })
      await refreshDiagnostics()
    } catch (error) {
      publishErrorFeedback('Favorite hotkey failed.', error, 'app', { appPackage: packageName })
    } finally {
      setPendingAppPackage((current) => (current === packageName ? null : current))
    }
  }

  async function togglePinnedCommand(command: RemoteCommand): Promise<void> {
    const current = activePreferences?.remoteLayout.pinnedCommands ?? []
    const next = current.includes(command) ? current.filter((item) => item !== command) : [...current, command]
    await updatePreferences({ remoteLayout: { pinnedCommands: next } })
  }

  async function toggleHiddenCommand(command: RemoteCommand): Promise<void> {
    const current = activePreferences?.remoteLayout.hiddenCommands ?? []
    const next = current.includes(command) ? current.filter((item) => item !== command) : [...current, command]
    await updatePreferences({ remoteLayout: { hiddenCommands: next } })
  }

  async function resetRemoteLayout(): Promise<void> {
    await updatePreferences({ remoteLayout: { pinnedCommands: [], hiddenCommands: [] } })
  }

  async function setScrcpyPreset(preset: ScrcpyPreset): Promise<void> {
    await updatePreferences({ scrcpyPreset: preset })
  }

  async function wakeAndReconnect(): Promise<void> {
    setBusy('wake')
    try {
      const feedback = await window.tvRemoteApi.wakeAndReconnect()
      publishFeedback({
        ...feedback,
        detail:
          activeBackend === 'native'
            ? `${feedback.detail} Wake used ADB fallback because native remote is not reliable for recovery.`
            : feedback.detail
      })
      await refreshDiagnostics()
    } catch (error) {
      publishErrorFeedback('Wake and reconnect failed.', error, 'system')
    } finally {
      setBusy(null)
    }
  }

  async function chooseApkFile(): Promise<void> {
    setBusy('choose-apk')
    try {
      const selection = await window.tvRemoteApi.chooseApkFile()
      if (selection) {
        setSelectedApk(selection)
        setStatusMessage(`${selection.name} is ready to install through ADB.`)
      }
    } catch (error) {
      publishErrorFeedback('Could not choose APK.', error, 'sideload')
    } finally {
      setBusy(null)
    }
  }

  async function installSelectedApk(): Promise<void> {
    if (!selectedApk) {
      return
    }

    setBusy('install-apk')
    try {
      const feedback = await window.tvRemoteApi.installApk({ id: selectedApk.id })
      publishFeedback({
        ...feedback,
        detail:
          activeBackend === 'native'
            ? `${feedback.detail} Install used ADB fallback because native remote cannot sideload apps.`
            : feedback.detail
      })
      setSelectedApk(null)
      await refreshDiagnostics()
    } catch (error) {
      publishErrorFeedback('APK install failed.', error, 'sideload')
    } finally {
      setBusy(null)
    }
  }

  async function launchScrcpy(): Promise<void> {
    setBusy('scrcpy')
    try {
      const preset = activePreferences?.scrcpyPreset ?? 'fast'
      const feedback = await window.tvRemoteApi.launchScrcpy({ preset })
      publishFeedback({
        ...feedback,
        detail:
          activeBackend === 'native' && feedback.status !== 'blocked'
            ? `${feedback.detail} scrcpy used ADB fallback because native remote cannot mirror the screen.`
            : feedback.detail
      })
      await refreshDiagnostics()
    } catch (error) {
      publishErrorFeedback('Could not launch scrcpy.', error, 'scrcpy')
    } finally {
      setBusy(null)
    }
  }

  async function runQuickAction(id: string): Promise<void> {
    try {
      const feedback = await window.tvRemoteApi.runQuickAction(id)
      publishFeedback(feedback)
      await refreshDiagnostics()
    } catch (error) {
      publishErrorFeedback('Quick action failed.', error, 'quick_action', { actionId: id })
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

  async function runPaletteItem(item: CommandPaletteItem): Promise<void> {
    if (item.disabled) {
      setStatusMessage(item.disabledReason ?? item.detail)
      return
    }

    setPaletteOpen(false)

    if (item.id.startsWith('view:')) {
      setTab(item.id.slice('view:'.length) as TabId)
      return
    }

    if (item.id.startsWith('remote:')) {
      await sendRemoteCommand(item.id.slice('remote:'.length) as RemoteCommand)
      return
    }

    if (item.id.startsWith('quick:')) {
      await runQuickAction(item.id.slice('quick:'.length))
      return
    }

    if (item.id.startsWith('recommended:')) {
      await runRecommendedAction(item.id.slice('recommended:'.length) as RecommendedAction)
      return
    }

    if (item.id.startsWith('app:')) {
      const packageName = item.id.slice('app:'.length)
      const app = apps.find((candidate) => candidate.packageName === packageName)
      if (app) {
        await launchApp(app)
      }
      return
    }

    if (item.id.startsWith('device:')) {
      const device = devices.find((candidate) => candidate.id === item.id.slice('device:'.length))
      if (device) {
        await connectSavedDevice(device)
      }
      return
    }

    if (item.id === 'apps:fetch') {
      setTab('apps')
      await loadApps(true)
      return
    }

    if (item.id === 'system:wake') {
      await wakeAndReconnect()
      return
    }

    if (item.id === 'system:scrcpy') {
      await launchScrcpy()
      return
    }

    if (item.id === 'system:sideload') {
      await chooseApkFile()
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

    return `hsl(${hash % 360} 78% 90%)`
  }

  function renderRemoteButtonCopy(button: RemoteButton) {
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
      <div className="notice-band warning-band">
        <div className="notice-copy">
          <strong>{pendingNativePairing ? `Enter the code for ${pendingNativePairing.name}` : 'Enter the TV code'}</strong>
          <span>
            {pendingNativePairing
              ? 'If the TV never shows a pairing code, stop here and use ADB instead.'
              : 'If the TV never shows a code, cancel this and go back to ADB.'}
          </span>
        </div>
        <div className="pairing-inline">
          <input
            value={form.nativeCode}
            onChange={(event) => setForm((current) => ({ ...current, nativeCode: event.target.value }))}
            placeholder="TV pairing code"
          />
          <div className="button-row">
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
        </div>
      </div>
    )
  }

  function renderRemoteActionButton(button: RemoteButton) {
    const isCoolingDown = commandCooldownRemaining(button.command) > 0
    const isPending = pendingRemoteCommand === button.command

    return (
      <button
        key={button.command}
        type="button"
        className={`command-button ${button.accent ? 'accent' : ''} ${isPending ? 'is-pending' : ''} ${isCoolingDown ? 'is-cooling-down' : ''}`}
        onClick={() => void sendRemoteCommand(button.command)}
        disabled={!isConnected || isPending || isCoolingDown}
      >
        {renderRemoteButtonCopy(button)}
      </button>
    )
  }

  function renderCommandPalette() {
    if (!paletteOpen) {
      return null
    }

    return (
      <div className="palette-backdrop" role="presentation" onMouseDown={() => setPaletteOpen(false)}>
        <section
          className="command-palette"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="palette-top">
            <span className="focus-label">Command palette</span>
            <button className="ghost-button" type="button" onClick={() => setPaletteOpen(false)}>
              Close
            </button>
          </div>
          <input
            autoFocus
            value={paletteQuery}
            onChange={(event) => setPaletteQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setPaletteOpen(false)
              }
            }}
            placeholder="Search commands, apps, TVs, and power tools..."
          />
          <div className="palette-list">
            {visiblePaletteItems.length === 0 ? (
              <div className="empty-inline">
                <strong>No commands match that search.</strong>
                <span>Try “apps”, “wake”, “scrcpy”, or a saved TV name.</span>
              </div>
            ) : (
              visiblePaletteItems.map((item) => (
                <button
                  key={item.id}
                  className={`palette-item ${item.disabled ? 'disabled' : ''}`}
                  type="button"
                  onClick={() => void runPaletteItem(item)}
                >
                  <span className="focus-label">{item.section}</span>
                  <strong>{item.label}</strong>
                  <small>{item.disabled ? item.disabledReason ?? item.detail : item.detail}</small>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    )
  }

  function renderAppSection(title: string, sectionApps: LaunchableApp[]) {
    if (sectionApps.length === 0) {
      return null
    }

    return (
      <section className="app-group" key={title}>
        <div className="group-heading">
          <div>
            <span className="focus-label">Library section</span>
            <h3>{title}</h3>
          </div>
          <span className="section-count">{sectionApps.length}</span>
        </div>
        <div className="app-list">
          {sectionApps.map((app) => {
            const isFavorite = activeDevice?.favorites?.includes(app.packageName) ?? false
            const isLaunching = pendingAppPackage === app.packageName
            const assignedHotkey =
              favoriteHotkeys.find((hotkey) => activePreferences?.appHotkeys?.[hotkey] === app.packageName) ?? ''

            return (
              <article key={app.packageName} className={`app-row ${isLaunching ? 'busy' : ''}`}>
                <div className="app-row-main">
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
                  <div className="app-row-copy">
                    <strong>{app.displayName}</strong>
                    <span>{app.category === 'leanback' ? 'TV app' : 'Launcher app'}</span>
                    {deferredAppsQuery.trim() ? <small>{app.packageName}</small> : null}
                  </div>
                </div>
                <div className="row-actions">
                  <button
                    className={`ghost-button ${isFavorite ? 'is-selected' : ''}`}
                    type="button"
                    onClick={() => void toggleFavorite(app.packageName)}
                    disabled={busy === `favorite-${app.packageName}`}
                  >
                    {isFavorite ? 'Pinned' : 'Pin'}
                  </button>
                  <select
                    value={assignedHotkey}
                    onChange={(event) =>
                      void assignFavoriteHotkey(app.packageName, event.target.value as FavoriteAppHotkey | '')
                    }
                    disabled={!canAssignFavoriteHotkey(activeDevice, app.packageName)}
                    title={isFavorite ? 'Assign number hotkey' : 'Pin this app before assigning a hotkey'}
                  >
                    <option value="">Hotkey</option>
                    {favoriteHotkeys.map((hotkey) => (
                      <option key={hotkey} value={hotkey}>
                        {hotkey}
                      </option>
                    ))}
                  </select>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void launchApp(app)}
                    disabled={isLaunching}
                  >
                    {isLaunching ? 'Launching...' : 'Launch'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    )
  }

  function renderSetupView() {
    return (
      <section className="workspace setup-workspace">
        <section className="sheet roster-sheet">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Device roster</p>
              <h3>Choose a TV</h3>
              <p className="muted">Saved devices, nearby discovery, and manual targeting live in one place.</p>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => void scanNativeDevices()}
              disabled={busy === 'discover'}
            >
              {busy === 'discover' ? 'Scanning...' : 'Scan network'}
            </button>
          </div>

          <div className="roster-section">
            <div className="subsection-heading">
              <span className="focus-label">Saved TVs</span>
              <strong>{devices.length}</strong>
            </div>
            {devices.length === 0 ? (
              <p className="muted compact-copy">No saved TVs yet. Save the current target after you enter a host.</p>
            ) : (
              <div className="row-list">
                {devices.map((device) => (
                  <div
                    key={device.id}
                    className={`list-row ${savedSelectedDevice?.id === device.id ? 'active' : ''}`}
                  >
                    <div className="row-copy">
                      <strong>{device.name}</strong>
                      <span>{device.host}</span>
                      <small>
                        {device.lastConnectedAt
                          ? `${backendLabel(device.lastConnectedBackend)} · ${formatTimestamp(device.lastConnectedAt)}`
                          : 'Not connected yet'}
                      </small>
                    </div>
                    <div className="row-actions">
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
            )}
          </div>

          <div className="studio-divider" />

          <div className="roster-section">
            <div className="subsection-heading">
              <span className="focus-label">Nearby TVs</span>
              <strong>{discoveredDevices.length}</strong>
            </div>
            {discoveredDevices.length === 0 ? (
              <p className="muted compact-copy">Discovery is optional. If nothing appears, type the TV host or IP below.</p>
            ) : (
              <div className="row-list">
                {discoveredDevices.map((device) => (
                  <div
                    key={`${device.host}:${device.remotePort}`}
                    className={`list-row ${form.host === device.host ? 'active' : ''}`}
                  >
                    <div className="row-copy">
                      <strong>{device.name}</strong>
                      <span>{device.host}</span>
                      <small>Native {device.remotePort} · Pair {device.pairingPort}</small>
                    </div>
                    <div className="row-actions">
                      <button className="ghost-button" type="button" onClick={() => applyDiscoveredDevice(device)}>
                        Use TV
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="studio-divider" />

          <div className="roster-section">
            <div className="form-grid">
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

            <div className="target-line">
              <div>
                <span className="focus-label">Current target</span>
                <strong>{currentTargetDevice?.name ?? (hasSelectedTv ? setupTargetName : 'No TV selected yet')}</strong>
                <small>
                  {currentTargetDevice
                    ? `${currentTargetDevice.host}${isConnected && activeDevice?.id === currentTargetDevice.id ? ' · connected' : ''}`
                    : hasSelectedTv
                      ? selectedHostLabel
                      : 'Pick a TV above or type the host manually.'}
                </small>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={() => void saveSetup()}
                disabled={busy === 'save' || !hasCurrentTarget}
              >
                Save TV profile
              </button>
            </div>
          </div>
        </section>

        <section className="sheet studio-sheet">
          <div className="studio-section studio-section-primary">
            <div className="section-heading">
              <div>
                <p className="eyebrow">ADB first</p>
                <h3>Connect with ADB</h3>
                <p className="muted">This is the reliable path and the only one that fully powers typing and apps.</p>
              </div>
              <span className="section-chip">Recommended</span>
            </div>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={form.adbEnabled}
                onChange={(event) => setForm((current) => ({ ...current, adbEnabled: event.target.checked }))}
              />
              <span>Enable ADB for this TV</span>
            </label>

            <div className="form-grid">
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
              <div className="form-grid">
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

            <div className="notice-band">
              <div className="notice-copy">
                <strong>
                  {resolvedAdbEndpoints
                    ? 'Live ADB ports detected'
                    : hasSelectedTv
                      ? 'Live ADB ports not detected yet'
                      : 'Choose a TV to detect ADB ports'}
                </strong>
                <span>
                  {resolvedAdbEndpoints
                    ? `${resolvedAdbEndpoints.pairPort ? `Pair ${resolvedAdbEndpoints.pairPort}` : 'Pair port not visible'}${resolvedAdbEndpoints.connectPort ? ` · Connect ${resolvedAdbEndpoints.connectPort}` : ' · Connect port not visible'}. These come from ADB mDNS on this network.`
                    : hasSelectedTv
                      ? 'This app can only detect the live Wireless Debugging ports when the TV is advertising them. Open Wireless Debugging to expose the connect port, or open Pair device with pairing code to expose the pairing port.'
                      : 'The app can auto-detect live Wireless Debugging ports for the selected host when the TV is advertising them.'}
                </span>
              </div>
              <div className="button-row compact-row">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void detectAdbEndpoints()}
                  disabled={!hasSelectedTv || !form.adbEnabled || adbDiscoveryBusy}
                >
                  {adbDiscoveryBusy ? 'Detecting...' : 'Detect ADB ports'}
                </button>
              </div>
            </div>

            <div className="button-row">
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
                Make ADB default
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

            <p className="muted compact-copy">
              Use Pair then connect for normal Android TV Wireless Debugging. Use Direct connect only if this TV is
              already listening on the saved ADB port. Port 5555 is usually not the right Wireless Debugging port.
            </p>
          </div>

          <div className="studio-divider" />

          <div className="studio-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Diagnostics</p>
                <h3>Make failure states concrete</h3>
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
              <div className="notice-band warning-band">
                <div className="notice-copy">
                  <strong>ADB is not available</strong>
                  <span>{diagnostics?.adb.installHint ?? 'Install ADB before you continue.'}</span>
                </div>
              </div>
            ) : (
              <p className="muted compact-copy">
                {diagnostics.adb.version} · {diagnostics.adb.path}
              </p>
            )}

            {health ? (
              <>
                <div className="health-pairs">
                  <div className={`health-pair tone-${health.adb.ready ? 'positive' : 'neutral'}`}>
                    <span className="focus-label">ADB</span>
                    <strong>{getBackendHealthLabel(health.adb, 'Unavailable')}</strong>
                    <small>{health.adb.lastError ?? `Last success ${formatTimestamp(health.adb.lastConnectedAt)}`}</small>
                  </div>
                  <div className={`health-pair tone-${health.native.ready ? 'positive' : 'neutral'}`}>
                    <span className="focus-label">Native</span>
                    <strong>{getBackendHealthLabel(health.native, 'Not configured')}</strong>
                    <small>{health.native.lastError ?? `Last success ${formatTimestamp(health.native.lastConnectedAt)}`}</small>
                  </div>
                </div>
                <div className="issue-stream">
                  {health.issues.map((issue) => (
                    <div key={issue.code} className={`issue-row issue-${issue.severity}`}>
                      <strong>{issue.summary}</strong>
                      <span>{issue.detail}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted compact-copy">Choose a TV first to see device health and troubleshooting details.</p>
            )}
          </div>

          <div className="studio-divider" />

          <div className="studio-section studio-section-secondary">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Native remote</p>
                <h3>Keep native secondary</h3>
                <p className="muted">It does not replace ADB for typing or installed-app launch.</p>
              </div>
              <span className="section-chip section-chip-muted">Less reliable</span>
            </div>

            <div className={`status-strip-inline tone-${nativeSetupState.tone}`}>
              <div>
                <span className="focus-label">Native status</span>
                <strong>{nativeSetupState.title}</strong>
                <small>{nativeSetupState.detail}</small>
              </div>
              <span className={`status-pill tone-${nativeSetupState.tone}`}>{nativeSetupState.badge}</span>
            </div>

            <div className="form-grid">
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
                  onChange={(event) => setForm((current) => ({ ...current, nativePairingPort: event.target.value }))}
                  placeholder="6467"
                />
              </label>
            </div>

            {renderNativePairingPanel()}

            <div className="button-row">
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
                Make native default
              </button>
            </div>

            <p className="muted compact-copy">
              If the TV never shows a code or refuses to pair, cancel it and go back to ADB. That fallback should stay
              visible, not implicit.
            </p>
          </div>
        </section>
      </section>
    )
  }

  function renderRemoteView() {
    if (!isConnected) {
      return (
        <EmptyWorkspace
          eyebrow="Remote"
          title="No TV is connected yet"
          detail="Go to Setup and connect with ADB first. That path is still the most reliable here."
          actionLabel="Open setup"
          onAction={() => setTab('setup')}
        />
      )
    }

    return (
      <section className="workspace remote-workspace">
        <section className="sheet remote-sheet">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Live control</p>
              <h3>{activeDevice?.name ?? 'Connected TV'}</h3>
              <p className="muted">Use the pad, command keys, or your hardware keyboard on this tab.</p>
            </div>
            <div className="status-pair">
              <span className={`status-pill tone-${statusTone(connectionState.status)}`}>
                {backendLabel(activeBackend)}
              </span>
              <span className="status-pill tone-neutral">{foregroundApp?.displayName ?? 'App unavailable'}</span>
              {latestRemoteAction ? (
                <span
                  key={latestRemoteAction.id}
                  className={`remote-feedback-pill tone-${feedbackTone(latestRemoteAction.status)}`}
                  title={latestRemoteAction.detail}
                  aria-live="polite"
                >
                  Last: {latestRemoteAction.title}
                </span>
              ) : null}
            </div>
          </div>

          <div className="remote-stage">
            {pinnedRemoteButtons.length > 0 ? (
              <div className="my-controls">
                <div className="subsection-heading">
                  <span className="focus-label">My controls</span>
                </div>
                <div className="command-grid compact-grid">{pinnedRemoteButtons.map(renderRemoteActionButton)}</div>
              </div>
            ) : null}
            <div className="dpad-shell">
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
              <p className="muted compact-copy">Arrow keys + Enter work here too. Shortcuts never trigger while typing into a field.</p>
            </div>

            <div className="command-groups">
              <div className="command-group">
                <div className="subsection-heading">
                  <span className="focus-label">Core</span>
                </div>
                <div className="command-grid">{visibleCoreRemoteButtons.map(renderRemoteActionButton)}</div>
              </div>

              <div className="command-group">
                <div className="subsection-heading">
                  <span className="focus-label">Playback</span>
                </div>
                <div className="command-grid compact-grid">{visibleMediaRemoteButtons.map(renderRemoteActionButton)}</div>
              </div>

              <div className="command-group">
                <div className="subsection-heading">
                  <span className="focus-label">Sound</span>
                </div>
                <div className="command-grid compact-grid">{visibleSoundRemoteButtons.map(renderRemoteActionButton)}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="sheet support-sheet">
          <div className="support-section support-tools">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Power tools</p>
                <h3>ADB extensions</h3>
                <p className="muted">
                  {activeBackend === 'native'
                    ? 'These use ADB fallback even while native remote is active.'
                    : 'These use the selected TV through ADB.'}
                </p>
              </div>
            </div>

            <div className="tool-grid">
              <div className="tool-card">
                <strong>Screen mirror</strong>
                <span>{scrcpyStatus.available ? scrcpyStatus.version ?? 'scrcpy detected' : scrcpyStatus.installHint}</span>
                <select
                  value={activePreferences?.scrcpyPreset ?? 'fast'}
                  onChange={(event) => void setScrcpyPreset(event.target.value as ScrcpyPreset)}
                  disabled={!capabilities.typing}
                >
                  {Object.entries(scrcpyPresetLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void launchScrcpy()}
                  disabled={busy === 'scrcpy' || !capabilities.typing || !scrcpyStatus.available}
                >
                  Open scrcpy
                </button>
              </div>

              <div className="tool-card">
                <strong>APK sideload</strong>
                <span>
                  {selectedApk
                    ? `${selectedApk.name} selected`
                    : capabilities.typing
                      ? 'Choose an APK, then install it over ADB.'
                      : 'ADB fallback is required for APK install.'}
                </span>
                <div className="button-row compact-row">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void chooseApkFile()}
                    disabled={busy === 'choose-apk' || !capabilities.typing}
                  >
                    Choose APK
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void installSelectedApk()}
                    disabled={busy === 'install-apk' || !selectedApk || !capabilities.typing}
                  >
                    Install
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="studio-divider" />

          <div className="support-section support-customize">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Customize</p>
                <h3>Remote layout</h3>
                <p className="muted">Pin daily controls or hide optional buttons. The D-pad always stays visible.</p>
              </div>
              <button className="ghost-button" type="button" onClick={() => void resetRemoteLayout()}>
                Reset
              </button>
            </div>
            <div className="customize-list">
              {allRemoteButtons.map((button) => {
                const isPinned = activePreferences?.remoteLayout.pinnedCommands.includes(button.command) ?? false
                const isHidden = activePreferences?.remoteLayout.hiddenCommands.includes(button.command) ?? false

                return (
                  <div key={button.command} className="customize-row">
                    <strong>{button.label}</strong>
                    <div className="row-actions">
                      <button
                        className={`ghost-button ${isPinned ? 'is-selected' : ''}`}
                        type="button"
                        onClick={() => void togglePinnedCommand(button.command)}
                      >
                        {isPinned ? 'Pinned' : 'Pin'}
                      </button>
                      <button
                        className={`ghost-button ${isHidden ? 'is-selected' : ''}`}
                        type="button"
                        onClick={() => void toggleHiddenCommand(button.command)}
                      >
                        {isHidden ? 'Hidden' : 'Hide'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="studio-divider" />

          <div className="support-section support-shortcuts">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Keyboard mode</p>
                <h3>Shortcut map</h3>
              </div>
            </div>
            <div className="shortcut-list">
              {shortcutLegend.map((shortcut) => (
                <div key={shortcut.keys} className="shortcut-row">
                  <div className="shortcut-keys">
                    {shortcut.keys.split(' / ').map((part) => (
                      <span key={part} className="shortcut-key">
                        {part}
                      </span>
                    ))}
                  </div>
                  <span className="shortcut-action">{shortcut.action}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="studio-divider" />

          <div className="support-section support-typing">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Type remotely</p>
                <h3>Text input</h3>
                <p className="muted">
                  {activeBackend === 'native'
                    ? capabilities.typing
                      ? 'Text input will use ADB fallback.'
                      : 'ADB is required for text input.'
                    : 'Text input is ready.'}
                </p>
              </div>
            </div>

            {!capabilities.typing ? (
              <div className="notice-band">
                <div className="notice-copy">
                  <strong>Typing needs ADB</strong>
                  <span>Go back to Setup and connect or pair ADB for this TV.</span>
                </div>
              </div>
            ) : null}

            <textarea
              value={textInput}
              onChange={(event) => setTextInput(event.target.value)}
              placeholder="Type something to send to the TV..."
            />

            <div className="button-row">
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
    )
  }

  function renderAppsView() {
    if (!isConnected) {
      return (
        <EmptyWorkspace
          eyebrow="Apps"
          title="No TV is connected yet"
          detail="Connect with ADB in Setup before browsing installed apps."
          actionLabel="Open setup"
          onAction={() => setTab('setup')}
        />
      )
    }

    return (
      <section className="workspace apps-workspace">
        <section className="sheet apps-sheet">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Apps</p>
              <h3>Launch installed apps</h3>
              <p className="muted">Pinned and recent apps stay specific to the current TV.</p>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => void loadApps(true)}
              disabled={appsAreLoading}
            >
              {activeAppsCache ? 'Refresh apps' : 'Fetch apps'}
            </button>
          </div>

          {!capabilities.apps ? (
            <div className="notice-band">
              <div className="notice-copy">
                <strong>Installed-app browsing needs ADB</strong>
                <span>Go back to Setup and connect ADB for this TV.</span>
              </div>
            </div>
          ) : (
            <div className="apps-toolbar">
              <div className={`apps-summary ${appsAreLoading ? 'loading' : ''}`}>
                <strong>
                  {appsAreLoading
                    ? activeAppsCache
                      ? 'Updating installed apps'
                      : 'Fetching installed apps'
                    : activeAppsCache
                      ? 'Showing cached apps'
                      : 'No app cache yet'}
                </strong>
                <span>
                  {appsAreLoading
                    ? 'The first pass can take a moment while names and icons are collected.'
                    : activeAppsCache
                      ? `Last updated ${formatTimestamp(activeAppsCache.updatedAt)}.`
                      : 'Fetch once to build the installed-app list for this TV.'}
                </span>
              </div>

              <div className="apps-controls">
                <input
                  value={appsQuery}
                  onChange={(event) => setAppsQuery(event.target.value)}
                  placeholder="Search apps"
                  disabled={!capabilities.apps}
                />
                <div className="section-count">{visibleAppCount} visible</div>
              </div>
            </div>
          )}

          {visibleAppCount === 0 ? (
            <div className="empty-inline">
              <strong>
                {capabilities.apps
                  ? activeAppsCache
                    ? 'No apps match that search.'
                    : 'No installed apps cached yet.'
                  : 'ADB is required for app discovery.'}
              </strong>
              <span>
                {capabilities.apps
                  ? activeAppsCache
                    ? 'Try a broader search or refresh the installed-app list.'
                    : 'Fetch installed apps to build the list for this TV.'
                  : 'Connect with ADB first, then come back here.'}
              </span>
            </div>
          ) : (
            <div className="app-groups">
              {renderAppSection('Pinned', appSections.favorites)}
              {renderAppSection('Recent', appSections.recents)}
              {renderAppSection('All apps', appSections.others)}
            </div>
          )}
        </section>
      </section>
    )
  }

  return (
    <div className="app-shell" data-theme={themeMode}>
      <div className="toast-stack" aria-live="polite">
        {actionToasts.map((toast) => (
          <div key={toast.id} className={`toast-card tone-${feedbackTone(toast.status)}`}>
            <strong>{toast.title}</strong>
            <span>{toast.detail}</span>
          </div>
        ))}
      </div>

      {renderCommandPalette()}

      <div className="shell-layout">
        <aside className={`side-rail rail-${connectionTone}`}>
          <div className="rail-brand">
            <p className="eyebrow">Android TV Remote</p>
            <h1>Relay</h1>
            <p className="rail-copy">A dependable desktop remote for Android TV, designed around clear state and fast control.</p>
          </div>

          <nav className="rail-nav" aria-label="Views">
            {viewTabs.map((item) => (
              <button
                key={item.id}
                className={`rail-tab ${tab === item.id ? 'active' : ''}`}
                type="button"
                onClick={() => setTab(item.id)}
                title={item.detail}
              >
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </button>
            ))}
          </nav>

          <div className="rail-session">
            <div className="rail-session-top">
              <span className={`status-pill tone-${connectionTone}`}>{formatConnectionStatus(connectionState.status)}</span>
              <span className="status-pill tone-neutral">{isConnected ? backendLabel(activeBackend) : `Preferred: ${preferredPathLabel}`}</span>
            </div>
            <strong>{activeDevice?.name ?? setupTargetName}</strong>
            <p>{selectedHostLabel}</p>
            <small>{liveStatusTitle}</small>
          </div>

          <div className="rail-actions">
            <button
              className="ghost-button theme-toggle"
              type="button"
              onClick={() => setThemeMode((current) => (current === 'light' ? 'dark' : 'light'))}
              aria-pressed={themeMode === 'dark'}
            >
              <span>Theme</span>
              <strong>{themeMode === 'light' ? 'Light' : 'Dark'}</strong>
            </button>
            <button className="primary-button" type="button" onClick={() => setPaletteOpen(true)}>
              Command palette
            </button>
            {isConnected ? (
              <>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void wakeAndReconnect()}
                  disabled={busy === 'wake' || !capabilities.typing}
                >
                  Wake / reconnect
                </button>
                <button
                  className="ghost-button danger-button"
                  type="button"
                  onClick={() => void disconnect()}
                  disabled={busy === 'disconnect'}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <>
                {tab !== 'setup' ? (
                  <button className="primary-button" type="button" onClick={() => setTab('setup')}>
                    Open setup
                  </button>
                ) : null}
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void connectUsingSetup('adb')}
                  disabled={!hasSelectedTv || !form.adbEnabled || busy === 'connect'}
                >
                  {compactAdbLabel}
                </button>
              </>
            )}
          </div>
        </aside>

        <section className="main-stage">
          <header className={`hero-ribbon ribbon-${connectionTone}`}>
            <div className="hero-copy">
              <p className="eyebrow">{viewStatus.eyebrow}</p>
              <h2>{viewStatus.title}</h2>
              <p className="hero-detail">{viewStatus.detail}</p>
            </div>

            <div className="signal-strip">
              <div className={`signal-tile signal-${connectionTone}`}>
                <span className="focus-label">Session</span>
                <strong>{formatConnectionStatus(connectionState.status)}</strong>
                <small>{isConnected ? backendLabel(activeBackend) : 'No active TV session'}</small>
              </div>
              <div className={`signal-tile signal-${adbTone}`}>
                <span className="focus-label">ADB</span>
                <strong>{getBackendHealthLabel(health?.adb, diagnostics?.adb.available ? 'Not ready' : 'Unavailable')}</strong>
                <small>{diagnostics?.adb.available ? diagnostics.adb.version ?? 'ADB detected' : 'Install ADB to continue'}</small>
              </div>
              <div className={`signal-tile signal-${supportTone}`}>
                <span className="focus-label">{supportStatus.label}</span>
                <strong>{supportStatus.title}</strong>
                <small>{supportStatus.detail}</small>
              </div>
              <div className={`signal-tile signal-${liveTone}`}>
                <span className="focus-label">Live status</span>
                <strong>{liveStatusTitle}</strong>
                <small>{liveStatusDetail}</small>
              </div>
            </div>
          </header>

          <main className="workspace-shell">
            {tab === 'setup' ? renderSetupView() : null}
            {tab === 'remote' ? renderRemoteView() : null}
            {tab === 'apps' ? renderAppsView() : null}
          </main>
        </section>
      </div>
    </div>
  )
}
