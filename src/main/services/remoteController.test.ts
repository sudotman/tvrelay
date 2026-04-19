import { describe, expect, it, vi } from 'vitest'
import { RemoteController } from './remoteController'
import type { DeviceManager } from './deviceManager'
import type { AdbClient } from './adb/adbClient'
import type { NativeRemoteService } from './native/nativeRemoteService'

function createDeviceManager(overrides?: Partial<DeviceManager>): DeviceManager {
  return {
    getActiveDevice: vi.fn().mockReturnValue({
      id: 'tv-1',
      name: 'Bedroom TV',
      host: '192.168.29.158',
      connectPort: 5555,
      mode: 'connect'
    }),
    getActiveBackend: vi.fn().mockReturnValue('adb'),
    withAdbAccess: vi.fn().mockImplementation(async <T>(callback: (serial: string) => Promise<T>) =>
      callback('192.168.29.158:5555')
    ),
    ...overrides
  } as unknown as DeviceManager
}

describe('RemoteController', () => {
  it('returns structured feedback when a command is sent', async () => {
    const adbClient = {
      sendKey: vi.fn().mockResolvedValue(undefined)
    } as unknown as AdbClient

    const controller = new RemoteController(
      createDeviceManager(),
      adbClient,
      {} as NativeRemoteService
    )

    const feedback = await controller.sendCommand('home')

    expect(feedback.status).toBe('sent')
    expect(feedback.kind).toBe('remote')
    expect(feedback.command).toBe('home')
    expect(adbClient.sendKey).toHaveBeenCalledOnce()
  })

  it('blocks repeated power commands during cooldown', async () => {
    const adbClient = {
      sendKey: vi.fn().mockResolvedValue(undefined)
    } as unknown as AdbClient

    const controller = new RemoteController(
      createDeviceManager(),
      adbClient,
      {} as NativeRemoteService
    )

    const first = await controller.sendCommand('power')
    const second = await controller.sendCommand('power')

    expect(first.status).toBe('sent')
    expect(second.status).toBe('blocked')
    expect(second.cooldownMs).toBeGreaterThan(0)
    expect(adbClient.sendKey).toHaveBeenCalledTimes(1)
  })
})
