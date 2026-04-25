import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { Bonjour } from 'bonjour-service'
import type {
  ActionFeedback,
  BackendHealthSnapshot,
  BeginNativePairingInput,
  ConnectDeviceInput,
  ConnectionBackend,
  ConnectionState,
  DevicePreferences,
  DeviceHealthStatus,
  DiscoveredAdbService,
  DiscoveredNativeDevice,
  FavoriteAppHotkey,
  HealthIssue,
  NativeRemoteConfig,
  PairDeviceInput,
  PendingNativePairing,
  RecommendedAction,
  ResolvedAdbEndpoints,
  SaveDeviceInput,
  SavedDevice,
  ScrcpyPreset,
  UpdateDevicePreferencesInput
} from '@shared/types'
import { buildSerial, deriveConnectionState, shouldAttemptReconnect } from './adb/parsers'
import type { AdbClient } from './adb/adbClient'
import type { DeviceStore } from './deviceStore'
import type { NativeRemoteService } from './native/nativeRemoteService'

type DeviceManagerEvents = {
  connectionState: [ConnectionState]
  devicesChanged: [SavedDevice[]]
}

const RECENT_APPS_LIMIT = 8
const HOTKEYS: FavoriteAppHotkey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
const DEFAULT_SCRCPY_PRESET: ScrcpyPreset = 'fast'
const REMOTE_COMMANDS = new Set([
  'up',
  'down',
  'left',
  'right',
  'select',
  'home',
  'back',
  'menu',
  'appSwitch',
  'playPause',
  'rewind',
  'fastForward',
  'next',
  'previous',
  'power',
  'sleep',
  'volumeUp',
  'volumeDown',
  'mute',
  'enter',
  'delete'
])

function normalizeHostKey(host?: string): string | null {
  const normalized = host?.trim().toLowerCase()
  return normalized ? normalized : null
}

function hasNativeProfile(device: SavedDevice): boolean {
  return Boolean(device.nativeRemote)
}

function hasNativeCertificate(device: SavedDevice): boolean {
  return Boolean(device.nativeRemote?.certificate?.key && device.nativeRemote?.certificate?.cert)
}

function canConnectViaNative(device: SavedDevice): boolean {
  return hasNativeProfile(device) && hasNativeCertificate(device)
}

function canUseAdb(device: SavedDevice): boolean {
  return device.adbEnabled !== false
}

function filterRemoteCommands(
  commands: unknown[] = []
): NonNullable<SavedDevice['preferences']>['remoteLayout']['pinnedCommands'] {
  const unique = new Set<string>()

  for (const command of commands) {
    if (typeof command === 'string' && REMOTE_COMMANDS.has(command)) {
      unique.add(command)
    }
  }

  return [...unique] as NonNullable<SavedDevice['preferences']>['remoteLayout']['pinnedCommands']
}

function normalizeDevicePreferences(
  preferences: SavedDevice['preferences'] | undefined,
  favorites: string[] = []
): DevicePreferences {
  const favoriteSet = new Set(favorites)
  const appHotkeys: Partial<Record<FavoriteAppHotkey, string>> = {}

  for (const hotkey of HOTKEYS) {
    const packageName = preferences?.appHotkeys?.[hotkey]

    if (packageName && favoriteSet.has(packageName)) {
      appHotkeys[hotkey] = packageName
    }
  }

  return {
    remoteLayout: {
      pinnedCommands: filterRemoteCommands(preferences?.remoteLayout?.pinnedCommands),
      hiddenCommands: filterRemoteCommands(preferences?.remoteLayout?.hiddenCommands)
    },
    appHotkeys,
    scrcpyPreset: preferences?.scrcpyPreset ?? DEFAULT_SCRCPY_PRESET
  }
}

function getBackendOrder(device: SavedDevice): ConnectionBackend[] {
  const preferred = device.preferredBackend ?? 'adb'
  const nativeReady = canConnectViaNative(device)
  const adbReady = canUseAdb(device)

  if (preferred === 'native') {
    if (nativeReady) {
      return ['native']
    }

    return adbReady ? ['adb'] : ['native']
  }

  if (preferred === 'adb') {
    return ['adb']
  }

  if (nativeReady && adbReady) {
    return ['native', 'adb']
  }

  if (nativeReady) {
    return ['native']
  }

  if (adbReady) {
    return ['adb']
  }

  return ['native']
}

function createBackendHealthSnapshot(overrides?: Partial<BackendHealthSnapshot>): BackendHealthSnapshot {
  return {
    available: false,
    ready: false,
    ...overrides
  }
}

function shouldSuggestAdbPairing(device: Pick<SavedDevice, 'mode' | 'connectPort'>, message?: string): boolean {
  if (!message) {
    return false
  }

  const normalized = message.toLowerCase()
  const isReachabilityError =
    normalized.includes('no route to host') ||
    normalized.includes('network is unreachable') ||
    normalized.includes('connection refused') ||
    normalized.includes('failed to connect')

  return isReachabilityError && (device.mode === 'pair' || device.connectPort === 5555)
}

function formatAdbConnectError(device: Pick<SavedDevice, 'host' | 'connectPort' | 'mode'>, error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : 'ADB connection failed.'

  if (shouldSuggestAdbPairing(device, message)) {
    if (device.mode === 'pair') {
      return `${message} The TV is not reachable on saved ADB connect port ${device.connectPort}. Open Wireless Debugging on the TV, confirm the current connect port, then pair and connect again.`
    }

    if (device.connectPort === 5555) {
      return `${message} Port 5555 is usually not the Wireless Debugging port on Android TV. Switch to "Pair then connect" and use the current connect port shown on the TV instead of 5555.`
    }
  }

  const normalized = message.toLowerCase()
  const isReachabilityError =
    normalized.includes('no route to host') ||
    normalized.includes('network is unreachable') ||
    normalized.includes('connection refused')

  if (isReachabilityError) {
    return `${message} ${device.host}:${device.connectPort} is not reachable right now. If this TV uses Wireless Debugging, reopen that screen and verify the current connect port on the TV.`
  }

  return message
}

function shouldRetryAdbAfterServerRestart(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return (
    message.includes('no route to host') ||
    message.includes('cannot assign requested address') ||
    message.includes('network is unreachable')
  )
}

interface StoredDeviceDraft {
  id?: string
  name: string
  host?: string
  connectPort?: number
  pairPort?: number
  mode?: SavedDevice['mode']
  preferredBackend?: SavedDevice['preferredBackend']
  nativeRemote?: SavedDevice['nativeRemote']
  adbEnabled?: SavedDevice['adbEnabled']
  lastConnectedAt?: SavedDevice['lastConnectedAt']
  lastConnectedBackend?: SavedDevice['lastConnectedBackend']
  cachedApps?: SavedDevice['cachedApps']
  favorites?: SavedDevice['favorites']
  recentApps?: SavedDevice['recentApps']
  preferences?: SavedDevice['preferences']
  backendHealth?: SavedDevice['backendHealth']
}

interface DeviceIdentityMatch {
  device: SavedDevice | null
  matchedBy: 'id' | 'host' | null
}

interface AdbDiscoveryClientLike {
  listMdnsServices?: () => Promise<DiscoveredAdbService[]>
  restartServer?: () => Promise<void>
}

export class DeviceManager extends EventEmitter<DeviceManagerEvents> {
  private savedDevices: SavedDevice[] = []
  private activeDeviceId: string | null = null
  private activeBackend: ConnectionBackend | null = null
  private connectionState: ConnectionState = { status: 'disconnected' }
  private reconnectInFlight = false
  private healthCheckTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly store: DeviceStore,
    private readonly adbClient: AdbClient,
    private readonly nativeRemoteService: NativeRemoteService
  ) {
    super()
  }

  async init(): Promise<void> {
    const snapshot = this.store.load()
    const normalizedDevices = snapshot.savedDevices.map((device) =>
      this.normalizeDevice({
        ...device
      })
    )
    const deduped = this.dedupeSavedDevices(normalizedDevices, snapshot.activeDeviceId)
    this.savedDevices = deduped.devices
    this.activeDeviceId = deduped.activeDeviceId

    this.nativeRemoteService.on('unpaired', (message) => {
      const activeDevice = this.getActiveDevice()

      if (activeDevice) {
        this.updateBackendHealth(activeDevice.id, 'native', {
          available: hasNativeProfile(activeDevice),
          ready: false,
          lastState: 'error',
          lastError: message
        })
      }

      this.activeBackend = null
      this.updateConnectionState({
        status: 'error',
        deviceId: activeDevice?.id,
        message
      })
    })

    this.emitDevicesChanged()
    this.persist()

    this.healthCheckTimer = setInterval(() => {
      void this.performHealthCheck()
    }, 7_000)

    if (this.getActiveDevice()) {
      queueMicrotask(() => {
        void this.attemptReconnect().catch((error) => {
          const activeDevice = this.getActiveDevice()

          this.activeBackend = null
          this.updateConnectionState({
            status: 'error',
            deviceId: activeDevice?.id,
            message: error instanceof Error ? error.message : 'Reconnect failed.'
          })
        })
      })
    }
  }

  dispose(): void {
    this.nativeRemoteService.disconnect()

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  listDevices(): SavedDevice[] {
    return [...this.savedDevices].sort((left, right) => left.name.localeCompare(right.name))
  }

  getActiveDevice(): SavedDevice | null {
    return this.savedDevices.find((device) => device.id === this.activeDeviceId) ?? null
  }

  getActiveBackend(): ConnectionBackend | null {
    return this.activeBackend
  }

  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  getPendingNativePairing(): PendingNativePairing | null {
    return this.nativeRemoteService.getPendingPairing()
  }

  getCapabilities() {
    const activeDevice = this.getActiveDevice()
    const adbReady = Boolean(
      activeDevice &&
        canUseAdb(activeDevice) &&
        (this.activeBackend === 'adb'
          ? this.connectionState.status === 'connected'
          : activeDevice.backendHealth?.adb.ready)
    )

    return {
      nativeRemote: Boolean(activeDevice && canConnectViaNative(activeDevice)),
      adbFallback: adbReady,
      typing: this.activeBackend === 'adb' || adbReady,
      apps: this.activeBackend === 'adb' || adbReady
    }
  }

  async getHealth(adbAvailable: boolean): Promise<DeviceHealthStatus | null> {
    const activeDevice = this.getActiveDevice()

    if (!activeDevice) {
      return null
    }

    const pendingNativePairing = this.getPendingNativePairing()
    const adbSnapshot = this.resolveAdbHealth(activeDevice, adbAvailable)
    const nativeSnapshot = this.resolveNativeHealth(activeDevice)
    const issues: HealthIssue[] = []

    if (!adbAvailable) {
      issues.push({
        code: 'adb_missing',
        severity: 'danger',
        summary: 'ADB is not available on this computer.',
        detail: 'Install Android platform-tools so this app can connect reliably and power typing plus installed apps.',
        backend: 'system'
      })
    } else if (!canUseAdb(activeDevice)) {
      issues.push({
        code: 'adb_disabled_for_tv',
        severity: 'warning',
        summary: 'ADB is turned off for this TV profile.',
        detail: 'Enable ADB for this TV to unlock typing, installed apps, and the most reliable connection path.',
        backend: 'adb'
      })
    } else if (this.connectionState.status === 'unauthorized' && this.connectionState.backend === 'adb') {
      issues.push({
        code: 'adb_unauthorized',
        severity: 'warning',
        summary: 'ADB needs authorization on the TV.',
        detail: 'Accept the wireless debugging prompt on the TV, then retry the ADB connection.',
        backend: 'adb'
      })
    } else if (activeDevice.mode === 'pair' && !adbSnapshot.ready && !activeDevice.backendHealth?.adb.lastConnectedAt) {
      issues.push({
        code: 'adb_pair_required',
        severity: 'warning',
        summary: 'ADB pairing still needs to be completed for this TV.',
        detail: 'Use the pairing code from the TV before trying to use ADB-backed features.',
        backend: 'adb'
      })
    } else if (adbSnapshot.lastError && this.connectionState.status !== 'connected') {
      issues.push({
        code: 'adb_connect_failed',
        severity: 'danger',
        summary: 'ADB is enabled but not ready yet.',
        detail: adbSnapshot.lastError,
        backend: 'adb'
      })
    }

    if (pendingNativePairing && pendingNativePairing.deviceId === activeDevice.id) {
      issues.push({
        code: 'native_pairing_stalled',
        severity: 'warning',
        summary: 'Native remote is waiting for a TV code.',
        detail: 'If the TV never shows the code prompt, stop here and switch back to ADB.',
        backend: 'native'
      })
    }

    if (issues.length === 0) {
      issues.push({
        code: 'ready',
        severity: 'positive',
        summary: 'This TV is ready to use.',
        detail:
          this.connectionState.status === 'connected'
            ? `Connected over ${this.activeBackend === 'native' ? 'Native Remote' : 'ADB'}.`
            : 'ADB is configured and the setup state looks healthy.'
      })
    }

    const recommendedActions = this.buildRecommendedActions(activeDevice, issues)
    const primaryIssue = issues[0]

    return {
      deviceId: activeDevice.id,
      summary: primaryIssue.summary,
      detail: primaryIssue.detail,
      issues,
      adb: adbSnapshot,
      native: nativeSnapshot,
      recommendedActions
    }
  }

  async runAdbTroubleshooting(adbAvailable: boolean): Promise<DeviceHealthStatus | null> {
    const activeDevice = this.getActiveDevice()

    if (!activeDevice) {
      return null
    }

    if (!adbAvailable) {
      this.updateBackendHealth(activeDevice.id, 'adb', {
        available: false,
        ready: false,
        lastState: 'missing',
        lastError: 'ADB was not detected on this computer.'
      })
      return this.getHealth(adbAvailable)
    }

    if (!canUseAdb(activeDevice)) {
      this.updateBackendHealth(activeDevice.id, 'adb', {
        available: false,
        ready: false,
        lastState: 'disabled',
        lastError: 'ADB is disabled for this TV profile.'
      })
      return this.getHealth(adbAvailable)
    }

    if (this.getPendingNativePairing()?.deviceId === activeDevice.id) {
      this.updateBackendHealth(activeDevice.id, 'native', {
          available: hasNativeProfile(activeDevice),
          ready: false,
          lastState: 'pairing',
          lastError: 'Native pairing is still waiting for a code from the TV.'
      })
      return this.getHealth(adbAvailable)
    }

    try {
      const discovered = await this.getResolvedAdbEndpoint(activeDevice.host)
      const resolvedDevice = discovered
        ? this.normalizeDevice({
            ...activeDevice,
            connectPort: discovered.connectPort ?? activeDevice.connectPort,
            pairPort: discovered.pairPort ?? activeDevice.pairPort
          })
        : activeDevice
      const devices = await this.adbClient.listDevices()
      const liveState = deriveConnectionState(devices, buildSerial(resolvedDevice), activeDevice.id)

      if (liveState.status === 'connected') {
        this.updateBackendHealth(activeDevice.id, 'adb', {
          available: true,
          ready: true,
          lastState: 'ready',
          lastError: undefined,
          lastConnectedAt: new Date().toISOString()
        })
        return this.getHealth(adbAvailable)
      }

      if (liveState.status === 'unauthorized') {
        this.updateBackendHealth(activeDevice.id, 'adb', {
          available: true,
          ready: false,
          lastState: 'unauthorized',
          lastError: liveState.message
        })
        return this.getHealth(adbAvailable)
      }

      if (resolvedDevice.mode === 'pair' && resolvedDevice.pairPort) {
        this.updateBackendHealth(activeDevice.id, 'adb', {
          available: true,
          ready: false,
          lastState: 'pairing',
          lastError: `Pair ADB with ${resolvedDevice.host}:${resolvedDevice.pairPort} before reconnecting.`
        })
        return this.getHealth(adbAvailable)
      }

      await this.connectAdbWithRecovery(resolvedDevice)
      const nextState = await this.adbClient.getConnectionState(resolvedDevice)

      if (nextState.status === 'connected') {
        this.updateBackendHealth(activeDevice.id, 'adb', {
          available: true,
          ready: true,
          lastState: 'ready',
          lastError: undefined,
          lastConnectedAt: new Date().toISOString()
        })
      } else {
        this.updateBackendHealth(activeDevice.id, 'adb', {
          available: true,
          ready: false,
          lastState: nextState.status,
          lastError: nextState.message ?? 'ADB is still not ready for this TV.'
        })
      }
    } catch (error) {
      this.updateBackendHealth(activeDevice.id, 'adb', {
        available: true,
        ready: false,
        lastState: 'error',
        lastError: error instanceof Error ? error.message : 'ADB troubleshooting failed.'
      })
    }

    return this.getHealth(adbAvailable)
  }

  async discoverNativeDevices(): Promise<DiscoveredNativeDevice[]> {
    return this.nativeRemoteService.discoverDevices()
  }

  async discoverAdbEndpoints(host?: string): Promise<ResolvedAdbEndpoints[]> {
    const client = this.adbClient as AdbDiscoveryClientLike

    let services: DiscoveredAdbService[] = []

    if (typeof client.listMdnsServices === 'function') {
      try {
        services = await client.listMdnsServices()
      } catch {
        services = []
      }
    }

    if (services.length === 0) {
      services = await this.discoverAdbBonjourServices()
    }

    const grouped = new Map<string, ResolvedAdbEndpoints>()

    for (const service of services) {
      const key = normalizeHostKey(service.host)

      if (!key) {
        continue
      }

      const current = grouped.get(key) ?? {
        host: service.host,
        services: []
      }

      current.services.push(service)

      if (service.serviceType === 'pairing') {
        current.pairPort = service.port
      }

      if (service.serviceType === 'connect' || (!current.connectPort && service.serviceType === 'legacy')) {
        current.connectPort = service.port
      }

      grouped.set(key, current)
    }

    const targetHostKey = normalizeHostKey(host)
    const endpoints = [...grouped.values()].sort((left, right) => left.host.localeCompare(right.host))
    return targetHostKey ? endpoints.filter((item) => normalizeHostKey(item.host) === targetHostKey) : endpoints
  }

  async saveDevice(input: SaveDeviceInput): Promise<SavedDevice> {
    const { device: existing } = this.findSavedDevice(input)

    const device = this.normalizeDevice({
      ...existing,
      ...input,
      id: existing?.id ?? input.id ?? randomUUID()
    })

    const deviceHostKey = normalizeHostKey(device.host)
    this.savedDevices = this.savedDevices.filter((item) => {
      if (item.id === device.id) {
        return false
      }

      if (deviceHostKey && normalizeHostKey(item.host) === deviceHostKey) {
        return false
      }

      return true
    })
    this.savedDevices.push(device)
    this.persist()
    this.emitDevicesChanged()
    return device
  }

  async deleteDevice(deviceId: string): Promise<SavedDevice[]> {
    const device = this.savedDevices.find((item) => item.id === deviceId)

    if (!device) {
      return this.listDevices()
    }

    const pendingNativePairing = this.nativeRemoteService.getPendingPairing()
    const shouldTearDownSession =
      this.activeDeviceId === deviceId || pendingNativePairing?.deviceId === deviceId

    if (shouldTearDownSession) {
      if (this.activeBackend === 'native' || pendingNativePairing) {
        this.nativeRemoteService.disconnect()
      }

      if (this.activeBackend === 'adb') {
        await this.adbClient.disconnect(buildSerial(device))
      }

      this.activeDeviceId = null
      this.activeBackend = null
      this.updateConnectionState({
        status: 'disconnected',
        message: `${device.name} was removed from saved TVs.`
      })
    }

    this.savedDevices = this.savedDevices.filter((item) => item.id !== deviceId)
    this.persist()
    this.emitDevicesChanged()
    return this.listDevices()
  }

  async updateDeviceAppsCache(
    deviceId: string,
    apps: NonNullable<SavedDevice['cachedApps']>['apps']
  ): Promise<SavedDevice> {
    const existing = this.savedDevices.find((item) => item.id === deviceId)

    if (!existing) {
      throw new Error('Cannot update apps for a TV that is no longer saved.')
    }

    const updated = this.normalizeDevice({
      ...existing,
      cachedApps: {
        updatedAt: new Date().toISOString(),
        apps
      }
    })

    this.savedDevices = this.savedDevices.map((item) => (item.id === deviceId ? updated : item))
    this.persist()
    this.emitDevicesChanged()
    return updated
  }

  async toggleFavoriteApp(packageName: string): Promise<SavedDevice> {
    const activeDevice = this.getActiveDevice()

    if (!activeDevice) {
      throw new Error('Connect to a TV before pinning favorite apps.')
    }

    const favorites = new Set(activeDevice.favorites ?? [])

    const preferences = normalizeDevicePreferences(activeDevice.preferences, activeDevice.favorites)

    if (favorites.has(packageName)) {
      favorites.delete(packageName)
      for (const hotkey of HOTKEYS) {
        if (preferences.appHotkeys[hotkey] === packageName) {
          delete preferences.appHotkeys[hotkey]
        }
      }
    } else {
      favorites.add(packageName)
    }

    return this.replaceDevice(activeDevice.id, {
      favorites: [...favorites].sort(),
      preferences
    })
  }

  async updateActiveDevicePreferences(input: UpdateDevicePreferencesInput): Promise<SavedDevice> {
    const activeDevice = this.getActiveDevice()

    if (!activeDevice) {
      throw new Error('Connect to a TV before updating remote preferences.')
    }

    const favorites = activeDevice.favorites ?? []
    const current = normalizeDevicePreferences(activeDevice.preferences, favorites)
    const next: DevicePreferences = {
      ...current,
      remoteLayout: {
        pinnedCommands: input.remoteLayout?.pinnedCommands
          ? filterRemoteCommands(input.remoteLayout.pinnedCommands)
          : current.remoteLayout.pinnedCommands,
        hiddenCommands: input.remoteLayout?.hiddenCommands
          ? filterRemoteCommands(input.remoteLayout.hiddenCommands)
          : current.remoteLayout.hiddenCommands
      },
      appHotkeys: {
        ...current.appHotkeys
      },
      scrcpyPreset: input.scrcpyPreset ?? current.scrcpyPreset
    }

    for (const [hotkey, packageName] of Object.entries(input.appHotkeys ?? {})) {
      if (!HOTKEYS.includes(hotkey as FavoriteAppHotkey)) {
        continue
      }

      if (!packageName) {
        delete next.appHotkeys[hotkey as FavoriteAppHotkey]
        continue
      }

      if (!favorites.includes(packageName)) {
        throw new Error('Only pinned apps can be assigned to number hotkeys.')
      }

      for (const existingHotkey of HOTKEYS) {
        if (next.appHotkeys[existingHotkey] === packageName) {
          delete next.appHotkeys[existingHotkey]
        }
      }

      next.appHotkeys[hotkey as FavoriteAppHotkey] = packageName
    }

    return this.replaceDevice(activeDevice.id, { preferences: normalizeDevicePreferences(next, favorites) })
  }

  async wakeAndReconnect(): Promise<ActionFeedback> {
    const activeDevice = this.getActiveDevice()

    if (!activeDevice) {
      throw new Error('Connect to a TV before using wake and reconnect.')
    }

    await this.withAdbAccess((serial) => this.adbClient.wakeUp(serial))
    const state = await this.connectDevice({ id: activeDevice.id })

    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      status: state.status === 'connected' ? 'success' : 'error',
      kind: 'system',
      title: state.status === 'connected' ? 'Wake and reconnect finished' : 'Wake sent, reconnect needs attention',
      detail:
        state.status === 'connected'
          ? `${activeDevice.name} is awake and connected over ${state.backend === 'native' ? 'Native Remote' : 'ADB'}.`
          : state.message ?? 'Wake was sent, but the TV did not reconnect cleanly.'
    }
  }

  async recordAppLaunch(packageName: string): Promise<SavedDevice> {
    const activeDevice = this.getActiveDevice()

    if (!activeDevice) {
      throw new Error('Connect to a TV before recording app launches.')
    }

    const launchedAt = new Date().toISOString()
    const recentApps = [
      { packageName, launchedAt },
      ...(activeDevice.recentApps ?? []).filter((entry) => entry.packageName !== packageName)
    ].slice(0, RECENT_APPS_LIMIT)

    return this.replaceDevice(activeDevice.id, { recentApps })
  }

  async beginNativePairing(input: BeginNativePairingInput): Promise<ConnectionState> {
    const saved = await this.saveDevice({
      id: input.id,
      name: input.name,
      host: input.host,
      connectPort: input.connectPort,
      pairPort: input.pairPort,
      mode: input.mode,
      preferredBackend: input.preferredBackend ?? 'auto',
      adbEnabled: input.adbEnabled,
      nativeRemote: {
        serviceLabel: input.serviceLabel,
        remotePort: input.remotePort,
        pairingPort: input.pairingPort
      }
    })

    this.activeDeviceId = saved.id
    this.persist()
      this.updateBackendHealth(saved.id, 'native', {
        available: true,
        ready: false,
        lastState: 'pairing',
        lastError: 'Waiting for the TV to show a pairing code.'
    })

    this.updateConnectionState({
      status: 'pairing',
      backend: 'native',
      deviceId: saved.id,
      message: `Start the pairing prompt on ${saved.name}, then enter the code shown on the TV.`
    })

    try {
      const result = await this.nativeRemoteService.connect(saved)

      if (result.status === 'pairing') {
        this.activeBackend = null
        return this.connectionState
      }

      return this.finalizeNativeConnection(saved, result.certificate)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start native pairing.'
      this.activeBackend = null
      this.updateBackendHealth(saved.id, 'native', {
        available: true,
        ready: false,
        lastState: 'error',
        lastError: message
      })
      this.updateConnectionState({
        status: 'error',
        backend: 'native',
        deviceId: saved.id,
        message
      })
      throw error
    }
  }

  async completeNativePairing(code: string): Promise<ConnectionState> {
    const activeDevice = this.getActiveDevice()

    if (!activeDevice) {
      throw new Error('No TV is currently waiting for a native remote pairing code.')
    }

    try {
      const certificate = await this.nativeRemoteService.completePairing(code)
      return this.finalizeNativeConnection(activeDevice, certificate)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Native pairing confirmation failed.'
      this.activeBackend = null
      this.updateBackendHealth(activeDevice.id, 'native', {
        available: hasNativeProfile(activeDevice),
        ready: false,
        lastState: 'error',
        lastError: message
      })
      this.updateConnectionState({
        status: 'error',
        backend: 'native',
        deviceId: activeDevice.id,
        message
      })
      throw error
    }
  }

  async pairAndConnect(input: PairDeviceInput): Promise<ConnectionState> {
    const discovered = await this.getResolvedAdbEndpoint(input.host)
    const connectPort = discovered?.connectPort ?? input.connectPort
    const pairPort = discovered?.pairPort ?? input.pairPort

    this.updateConnectionState({
      status: 'pairing',
      backend: 'adb',
      message: `Pairing ADB with ${input.host}:${pairPort}...`
    })

    await this.adbClient.pair(input.host, pairPort, input.code)

    const saved = await this.saveDevice({
      name: input.name,
      host: input.host,
      connectPort,
      pairPort,
      mode: input.mode ?? 'pair',
      preferredBackend: input.preferredBackend,
      nativeRemote: input.nativeRemote,
      adbEnabled: input.adbEnabled ?? true
    })

    this.updateBackendHealth(saved.id, 'adb', {
      available: true,
      ready: false,
      lastState: 'pairing',
      lastError: undefined
    })

    return this.connectViaAdb(saved)
  }

  async connectDevice(input: ConnectDeviceInput): Promise<ConnectionState> {
    const { device: existing } = this.findSavedDevice(input)

    const baseDeviceDraft = existing
      ? this.normalizeDevice({
          ...existing,
          ...input,
          id: existing.id
        })
      : this.normalizeDevice({
          id: randomUUID(),
          name: input.name?.trim() || input.host || 'Android TV',
          host: input.host,
          connectPort: input.connectPort,
          pairPort: input.pairPort,
          mode: input.mode,
          preferredBackend: input.preferredBackend,
          nativeRemote: input.nativeRemote,
          adbEnabled: input.adbEnabled
        })

    if (existing) {
      this.activeDeviceId = existing.id
      this.persist()
    }

    const discovered = await this.getResolvedAdbEndpoint(baseDeviceDraft.host)
    if (discovered?.connectPort) {
      baseDeviceDraft.connectPort = discovered.connectPort
    }
    if (discovered?.pairPort) {
      baseDeviceDraft.pairPort = discovered.pairPort
    }

    let nativeError: Error | null = null

    for (const backend of getBackendOrder(baseDeviceDraft)) {
      if (backend === 'native' && canConnectViaNative(baseDeviceDraft)) {
        try {
          const result = await this.connectViaNative(baseDeviceDraft)

          if (result.status === 'pairing') {
            return this.connectionState
          }

          return result
        } catch (error) {
          nativeError = error instanceof Error ? error : new Error('Native remote connection failed.')
          baseDeviceDraft.backendHealth = {
            adb: createBackendHealthSnapshot(baseDeviceDraft.backendHealth?.adb),
            native: createBackendHealthSnapshot({
              ...baseDeviceDraft.backendHealth?.native,
              available: true,
              ready: false,
              lastState: 'error',
              lastError: nativeError.message
            })
          }
          if (existing) {
            this.updateBackendHealth(existing.id, 'native', {
              available: true,
              ready: false,
              lastState: 'error',
              lastError: nativeError.message
            })
          }
        }
      }

      if (backend === 'adb' && canUseAdb(baseDeviceDraft)) {
        try {
          return await this.connectViaAdb(baseDeviceDraft, nativeError)
        } catch (error) {
          const adbError = error instanceof Error ? error : new Error('ADB connection failed.')
          if (existing) {
            this.updateBackendHealth(existing.id, 'adb', {
              available: true,
              ready: false,
              lastState: 'error',
              lastError: adbError.message
            })
          }

          if (nativeError) {
            throw new Error(`${nativeError.message} ADB fallback also failed: ${adbError.message}`)
          }

          throw adbError
        }
      }
    }

    if (nativeError) {
      throw nativeError
    }

    throw new Error('This TV has no usable connection path yet. Pair native remote or enable ADB fallback in Setup.')
  }

  async disconnectActiveDevice(): Promise<ConnectionState> {
    const activeDevice = this.getActiveDevice()
    const pendingNativePairing = this.nativeRemoteService.getPendingPairing()

    if (this.activeBackend === 'native' || pendingNativePairing) {
      this.nativeRemoteService.disconnect()
    }

    if (this.activeBackend === 'adb' && activeDevice) {
      await this.adbClient.disconnect(buildSerial(activeDevice))
    }

    if (activeDevice && this.activeBackend) {
      this.updateBackendHealth(activeDevice.id, this.activeBackend, {
        available: this.activeBackend === 'adb' ? canUseAdb(activeDevice) : hasNativeProfile(activeDevice),
        ready: false,
        lastState: 'disconnected'
      })
    }

    this.activeBackend = null
    this.updateConnectionState({
      status: 'disconnected',
      deviceId: activeDevice?.id,
      message: pendingNativePairing
        ? `Cancelled native pairing for ${pendingNativePairing.name}.`
        : activeDevice
          ? `Disconnected from ${activeDevice.name}.`
          : 'No device connected.'
    })

    return this.connectionState
  }

  async attemptReconnect(): Promise<ConnectionState> {
    const activeDevice = this.getActiveDevice()

    if (!shouldAttemptReconnect(activeDevice, this.connectionState, this.reconnectInFlight)) {
      return this.connectionState
    }

    if (!activeDevice) {
      return this.connectionState
    }

    this.reconnectInFlight = true

    try {
      return await this.connectDevice({ id: activeDevice.id })
    } catch (error) {
      this.activeBackend = null
      this.updateConnectionState({
        status: 'error',
        deviceId: activeDevice.id,
        message: error instanceof Error ? error.message : 'Reconnect failed.'
      })
      return this.connectionState
    } finally {
      this.reconnectInFlight = false
    }
  }

  async performHealthCheck(): Promise<ConnectionState> {
    const activeDevice = this.getActiveDevice()

    if (!activeDevice) {
      return this.connectionState
    }

    if (this.activeBackend === 'native') {
      if (this.nativeRemoteService.isConnected()) {
        this.updateBackendHealth(activeDevice.id, 'native', {
          available: true,
          ready: true,
          lastState: 'ready',
          lastError: undefined
        })
        return this.connectionState
      }

      this.updateBackendHealth(activeDevice.id, 'native', {
        available: true,
        ready: false,
        lastState: 'error',
        lastError: `Native remote session dropped for ${activeDevice.name}.`
      })

      this.updateConnectionState({
        status: 'error',
        backend: 'native',
        deviceId: activeDevice.id,
        message: `Native remote session dropped for ${activeDevice.name}. Reconnecting...`
      })

      return this.attemptReconnect()
    }

    if (this.activeBackend === 'adb') {
      try {
        const liveState = await this.adbClient.getConnectionState(activeDevice)

        if (liveState.status === 'connected') {
          this.updateBackendHealth(activeDevice.id, 'adb', {
            available: true,
            ready: true,
            lastState: 'ready',
            lastError: undefined
          })

          if (this.connectionState.status !== 'connected') {
            this.updateConnectionState({
              status: 'connected',
              backend: 'adb',
              deviceId: activeDevice.id,
              message: `Connected to ${activeDevice.name} over ADB.`
            })
          }

          return this.connectionState
        }

        this.updateBackendHealth(activeDevice.id, 'adb', {
          available: true,
          ready: false,
          lastState: liveState.status,
          lastError: liveState.message
        })
        this.updateConnectionState({
          ...liveState,
          backend: 'adb'
        })
        return this.attemptReconnect()
      } catch (error) {
        this.updateBackendHealth(activeDevice.id, 'adb', {
          available: true,
          ready: false,
          lastState: 'error',
          lastError: error instanceof Error ? error.message : 'Unable to refresh ADB state.'
        })
        this.updateConnectionState({
          status: 'error',
          backend: 'adb',
          deviceId: activeDevice.id,
          message: error instanceof Error ? error.message : 'Unable to refresh ADB state.'
        })
        return this.connectionState
      }
    }

    return this.connectionState
  }

  async withAdbAccess<T>(callback: (serial: string) => Promise<T>): Promise<T> {
    const activeDevice = this.getActiveDevice()

    if (!activeDevice) {
      throw new Error('Connect to a TV before using ADB-backed features.')
    }

    if (!canUseAdb(activeDevice)) {
      throw new Error('This TV is using native remote only. Enable ADB fallback in Setup to unlock typing and installed-app launching.')
    }

    const discovered = await this.getResolvedAdbEndpoint(activeDevice.host)
    const resolvedDevice = discovered
      ? this.normalizeDevice({
          ...activeDevice,
          connectPort: discovered.connectPort ?? activeDevice.connectPort,
          pairPort: discovered.pairPort ?? activeDevice.pairPort
        })
      : activeDevice

    const initialState = await this.adbClient.getConnectionState(resolvedDevice)

    if (initialState.status === 'unauthorized') {
      this.updateBackendHealth(activeDevice.id, 'adb', {
        available: true,
        ready: false,
        lastState: 'unauthorized',
        lastError: initialState.message
      })
      throw new Error(initialState.message ?? 'Authorize this computer in the TV wireless debugging prompt first.')
    }

    if (initialState.status !== 'connected') {
      await this.connectAdbWithRecovery(resolvedDevice)
    }

    const state =
      initialState.status === 'connected'
        ? initialState
        : await this.adbClient.getConnectionState(resolvedDevice)

    if (state.status !== 'connected') {
      this.updateBackendHealth(activeDevice.id, 'adb', {
        available: true,
        ready: false,
        lastState: state.status,
        lastError: state.message ?? 'ADB fallback is not ready for this TV yet.'
      })
      throw new Error('ADB fallback is not ready for this TV yet. Pair or reconnect ADB in Setup first.')
    }

    this.updateBackendHealth(activeDevice.id, 'adb', {
      available: true,
      ready: true,
      lastState: 'ready',
      lastError: undefined
    })

    return callback(buildSerial(resolvedDevice))
  }

  private async connectAdbWithRecovery(device: Pick<SavedDevice, 'host' | 'connectPort' | 'mode'>): Promise<void> {
    try {
      await this.adbClient.connect(device.host, device.connectPort)
      return
    } catch (error) {
      if (shouldRetryAdbAfterServerRestart(error)) {
        const client = this.adbClient as AdbDiscoveryClientLike

        if (typeof client.restartServer === 'function') {
          await client.restartServer()
          await this.adbClient.connect(device.host, device.connectPort)
          return
        }
      }

      throw new Error(formatAdbConnectError(device, error))
    }
  }

  private async connectViaNative(device: SavedDevice): Promise<ConnectionState> {
    this.updateConnectionState({
      status: 'connecting',
      backend: 'native',
      deviceId: device.id,
      message: `Connecting to ${device.name} via native remote...`
    })
    this.updateBackendHealth(device.id, 'native', {
      available: true,
      ready: false,
      lastState: 'connecting',
      lastError: undefined
    })

    const result = await this.nativeRemoteService.connect(device)

    if (result.status === 'pairing') {
      this.activeBackend = null
      this.updateBackendHealth(device.id, 'native', {
        available: true,
        ready: false,
        lastState: 'pairing',
        lastError: 'Waiting for the TV to show and accept a pairing code.'
      })
      this.updateConnectionState({
        status: 'pairing',
        backend: 'native',
        deviceId: device.id,
        message: `Enter the pairing code shown on ${device.name} to finish native remote setup.`
      })
      return this.connectionState
    }

    return this.finalizeNativeConnection(device, result.certificate)
  }

  private async connectViaAdb(device: SavedDevice, nativeError?: Error | null): Promise<ConnectionState> {
    this.nativeRemoteService.disconnect()

    this.updateConnectionState({
      status: 'connecting',
      backend: 'adb',
      deviceId: device.id,
      message: nativeError
        ? `${nativeError.message} Falling back to ADB...`
        : `Connecting to ${device.name} via ADB...`
    })
    this.updateBackendHealth(device.id, 'adb', {
      available: true,
      ready: false,
      lastState: 'connecting',
      lastError: undefined
    })

    await this.connectAdbWithRecovery(device)
    const nextState = await this.adbClient.getConnectionState(device)

    if (nextState.status !== 'connected') {
      this.updateBackendHealth(device.id, 'adb', {
        available: true,
        ready: false,
        lastState: nextState.status,
        lastError: nextState.message
      })
      this.updateConnectionState({
        ...nextState,
        backend: 'adb'
      })
      return this.connectionState
    }

    const now = new Date().toISOString()
    const adbHealthBase = createBackendHealthSnapshot(device.backendHealth?.adb)
    const nativeHealthBase = createBackendHealthSnapshot(device.backendHealth?.native)
    const saved = await this.saveDevice({
      id: device.id,
      name: device.name,
      host: device.host,
      connectPort: device.connectPort,
      pairPort: device.pairPort,
      mode: device.mode,
      preferredBackend: device.preferredBackend,
      nativeRemote: device.nativeRemote,
      adbEnabled: device.adbEnabled
    })

    saved.lastConnectedAt = now
    saved.lastConnectedBackend = 'adb'
    saved.backendHealth = {
      ...saved.backendHealth,
      adb: createBackendHealthSnapshot({
        ...adbHealthBase,
        available: true,
        ready: true,
        lastCheckedAt: now,
        lastConnectedAt: now,
        lastError: undefined,
        lastState: 'ready'
      }),
      native: createBackendHealthSnapshot({
        ...nativeHealthBase,
        available: hasNativeProfile(saved),
        ready: false,
        lastCheckedAt: now,
        lastState: nativeHealthBase.lastState ?? 'disconnected',
        lastConnectedAt: nativeHealthBase.lastConnectedAt,
        lastError: nativeHealthBase.lastError
      })
    }

    this.savedDevices = this.savedDevices.map((item) => (item.id === saved.id ? saved : item))
    this.activeDeviceId = saved.id
    this.activeBackend = 'adb'
    this.persist()
    this.emitDevicesChanged()

    this.updateConnectionState({
      status: 'connected',
      backend: 'adb',
      deviceId: saved.id,
      message: `Connected to ${saved.name} over ADB.`
    })

    return this.connectionState
  }

  private async finalizeNativeConnection(
    device: SavedDevice,
    certificate?: { key: string; cert: string }
  ): Promise<ConnectionState> {
    const now = new Date().toISOString()
    const adbHealthBase = createBackendHealthSnapshot(device.backendHealth?.adb)
    const nativeHealthBase = createBackendHealthSnapshot(device.backendHealth?.native)
    const saved = await this.saveDevice({
      id: device.id,
      name: device.name,
      host: device.host,
      connectPort: device.connectPort,
      pairPort: device.pairPort,
      mode: device.mode,
      preferredBackend: device.preferredBackend,
      adbEnabled: device.adbEnabled,
      nativeRemote: this.mergeNativeRemote(device.nativeRemote, certificate)
    })

    saved.lastConnectedAt = now
    saved.lastConnectedBackend = 'native'
    saved.backendHealth = {
      ...saved.backendHealth,
      adb: createBackendHealthSnapshot({
        ...adbHealthBase,
        available: canUseAdb(saved),
        ready: adbHealthBase.ready,
        lastCheckedAt: now,
        lastConnectedAt: adbHealthBase.lastConnectedAt,
        lastState: adbHealthBase.lastState,
        lastError: adbHealthBase.lastError
      }),
      native: createBackendHealthSnapshot({
        ...nativeHealthBase,
        available: true,
        ready: true,
        lastCheckedAt: now,
        lastConnectedAt: now,
        lastError: undefined,
        lastState: 'ready'
      })
    }

    this.savedDevices = this.savedDevices.map((item) => (item.id === saved.id ? saved : item))
    this.activeDeviceId = saved.id
    this.activeBackend = 'native'
    this.persist()
    this.emitDevicesChanged()

    this.updateConnectionState({
      status: 'connected',
      backend: 'native',
      deviceId: saved.id,
      message: `Connected to ${saved.name} via native remote service.`
    })

    return this.connectionState
  }

  private buildRecommendedActions(device: SavedDevice, issues: HealthIssue[]): RecommendedAction[] {
    const actions: RecommendedAction[] = []
    const primaryIssue = issues[0]

    switch (primaryIssue?.code) {
      case 'adb_pair_required':
        actions.push('pair_adb')
        break
      case 'adb_unauthorized':
        actions.push('connect_adb')
        break
      case 'adb_connect_failed':
        actions.push(shouldSuggestAdbPairing(device, primaryIssue.detail) ? 'pair_adb' : 'connect_adb')
        break
      case 'native_pairing_stalled':
        actions.push(canUseAdb(device) ? 'switch_to_adb' : 'retry_native')
        break
      case 'ready':
        if (this.connectionState.status === 'connected') {
          actions.push('open_remote')
          if (canUseAdb(device)) {
            actions.push('open_apps')
          }
        } else if (canUseAdb(device)) {
          actions.push(device.mode === 'pair' ? 'pair_adb' : 'connect_adb')
        }
        break
      default:
        break
    }

    if (actions.length === 0 && primaryIssue?.code === 'ready' && this.connectionState.status === 'connected') {
      actions.push('open_remote')
    }

    return [...new Set(actions)].slice(0, 2)
  }

  private resolveAdbHealth(device: SavedDevice, adbAvailable: boolean): BackendHealthSnapshot {
    const saved = createBackendHealthSnapshot(device.backendHealth?.adb)

    if (!adbAvailable) {
      return createBackendHealthSnapshot({
        ...saved,
        available: false,
        ready: false,
        lastState: 'missing'
      })
    }

    if (!canUseAdb(device)) {
      return createBackendHealthSnapshot({
        ...saved,
        available: false,
        ready: false,
        lastState: 'disabled'
      })
    }

    return createBackendHealthSnapshot({
      ...saved,
      available: true,
      ready: this.activeBackend === 'adb' ? this.connectionState.status === 'connected' : saved.ready
    })
  }

  private resolveNativeHealth(device: SavedDevice): BackendHealthSnapshot {
    const saved = createBackendHealthSnapshot(device.backendHealth?.native)

    if (!hasNativeProfile(device)) {
      return createBackendHealthSnapshot({
        ...saved,
        available: false,
        ready: false,
        lastState: 'not_configured'
      })
    }

    return createBackendHealthSnapshot({
      ...saved,
      available: true,
      ready: this.activeBackend === 'native' ? this.connectionState.status === 'connected' : saved.ready
    })
  }

  private mergeNativeRemote(
    nativeRemote: NativeRemoteConfig | undefined,
    certificate?: { key: string; cert: string }
  ): NativeRemoteConfig | undefined {
    if (!nativeRemote) {
      return undefined
    }

    return {
      ...nativeRemote,
      certificate: certificate ?? nativeRemote.certificate
    }
  }

  private normalizeDevice(input: StoredDeviceDraft): SavedDevice {
    if (!input.host) {
      throw new Error('A host or IP address is required.')
    }

    const adbEnabled = input.adbEnabled ?? true
    const nativeRemote = input.nativeRemote

    return {
      id: input.id ?? randomUUID(),
      name: input.name.trim(),
      host: input.host.trim(),
      connectPort: input.connectPort ?? 5555,
      pairPort: input.pairPort,
      mode: input.mode ?? 'connect',
      preferredBackend: input.preferredBackend ?? 'adb',
      adbEnabled,
      nativeRemote,
      lastConnectedAt: input.lastConnectedAt,
      lastConnectedBackend: input.lastConnectedBackend,
      cachedApps: input.cachedApps,
      favorites: [...new Set(input.favorites ?? [])],
      recentApps: (input.recentApps ?? []).slice(0, RECENT_APPS_LIMIT),
      preferences: normalizeDevicePreferences(input.preferences, input.favorites),
      backendHealth: {
        adb: createBackendHealthSnapshot({
          ...input.backendHealth?.adb,
          available: adbEnabled
        }),
        native: createBackendHealthSnapshot({
          ...input.backendHealth?.native,
          available: Boolean(nativeRemote)
        })
      }
    }
  }

  private async getResolvedAdbEndpoint(host?: string): Promise<ResolvedAdbEndpoints | null> {
    if (!host) {
      return null
    }

    try {
      const [match] = await this.discoverAdbEndpoints(host)
      return match ?? null
    } catch {
      return null
    }
  }

  private async discoverAdbBonjourServices(timeoutMs = 4_000): Promise<DiscoveredAdbService[]> {
    const bonjour = new Bonjour()
    const found = new Map<string, DiscoveredAdbService>()
    const services: Array<{ type: 'pairing' | 'connect' | 'legacy'; bonjourType: string }> = [
      { type: 'pairing', bonjourType: 'adb-tls-pairing' },
      { type: 'connect', bonjourType: 'adb-tls-connect' },
      { type: 'legacy', bonjourType: 'adb' }
    ]
    const browsers = services.map((service) => bonjour.find({ type: service.bonjourType, protocol: 'tcp' }))

    services.forEach((service, index) => {
      browsers[index].on('up', (entry: { name: string; port: number; addresses: string[] }) => {
        const host = entry.addresses.find((address) => /^\d+\.\d+\.\d+\.\d+$/.test(address))

        if (!host) {
          return
        }

        found.set(`${service.type}:${entry.name}:${host}:${entry.port}`, {
          name: entry.name,
          host,
          port: entry.port,
          serviceType: service.type
        })
      })
    })

    await new Promise((resolve) => setTimeout(resolve, timeoutMs))

    for (const browser of browsers) {
      browser.stop()
    }
    bonjour.destroy()

    return [...found.values()]
  }

  private findSavedDevice(input: { id?: string; host?: string }): DeviceIdentityMatch {
    if (input.id) {
      const byId = this.savedDevices.find((item) => item.id === input.id) ?? null

      if (byId) {
        return {
          device: byId,
          matchedBy: 'id'
        }
      }
    }

    const hostKey = normalizeHostKey(input.host)

    if (!hostKey) {
      return {
        device: null,
        matchedBy: null
      }
    }

    const byHost = this.savedDevices.find((item) => normalizeHostKey(item.host) === hostKey) ?? null

    return {
      device: byHost,
      matchedBy: byHost ? 'host' : null
    }
  }

  private dedupeSavedDevices(
    devices: SavedDevice[],
    activeDeviceId: string | null
  ): { devices: SavedDevice[]; activeDeviceId: string | null } {
    const deduped = new Map<string, SavedDevice>()
    const idRemap = new Map<string, string>()

    for (const device of devices) {
      const hostKey = normalizeHostKey(device.host)

      if (!hostKey) {
        deduped.set(device.id, device)
        continue
      }

      const existing = deduped.get(hostKey)

      if (!existing) {
        deduped.set(hostKey, device)
        continue
      }

      const preferred = this.choosePreferredDuplicate(existing, device, activeDeviceId)
      const discarded = preferred.id === existing.id ? device : existing
      deduped.set(hostKey, preferred)
      idRemap.set(discarded.id, preferred.id)
    }

    return {
      devices: [...deduped.values()],
      activeDeviceId: activeDeviceId ? idRemap.get(activeDeviceId) ?? activeDeviceId : null
    }
  }

  private choosePreferredDuplicate(
    left: SavedDevice,
    right: SavedDevice,
    activeDeviceId: string | null
  ): SavedDevice {
    if (left.id === activeDeviceId) {
      return left
    }

    if (right.id === activeDeviceId) {
      return right
    }

    const leftTime = left.lastConnectedAt ? new Date(left.lastConnectedAt).getTime() : 0
    const rightTime = right.lastConnectedAt ? new Date(right.lastConnectedAt).getTime() : 0

    if (leftTime !== rightTime) {
      return rightTime > leftTime ? right : left
    }

    const leftScore = Number(Boolean(left.cachedApps)) + Number((left.favorites?.length ?? 0) > 0)
    const rightScore = Number(Boolean(right.cachedApps)) + Number((right.favorites?.length ?? 0) > 0)

    return rightScore > leftScore ? right : left
  }

  private replaceDevice(
    deviceId: string,
    patch: Partial<SavedDevice>,
    options?: { emitDevicesChanged?: boolean }
  ): SavedDevice {
    const existing = this.savedDevices.find((item) => item.id === deviceId)

    if (!existing) {
      throw new Error('That TV profile no longer exists.')
    }

    const updated = this.normalizeDevice({
      ...existing,
      ...patch
    })

    this.savedDevices = this.savedDevices.map((item) => (item.id === deviceId ? updated : item))
    this.persist()
    if (options?.emitDevicesChanged !== false) {
      this.emitDevicesChanged()
    }
    return updated
  }

  private updateBackendHealth(
    deviceId: string,
    backend: ConnectionBackend,
    patch: Partial<BackendHealthSnapshot>
  ): SavedDevice | null {
    const existing = this.savedDevices.find((item) => item.id === deviceId)

    if (!existing) {
      return null
    }

    const currentSnapshot =
      backend === 'adb'
        ? createBackendHealthSnapshot(existing.backendHealth?.adb)
        : createBackendHealthSnapshot(existing.backendHealth?.native)
    const nextSnapshot = createBackendHealthSnapshot({
      ...currentSnapshot,
      ...patch,
      lastCheckedAt: patch.lastCheckedAt ?? new Date().toISOString()
    })

    return this.replaceDevice(
      deviceId,
      {
      backendHealth: {
        adb: backend === 'adb' ? nextSnapshot : createBackendHealthSnapshot(existing.backendHealth?.adb),
        native:
          backend === 'native' ? nextSnapshot : createBackendHealthSnapshot(existing.backendHealth?.native)
      }
      },
      { emitDevicesChanged: false }
    )
  }

  private updateConnectionState(nextState: ConnectionState): void {
    this.connectionState = nextState
    this.emit('connectionState', nextState)
  }

  private emitDevicesChanged(): void {
    this.emit('devicesChanged', this.listDevices())
  }

  private persist(): void {
    this.store.save({
      savedDevices: this.savedDevices,
      activeDeviceId: this.activeDeviceId
    })
  }
}
