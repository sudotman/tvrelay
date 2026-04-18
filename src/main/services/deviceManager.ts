import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type {
  BeginNativePairingInput,
  ConnectDeviceInput,
  ConnectionBackend,
  ConnectionState,
  DiscoveredNativeDevice,
  NativeRemoteConfig,
  PairDeviceInput,
  PendingNativePairing,
  SaveDeviceInput,
  SavedDevice
} from '@shared/types'
import { buildSerial, shouldAttemptReconnect } from './adb/parsers'
import type { AdbClient } from './adb/adbClient'
import type { DeviceStore } from './deviceStore'
import type { NativeRemoteService } from './native/nativeRemoteService'

type DeviceManagerEvents = {
  connectionState: [ConnectionState]
  devicesChanged: [SavedDevice[]]
}

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
    this.savedDevices = snapshot.savedDevices.map((device) => ({
      ...device,
      connectPort: device.connectPort ?? 5555,
      mode: device.mode ?? 'connect',
      preferredBackend: device.preferredBackend ?? 'adb',
      adbEnabled: device.adbEnabled ?? true
    }))
    this.activeDeviceId = snapshot.activeDeviceId

    this.nativeRemoteService.on('unpaired', (message) => {
      const activeDevice = this.getActiveDevice()

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
    const adbFallback = Boolean(activeDevice && canUseAdb(activeDevice))

    return {
      nativeRemote: Boolean(activeDevice && canUseNative(activeDevice)),
      adbFallback,
      typing: this.activeBackend === 'adb' || adbFallback,
      apps: this.activeBackend === 'adb' || adbFallback
    }
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

    return this.connectViaAdb(saved)
  }

  async connectDevice(input: ConnectDeviceInput): Promise<ConnectionState> {
    const existing = input.id
      ? this.savedDevices.find((device) => device.id === input.id) ?? null
      : null

    const baseDevice = existing
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
        }
      }

      if (backend === 'adb' && canUseAdb(baseDevice)) {
        try {
          return await this.connectViaAdb(baseDevice, nativeError)
        } catch (error) {
          if (nativeError) {
            throw new Error(
              `${nativeError.message} ADB fallback also failed: ${error instanceof Error ? error.message : 'Unknown error.'}`
            )
          }

          throw error
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
        return this.connectionState
      }

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

        this.updateConnectionState({
          ...liveState,
          backend: 'adb'
        })
        return this.attemptReconnect()
      } catch (error) {
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
      throw new Error('ADB fallback is not ready for this TV yet. Pair or reconnect ADB in Setup first.')
    }

    return callback(buildSerial(activeDevice))
  }

  private async connectViaNative(device: SavedDevice): Promise<ConnectionState> {
    this.updateConnectionState({
      status: 'connecting',
      backend: 'native',
      deviceId: device.id,
      message: `Connecting to ${device.name} via native remote...`
    })

    const result = await this.nativeRemoteService.connect(device)

    if (result.status === 'pairing') {
      this.activeBackend = null
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

    await this.adbClient.connect(device.host, device.connectPort)
    const nextState = await this.adbClient.getConnectionState(device)

    if (nextState.status !== 'connected') {
      this.updateConnectionState({
        ...nextState,
        backend: 'adb'
      })
      return this.connectionState
    }

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

    saved.lastConnectedAt = new Date().toISOString()
    saved.lastConnectedBackend = 'adb'
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

    saved.lastConnectedAt = new Date().toISOString()
    saved.lastConnectedBackend = 'native'
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

    return {
      id: input.id ?? randomUUID(),
      name: input.name.trim(),
      host: input.host.trim(),
      connectPort: input.connectPort ?? 5555,
      pairPort: input.pairPort,
      mode: input.mode ?? 'connect',
      preferredBackend: input.preferredBackend ?? (input.nativeRemote ? 'auto' : 'adb'),
      adbEnabled: input.adbEnabled ?? true,
      nativeRemote: input.nativeRemote,
      lastConnectedAt: input.lastConnectedAt,
      lastConnectedBackend: input.lastConnectedBackend
    }
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
