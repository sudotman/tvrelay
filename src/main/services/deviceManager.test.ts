import { describe, expect, it, vi } from 'vitest'
import { DeviceManager } from './deviceManager'
import type { AdbClient } from './adb/adbClient'
import type { DeviceStore } from './deviceStore'
import type { NativeRemoteService } from './native/nativeRemoteService'

function createStore(snapshot?: { savedDevices?: any[]; activeDeviceId?: string | null }): DeviceStore {
  let data = {
    savedDevices: snapshot?.savedDevices ?? [],
    activeDeviceId: snapshot?.activeDeviceId ?? null
  }

  return {
    load: () => data,
    save: (next) => {
      data = next
    }
  }
}

function createNativeRemoteService(overrides?: Partial<NativeRemoteService>): NativeRemoteService {
  return {
    on: vi.fn(),
    disconnect: vi.fn(),
    discoverDevices: vi.fn().mockResolvedValue([]),
    connect: vi.fn(),
    completePairing: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
    getPendingPairing: vi.fn().mockReturnValue(null),
    sendKey: vi.fn(),
    sendAppLink: vi.fn(),
    ...overrides
  } as unknown as NativeRemoteService
}

describe('DeviceManager', () => {
  it('updates last connection and health when adb connect succeeds', async () => {
    const adbClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      getConnectionState: vi.fn().mockResolvedValue({ status: 'connected', deviceId: 'tv-1' })
    } as unknown as AdbClient

    const manager = new DeviceManager(createStore(), adbClient, createNativeRemoteService())
    await manager.init()
    const state = await manager.connectDevice({
      id: 'tv-1',
      name: 'Office TV',
      host: '192.168.1.8',
      connectPort: 5555,
      mode: 'connect'
    })

    expect(state.status).toBe('connected')
    expect(state.backend).toBe('adb')
    expect(manager.getActiveDevice()?.backendHealth?.adb.ready).toBe(true)
    expect(manager.listDevices()[0]?.lastConnectedAt).toBeTruthy()
    manager.dispose()
  })

  it('retries reconnect during adb health checks when device drops', async () => {
    const adbClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      getConnectionState: vi
        .fn()
        .mockResolvedValueOnce({ status: 'connected', deviceId: 'tv-1' })
        .mockResolvedValueOnce({ status: 'disconnected', deviceId: 'tv-1' })
        .mockResolvedValueOnce({ status: 'connected', deviceId: 'tv-1' })
    } as unknown as AdbClient

    const manager = new DeviceManager(createStore(), adbClient, createNativeRemoteService())
    await manager.init()
    await manager.connectDevice({
      id: 'tv-1',
      name: 'Office TV',
      host: '192.168.1.8',
      connectPort: 5555,
      mode: 'connect'
    })

    const state = await manager.performHealthCheck()
    expect(state.status).toBe('connected')
    expect(adbClient.connect).toHaveBeenCalledTimes(2)
    manager.dispose()
  })

  it('prefers native remote when available in auto mode', async () => {
    const nativeService = createNativeRemoteService({
      connect: vi.fn().mockResolvedValue({
        status: 'connected',
        certificate: { key: 'native-key', cert: 'native-cert' }
      }),
      isConnected: vi.fn().mockReturnValue(true)
    })

    const adbClient = {
      connect: vi.fn(),
      getConnectionState: vi.fn()
    } as unknown as AdbClient

    const manager = new DeviceManager(createStore(), adbClient, nativeService)
    await manager.init()

    const state = await manager.connectDevice({
      id: 'tv-2',
      name: 'Living Room',
      host: '192.168.1.9',
      preferredBackend: 'auto',
      nativeRemote: {
        remotePort: 6466,
        pairingPort: 6467
      },
      adbEnabled: true,
      connectPort: 5555
    })

    expect(state.backend).toBe('native')
    expect(manager.getActiveBackend()).toBe('native')
    expect(manager.getActiveDevice()?.backendHealth?.native.ready).toBe(true)
    expect(nativeService.connect).toHaveBeenCalledTimes(1)
    expect(adbClient.connect).not.toHaveBeenCalled()
    manager.dispose()
  })

  it('falls back to adb when native remote fails in auto mode', async () => {
    const nativeService = createNativeRemoteService({
      connect: vi.fn().mockRejectedValue(new Error('Native remote timed out.'))
    })

    const adbClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      getConnectionState: vi.fn().mockResolvedValue({ status: 'connected', deviceId: 'tv-3' })
    } as unknown as AdbClient

    const manager = new DeviceManager(createStore(), adbClient, nativeService)
    await manager.init()

    const state = await manager.connectDevice({
      id: 'tv-3',
      name: 'Bedroom TV',
      host: '192.168.1.10',
      preferredBackend: 'auto',
      nativeRemote: {
        remotePort: 6466,
        pairingPort: 6467
      },
      adbEnabled: true,
      connectPort: 5555
    })

    expect(state.backend).toBe('adb')
    expect(manager.getActiveBackend()).toBe('adb')
    expect(manager.getActiveDevice()?.backendHealth?.native.lastError).toContain('Native remote timed out')
    expect(adbClient.connect).toHaveBeenCalledTimes(1)
    manager.dispose()
  })

  it('persists favorites and recent app launches per tv', async () => {
    const adbClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      getConnectionState: vi.fn().mockResolvedValue({ status: 'connected', deviceId: 'tv-5' })
    } as unknown as AdbClient

    const manager = new DeviceManager(createStore(), adbClient, createNativeRemoteService())
    await manager.init()

    await manager.connectDevice({
      id: 'tv-5',
      name: 'Family TV',
      host: '192.168.1.14',
      connectPort: 5555,
      mode: 'connect'
    })

    await manager.toggleFavoriteApp('com.netflix.ninja')
    await manager.recordAppLaunch('com.netflix.ninja')
    await manager.recordAppLaunch('com.google.android.youtube.tv')

    const active = manager.getActiveDevice()
    expect(active?.favorites).toEqual(['com.netflix.ninja'])
    expect(active?.recentApps?.map((entry) => entry.packageName)).toEqual([
      'com.google.android.youtube.tv',
      'com.netflix.ninja'
    ])
    manager.dispose()
  })

  it('classifies missing adb and recommends next actions', async () => {
    const adbClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      getConnectionState: vi.fn().mockResolvedValue({ status: 'connected', deviceId: 'tv-6' })
    } as unknown as AdbClient

    const manager = new DeviceManager(createStore(), adbClient, createNativeRemoteService())
    await manager.init()
    await manager.connectDevice({
      id: 'tv-6',
      name: 'Guest Room',
      host: '192.168.1.16',
      connectPort: 5555,
      mode: 'connect'
    })

    const health = await manager.getHealth(false)

    expect(health?.issues[0]?.code).toBe('adb_missing')
    expect(health?.recommendedActions).toEqual([])
    manager.dispose()
  })

  it('classifies adb pair required when the tv expects pairing', async () => {
    const adbClient = {
      connect: vi.fn().mockRejectedValue(new Error('failed')),
      getConnectionState: vi.fn().mockResolvedValue({ status: 'disconnected', deviceId: 'tv-7' }),
      listDevices: vi.fn().mockResolvedValue([])
    } as unknown as AdbClient

    const manager = new DeviceManager(createStore(), adbClient, createNativeRemoteService())
    await manager.init()
    await manager.saveDevice({
      id: 'tv-7',
      name: 'Pairing TV',
      host: '192.168.1.17',
      connectPort: 5555,
      pairPort: 37099,
      mode: 'pair',
      adbEnabled: true
    })
    await manager.connectDevice({ id: 'tv-7' }).catch(() => undefined)

    const health = await manager.runAdbTroubleshooting(true)

    expect(health?.issues[0]?.code).toBe('adb_pair_required')
    expect(health?.recommendedActions).toContain('pair_adb')
    manager.dispose()
  })

  it('classifies unauthorized adb during troubleshooting', async () => {
    const adbClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      getConnectionState: vi.fn().mockResolvedValue({ status: 'unauthorized', deviceId: 'tv-8' }),
      listDevices: vi
        .fn()
        .mockResolvedValue([{ serial: '192.168.1.18:5555', state: 'unauthorized' }])
    } as unknown as AdbClient

    const manager = new DeviceManager(createStore(), adbClient, createNativeRemoteService())
    await manager.init()
    await manager.saveDevice({
      id: 'tv-8',
      name: 'Unauthorized TV',
      host: '192.168.1.18',
      connectPort: 5555,
      mode: 'connect',
      adbEnabled: true
    })
    await manager.connectDevice({ id: 'tv-8' }).catch(() => undefined)

    const health = await manager.runAdbTroubleshooting(true)

    expect(health?.issues[0]?.code).toBe('adb_unauthorized')
    expect(health?.recommendedActions).toContain('connect_adb')
    manager.dispose()
  })

  it('classifies native pairing stalled and suggests switching to adb', async () => {
    const nativeService = createNativeRemoteService({
      getPendingPairing: vi.fn().mockReturnValue({
        deviceId: 'tv-9',
        name: 'Living Room',
        host: '192.168.1.19'
      })
    })
    const adbClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      getConnectionState: vi.fn().mockResolvedValue({ status: 'connected', deviceId: 'tv-9' })
    } as unknown as AdbClient

    const manager = new DeviceManager(createStore(), adbClient, nativeService)
    await manager.init()
    await manager.saveDevice({
      id: 'tv-9',
      name: 'Living Room',
      host: '192.168.1.19',
      connectPort: 5555,
      mode: 'connect',
      adbEnabled: true,
      nativeRemote: {
        remotePort: 6466,
        pairingPort: 6467
      }
    })
    await manager.connectDevice({ id: 'tv-9' }).catch(() => undefined)

    const health = await manager.getHealth(true)

    expect(health?.issues.some((issue) => issue.code === 'native_pairing_stalled')).toBe(true)
    expect(health?.recommendedActions).toContain('switch_to_adb')
    manager.dispose()
  })
})
