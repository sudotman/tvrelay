import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type {
  BackendHealthSnapshot,
  BeginNativePairingInput,
  ConnectDeviceInput,
  ConnectionBackend,
  ConnectionState,
  DeviceHealthStatus,
  DiscoveredNativeDevice,
  HealthIssue,
  NativeRemoteConfig,
  PairDeviceInput,
  PendingNativePairing,
  RecommendedAction,
  SaveDeviceInput,
  SavedDevice
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

function canUseNative(device: SavedDevice): boolean {
  return Boolean(device.nativeRemote)
}

function canUseAdb(device: SavedDevice): boolean {
  return device.adbEnabled !== false
}

function getBackendOrder(device: SavedDevice): ConnectionBackend[] {
  const preferred = device.preferredBackend ?? 'adb'

  if (preferred === 'native') {
    return ['native']
  }

  if (preferred === 'adb') {
    return ['adb']
  }

  return ['native', 'adb']
}

function createBackendHealthSnapshot(overrides?: Partial<BackendHealthSnapshot>): BackendHealthSnapshot {
  return {
    available: false,
    ready: false,
    ...overrides
  }
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
  backendHealth?: SavedDevice['backendHealth']
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
    this.savedDevices = snapshot.savedDevices.map((device) =>
      this.normalizeDevice({
        ...device
      })
    )
    this.activeDeviceId = snapshot.activeDeviceId

    this.nativeRemoteService.on('unpaired', (message) => {
      const activeDevice = this.getActiveDevice()

      if (activeDevice) {
        this.updateBackendHealth(activeDevice.id, 'native', {
          available: canUseNative(activeDevice),
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

    if (this.getActiveDevice()) {
      await this.attemptReconnect()
    }

    this.healthCheckTimer = setInterval(() => {
      void this.performHealthCheck()
    }, 7_000)
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
    const adbEnabled = Boolean(activeDevice && canUseAdb(activeDevice))

    return {
      nativeRemote: Boolean(activeDevice && canUseNative(activeDevice)),
      adbFallback: adbEnabled,
      typing: this.activeBackend === 'adb' || adbEnabled,
      apps: this.activeBackend === 'adb' || adbEnabled
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
        available: canUseNative(activeDevice),
        ready: false,
        lastState: 'pairing',
        lastError: 'Native pairing is still waiting for a code from the TV.'
      })
      return this.getHealth(adbAvailable)
    }

    try {
      const devices = await this.adbClient.listDevices()
      const liveState = deriveConnectionState(devices, buildSerial(activeDevice), activeDevice.id)

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

      if (activeDevice.mode === 'pair' && activeDevice.pairPort) {
        this.updateBackendHealth(activeDevice.id, 'adb', {
          available: true,
          ready: false,
          lastState: 'pairing',
          lastError: `Pair ADB with ${activeDevice.host}:${activeDevice.pairPort} before reconnecting.`
        })
        return this.getHealth(adbAvailable)
      }

      await this.adbClient.connect(activeDevice.host, activeDevice.connectPort)
      const nextState = await this.adbClient.getConnectionState(activeDevice)

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

  async saveDevice(input: SaveDeviceInput): Promise<SavedDevice> {
    const existing = input.id
      ? this.savedDevices.find((item) => item.id === input.id) ?? null
      : null

    const device = this.normalizeDevice({
      ...existing,
      ...input,
      id: input.id ?? existing?.id ?? randomUUID()
    })

    this.savedDevices = this.savedDevices.filter((item) => item.id !== device.id)
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
      this.activeDeviceId === deviceId || pendingNativePairing?.id === deviceId

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

    if (favorites.has(packageName)) {
      favorites.delete(packageName)
    } else {
      favorites.add(packageName)
    }

    return this.replaceDevice(activeDevice.id, {
      favorites: [...favorites].sort()
    })
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

    const result = await this.nativeRemoteService.connect(saved)

    if (result.status === 'pairing') {
      this.activeBackend = null
      return this.connectionState
    }

    return this.finalizeNativeConnection(saved, result.certificate)
  }

  async completeNativePairing(code: string): Promise<ConnectionState> {
    const activeDevice = this.getActiveDevice()

    if (!activeDevice) {
      throw new Error('No TV is currently waiting for a native remote pairing code.')
    }

    const certificate = await this.nativeRemoteService.completePairing(code)
    return this.finalizeNativeConnection(activeDevice, certificate)
  }

  async pairAndConnect(input: PairDeviceInput): Promise<ConnectionState> {
    this.updateConnectionState({
      status: 'pairing',
      backend: 'adb',
      message: `Pairing ADB with ${input.host}:${input.pairPort}...`
    })

    await this.adbClient.pair(input.host, input.pairPort, input.code)

    const saved = await this.saveDevice({
      name: input.name,
      host: input.host,
      connectPort: input.connectPort,
      pairPort: input.pairPort,
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
    const existing = input.id
      ? this.savedDevices.find((device) => device.id === input.id) ?? null
      : null

    const baseDeviceDraft = existing
      ? this.normalizeDevice({
          ...existing,
          ...input,
          id: existing.id
        })
      : this.normalizeDevice({
          id: input.id ?? randomUUID(),
          name: input.name?.trim() || input.host || 'Android TV',
          host: input.host,
          connectPort: input.connectPort,
          pairPort: input.pairPort,
          mode: input.mode,
          preferredBackend: input.preferredBackend,
          nativeRemote: input.nativeRemote,
          adbEnabled: input.adbEnabled
        })

    const baseDevice = await this.saveDevice({
      id: baseDeviceDraft.id,
      name: baseDeviceDraft.name,
      host: baseDeviceDraft.host,
      connectPort: baseDeviceDraft.connectPort,
      pairPort: baseDeviceDraft.pairPort,
      mode: baseDeviceDraft.mode,
      preferredBackend: baseDeviceDraft.preferredBackend,
      nativeRemote: baseDeviceDraft.nativeRemote,
      adbEnabled: baseDeviceDraft.adbEnabled
    })

    this.activeDeviceId = baseDevice.id
    this.persist()

    let nativeError: Error | null = null

    for (const backend of getBackendOrder(baseDevice)) {
      if (backend === 'native' && canUseNative(baseDevice)) {
        try {
          const result = await this.connectViaNative(baseDevice)

          if (result.status === 'pairing') {
            return this.connectionState
          }

          return result
        } catch (error) {
          nativeError = error instanceof Error ? error : new Error('Native remote connection failed.')
          this.updateBackendHealth(baseDevice.id, 'native', {
            available: true,
            ready: false,
            lastState: 'error',
            lastError: nativeError.message
          })
        }
      }

      if (backend === 'adb' && canUseAdb(baseDevice)) {
        try {
          return await this.connectViaAdb(baseDevice, nativeError)
        } catch (error) {
          const adbError = error instanceof Error ? error : new Error('ADB connection failed.')
          this.updateBackendHealth(baseDevice.id, 'adb', {
            available: true,
            ready: false,
            lastState: 'error',
            lastError: adbError.message
          })

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
        available: this.activeBackend === 'adb' ? canUseAdb(activeDevice) : canUseNative(activeDevice),
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

    await this.adbClient.connect(activeDevice.host, activeDevice.connectPort)
    const state = await this.adbClient.getConnectionState(activeDevice)

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

    return callback(buildSerial(activeDevice))
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

    await this.adbClient.connect(device.host, device.connectPort)
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
        ...saved.backendHealth?.adb,
        available: true,
        ready: true,
        lastCheckedAt: now,
        lastConnectedAt: now,
        lastError: undefined,
        lastState: 'ready'
      }),
      native: createBackendHealthSnapshot({
        ...saved.backendHealth?.native,
        available: canUseNative(saved),
        ready: false,
        lastCheckedAt: now,
        lastState: saved.backendHealth?.native.lastState ?? 'disconnected',
        lastConnectedAt: saved.backendHealth?.native.lastConnectedAt,
        lastError: saved.backendHealth?.native.lastError
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
        ...saved.backendHealth?.adb,
        available: canUseAdb(saved),
        ready: saved.backendHealth?.adb.ready ?? false,
        lastCheckedAt: now,
        lastConnectedAt: saved.backendHealth?.adb.lastConnectedAt,
        lastState: saved.backendHealth?.adb.lastState,
        lastError: saved.backendHealth?.adb.lastError
      }),
      native: createBackendHealthSnapshot({
        ...saved.backendHealth?.native,
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
      case 'adb_connect_failed':
        actions.push('connect_adb')
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

    if (!canUseNative(device)) {
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
      preferredBackend: input.preferredBackend ?? (nativeRemote ? 'auto' : 'adb'),
      adbEnabled,
      nativeRemote,
      lastConnectedAt: input.lastConnectedAt,
      lastConnectedBackend: input.lastConnectedBackend,
      cachedApps: input.cachedApps,
      favorites: [...new Set(input.favorites ?? [])],
      recentApps: (input.recentApps ?? []).slice(0, RECENT_APPS_LIMIT),
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

  private replaceDevice(deviceId: string, patch: Partial<SavedDevice>): SavedDevice {
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
    this.emitDevicesChanged()
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

    return this.replaceDevice(deviceId, {
      backendHealth: {
        adb: backend === 'adb' ? nextSnapshot : createBackendHealthSnapshot(existing.backendHealth?.adb),
        native:
          backend === 'native' ? nextSnapshot : createBackendHealthSnapshot(existing.backendHealth?.native)
      }
    })
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
