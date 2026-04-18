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
  it('updates last connection and active device when adb connect succeeds', async () => {
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
    expect(manager.getActiveDevice()?.name).toBe('Office TV')
    expect(manager.getActiveBackend()).toBe('adb')
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
    expect(nativeService.connect).toHaveBeenCalledTimes(1)
    expect(adbClient.connect).toHaveBeenCalledTimes(1)
    manager.dispose()
  })
})
