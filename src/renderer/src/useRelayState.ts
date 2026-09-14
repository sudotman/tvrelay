import { useDeferredValue, useEffect, useRef, useState } from 'react'
import type {
  ActionFeedback,
  AppUpdateStatus,
  ConnectionState,
  DiagnosticsStatus,
  DiscoveredNativeDevice,
  FavoriteAppHotkey,
  LaunchableApp,
  PreferredConnectionBackend,
  RecommendedAction,
  RemoteCommand,
  ResolvedAdbEndpoints,
  SavedDevice,
  ScrcpyPreset,
  SelectedApkFile,
  UpdateWebRemoteInput,
  WebRemoteStatus
} from '@shared/types'
import {
  allRemoteButtons,
  applyDeviceToForm,
  buildCommandPaletteItems,
  CommandPaletteItem,
  coreRemoteButtons,
  favoriteHotkeys,
  filterPaletteItems,
  getNativeSetupState,
  getPinnedRemoteCommands,
  getVisibleRemoteButtons,
  groupApps,
  initialForm,
  mediaRemoteButtons,
  type RemoteButton,
  shouldShowToast,
  soundRemoteButtons,
  type SetupFormState,
  type TabId
} from './viewModel'

const EMPTY_CAPABILITIES = {
  nativeRemote: false,
  adbFallback: false,
  typing: false,
  apps: false
}

/**
 * Owns every piece of renderer state plus the IPC calls that mutate it. The
 * shell and the views read it through `RelayContext` so no view has to thread
 * props through the tree.
 */
export function useRelayState() {
  const [tab, setTab] = useState<TabId>('setup')
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
  const [foregroundAppState, setForegroundAppState] = useState<DiagnosticsStatus['foregroundApp']>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [selectedApk, setSelectedApk] = useState<SelectedApkFile | null>(null)
  const [webRemote, setWebRemote] = useState<WebRemoteStatus | null>(null)
  const [appUpdate, setAppUpdate] = useState<AppUpdateStatus | null>(null)
  const deferredAppsQuery = useDeferredValue(appsQuery)
  const deferredPaletteQuery = useDeferredValue(paletteQuery)
  const diagnosticsRequestRef = useRef(0)
  const diagnosticsInFlightRef = useRef<Promise<void> | null>(null)
  const diagnosticsQueuedRef = useRef(false)
  const foregroundRequestRef = useRef(0)
  const landedRef = useRef(false)

  const fallbackActiveDevice = connectionState.deviceId
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
  const rawCapabilities = diagnostics?.capabilities ?? EMPTY_CAPABILITIES
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
  const appsAreLoading = busy === 'apps'
  const appSections = groupApps(apps, activeDevice, deferredAppsQuery)
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
    recommendedActions,
    appUpdateState: appUpdate?.state ?? 'idle'
  })
  const visiblePaletteItems = filterPaletteItems(paletteItems, deferredPaletteQuery)
  const latestAction = actionFeed[0] ?? null
  const latestRemoteAction = actionFeed.find((item) => item.kind === 'remote') ?? null

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

  // Launching into a live session should land on the remote, not on setup.
  useEffect(() => {
    if (landedRef.current || !diagnostics) {
      return
    }

    landedRef.current = true

    if (diagnostics.connectionState.status === 'connected') {
      setTab('remote')
    }
  }, [diagnostics])

  useEffect(() => {
    void refreshDiagnostics()
    void scanNativeDevices()
    void window.tvRemoteApi.getWebRemoteStatus().then(setWebRemote)
    void window.tvRemoteApi.getAppUpdateStatus().then(setAppUpdate)

    const unsubscribeState = window.tvRemoteApi.onConnectionStateChanged((state) => {
      setConnectionState(state)
      setStatusMessage(state.message ?? `Status: ${state.status}`)
      void refreshDiagnostics()
    })

    const unsubscribeDevices = window.tvRemoteApi.onDevicesChanged((nextDevices) => {
      setDevices(nextDevices)
      void refreshDiagnostics()
    })

    const unsubscribeWebRemote = window.tvRemoteApi.onWebRemoteStatusChanged(setWebRemote)
    const unsubscribeAppUpdate = window.tvRemoteApi.onAppUpdateStatusChanged(setAppUpdate)

    return () => {
      unsubscribeState()
      unsubscribeDevices()
      unsubscribeWebRemote()
      unsubscribeAppUpdate()
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
      window.setTimeout(
        () => {
          setActionToasts((current) => current.filter((item) => item.id !== feedback.id))
        },
        feedback.status === 'blocked' ? 3600 : 3000
      )
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

  async function updatePreferences(
    input: Parameters<typeof window.tvRemoteApi.updateDevicePreferences>[0]
  ): Promise<void> {
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

  async function checkForAppUpdates(): Promise<void> {
    setBusy('checkForUpdates')
    try {
      const status = await window.tvRemoteApi.checkForAppUpdates()
      setAppUpdate(status)

      if (status.state === 'not-available') {
        publishFeedback(
          createLocalFeedback({
            kind: 'system',
            status: 'success',
            title: "You're up to date",
            detail: `Relay ${status.currentVersion} is the latest version.`
          })
        )
      } else if (status.state === 'error') {
        publishFeedback(
          createLocalFeedback({
            kind: 'system',
            status: 'error',
            title: 'Could not check for updates',
            detail: status.message ?? 'The update check failed.'
          })
        )
      }
    } catch (error) {
      publishErrorFeedback('Could not check for updates.', error, 'system')
    } finally {
      setBusy(null)
    }
  }

  async function openAppUpdateReleasePage(): Promise<void> {
    await window.tvRemoteApi.openAppUpdateReleasePage()
  }

  async function quitAndInstallAppUpdate(): Promise<void> {
    await window.tvRemoteApi.quitAndInstallAppUpdate()
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

  async function updateWebRemote(input: UpdateWebRemoteInput): Promise<void> {
    setBusy('web-remote')
    try {
      setWebRemote(await window.tvRemoteApi.updateWebRemote(input))
    } catch (error) {
      publishErrorFeedback('Could not update the phone remote.', error, 'system')
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
      return
    }

    if (item.id === 'system:checkForUpdates') {
      if (appUpdate?.state === 'downloaded') {
        await quitAndInstallAppUpdate()
      } else {
        await checkForAppUpdates()
      }
    }
  }

  return {
    // view state
    tab,
    setTab,
    paletteOpen,
    setPaletteOpen,
    paletteQuery,
    setPaletteQuery,
    visiblePaletteItems,
    runPaletteItem,

    // connection + diagnostics
    diagnostics,
    devices,
    connectionState,
    activeDevice,
    activeBackend,
    activePreferences,
    activeAppsCache,
    capabilities,
    health,
    recommendedActions,
    foregroundApp,
    scrcpyStatus,
    webRemote,
    appUpdate,
    checkForAppUpdates,
    openAppUpdateReleasePage,
    quitAndInstallAppUpdate,
    isConnected,
    statusMessage,
    busy,

    // feedback
    actionToasts,
    latestRemoteAction,
    commandCooldownRemaining,
    pendingRemoteCommand,
    pendingAppPackage,

    // setup
    form,
    setForm,
    discoveredDevices,
    resolvedAdbEndpoints,
    adbDiscoveryBusy,
    savedSelectedDevice,
    currentTargetDevice,
    hasSelectedTv,
    hasCurrentTarget,
    setupTargetName,
    nativePaired,
    nativeSetupState,
    waitingForNativeCode,
    pendingNativePairing,

    // apps
    appsQuery,
    setAppsQuery,
    appsAreLoading,
    appSections,
    visibleAppCount,
    selectedApk,

    // remote layout
    pinnedRemoteButtons,
    visibleCoreRemoteButtons,
    visibleMediaRemoteButtons,
    visibleSoundRemoteButtons,
    textInput,
    setTextInput,

    // actions
    scanNativeDevices,
    detectAdbEndpoints,
    applyDiscoveredDevice,
    selectSavedDevice,
    saveSetup,
    beginNativePairing,
    completeNativePairing,
    connectUsingSetup,
    cancelNativePairing,
    pairAdb,
    connectSavedDevice,
    deleteSavedDevice,
    disconnect,
    sendRemoteCommand,
    sendText,
    pasteFromClipboard,
    loadApps,
    launchApp,
    toggleFavorite,
    assignFavoriteHotkey,
    launchPackageShortcut,
    togglePinnedCommand,
    toggleHiddenCommand,
    resetRemoteLayout,
    setScrcpyPreset,
    wakeAndReconnect,
    chooseApkFile,
    installSelectedApk,
    launchScrcpy,
    runAdbTroubleshooter,
    runRecommendedAction,
    updateWebRemote
  }
}

export type RelayState = ReturnType<typeof useRelayState>
